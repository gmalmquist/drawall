class RulerTool extends Tool {
  constructor() {
    super('ruler tool');
  }

  override get icon(): URL {
    return Icons.rulerTool;
  }

  get cursor(): Cursor {
    return `url('${Icons.rulerCursor}') 4 4, default`;
  }

  override onToolSelected() {
    App.ui.clearSelection();
  }

  override setup() {
    this.events.addDragListener<Ruler>({
      onStart: (e) => {
        const ruler = App.ecs.createEntity().add(Ruler);
        ruler.start.with(s => s.dragTo(e.start));
        ruler.end.with(s => s.dragTo(e.position));
        return ruler;
      },
      onUpdate: (e, ruler) => {
        ruler.end.with(s => s.dragTo(e.position));
      },
      onEnd: (e, ruler) => {
        ruler.end.with(s => s.dragTo(e.position));
      },
    });
  }

  override update() {
  }
}

App.tools.register(RulerTool);

type RulerAttachment = RulerAttachmentCanvas | RulerAttachmentVertex | RulerAttachmentEdge;

interface RulerAttachmentCanvas {
  kind: 'canvas';
  position: EntityRef<PhysNode>;
}

interface RulerAttachmentVertex {
  kind: 'vertex';
  position: EntityRef<PhysNode>;
}

interface RulerAttachmentEdge {
  kind: 'edge',
  edge: EntityRef<PhysEdge>;
  at?: number;
}

class RulerEndpoint extends PhysNode implements Solo {
  public readonly [SOLO] = true;

  private _attachment: RulerAttachment;

  constructor(
    entity: Entity,
    private readonly ruler: EntityRef<Ruler>,
    private readonly twin: EntityRef<RulerEndpoint>,
  ) {
    super(entity);
    this._attachment = {
      kind: 'canvas',
      position: entity.ecs.createEntity().add(PhysNode).ref(),
    };
    
    entity.add(Handle, {
      priority: 1,
      clickable: false,
      getPos: () => this.pos,
      setPos: p => this.dragTo(p),
      onDelete: () => {
        this.ruler.map(x => x.entity).with(x => x.destroy());
        this.twin.map(x => x.entity).with(x => x.destroy());
        this.entity.destroy();
        return 'kill';
      },
    });
  }

  override addForce(force: Vector) {
    const attach = this.attachment;
    if (attach.kind === 'canvas' || attach.kind === 'vertex') {
      attach.position.with(p => p.addForce(force));
      return;
    }
    if (attach.kind === 'edge') {
      attach.edge.with(e => e.addForce(force));
      return;
    }
    return impossible(attach);
  }

  override set pos(p: Position) {
  }

  override get pos(): Position {
    const pos = this.posRef.unwrap();
    if (pos === null) {
      return Position(Point.ZERO, 'model');
    }
    return pos;
  }

  dragTo(pos: Position) {
    // this is different from just a straightforward set pos = p,
    // because we might attach to a wall something.

    const filter = (handle: Handle): boolean => ( 
      handle.entity !== this.entity
      && handle.entity !== this.twin.map(t => t.entity).unwrap()
      && handle.entity !== this.ruler.map(r => r.entity).unwrap()
      && !this.twin.map(t => t.isAttachedTo(handle.entity)).or(false)
    );
      
    const vertex = App.ui.getHandleAt(
      pos, 
      handle => filter(handle) && handle.entity.has(PhysNode),
    )?.entity?.only(PhysNode);
    if (vertex) {
      this.attachment = {
        kind: 'vertex',
        position: vertex.ref(),
      };
      return;
    }

    const edge = App.ui.getHandleAt(
      pos, 
      handle => filter(handle) && handle.entity.has(PhysEdge),
    )?.entity?.only(PhysEdge);
    if (edge) {
      if (this.twin.map(t => t.isAnchored).or(false)) {
        this.attachment = { kind: 'edge', edge: edge.ref() };
        return;
      }
      this.attachment = {
        kind: 'edge',
        edge: edge.ref(),
        at: edge.edge.map(edge => {
          const s = edge.unlerp(edge.closestPoint(pos));
          App.canvas.lineWidth = 1;
          App.canvas.strokeStyle = 'red';
          App.canvas.strokeLine(pos, edge.lerp(s));
          return s;
        }).or(undefined),
      };
      return;
    }

    const existing = this.attachment;
    if (existing.kind === 'canvas') {
      existing.position.with(p => p.pos = pos);
      return;
    }

    const node = this.entity.ecs.createEntity().add(PhysNode);
    node.pos = pos;
    this.attachment = {
      kind: 'canvas',
      position: node.ref(),
    };
  }

  isAttachedTo(e: Entity): boolean {
    const attach = this.attachment;
    if (attach.kind === 'canvas' || attach.kind === 'vertex') {
      return e === attach.position.map(v => v.entity).unwrap();
    }
    if (attach.kind === 'edge') {
      return e === attach.edge.map(e => e.entity).unwrap();
    }
    return impossible(attach);
  }

  get posRef(): EntityRef<Position> {
    return this.ref().flatMap((): EntityRef<Position> => {
      const attach = this.attachment;
      if (attach.kind === 'canvas' || attach.kind === 'vertex') {
        return attach.position.map(p => p.pos);
      }
      if (attach.kind === 'edge') {
        return attach.edge.flatMap(e => e.edge).map((edge): Position => {
          if (typeof attach.at !== 'undefined') {
            return edge.lerp(attach.at);
          }
          const twin = this.twin.unwrap();
          if (twin === null) {
            return edge.midpoint;
          }
          if (twin.attachment.kind === 'edge') {
            const twinEdge = twin.attachment.edge.flatMap(e => e.edge).unwrap();
            if (twinEdge === null) {
              return edge.midpoint;
            }
            if (typeof twin.attachment.at === 'undefined' || !twin.attachment.edge.isAlive) {
              // this really shouldn't happen, but if it does,
              // give up and use our midpoint.
              return edge.midpoint;
            }
            const ray = new SpaceRay(twinEdge.lerp(twin.attachment.at), twinEdge.normal);
            const hit = ray.intersection(edge);
            if (hit === null) return edge.midpoint;
            const at = clamp01(edge.unlerp(hit.point));
            return edge.lerp(at); 
          }
          if (twin.attachment.kind === 'vertex' || twin.attachment.kind === 'canvas') {
            const position = twin.attachment.position.map(p => p.pos).unwrap();
            if (position !== null) {
              return edge.closestPoint(position);
            }
            return position !== null ? position : edge.midpoint; 
          }
          return impossible(twin.attachment);
        });
      }
      return impossible(attach);
    });
  }

  get isAnchored(): boolean {
    const attach = this.attachment;
    if (attach.kind === 'canvas') {
      return false;
    }
    if (attach.kind === 'vertex') {
      return true;
    }
    if (attach.kind === 'edge') {
      return typeof attach.at !== 'undefined';
    }
    return impossible(attach);
  }

  get attachment(): RulerAttachment {
    return this._attachment;
  }

  set attachment(attach: RulerAttachment) {
    if (this._attachment === attach) {
      return;
    }
    const prev = this._attachment;
    this._attachment = attach;

    if (prev.kind === 'canvas') {
      prev.position.with(node => node.entity.destroy());
    }
  }

  tearDown() {
    if (this._attachment.kind === 'canvas') {
      this._attachment.position.with(node => node.entity.destroy());
    }
  }
}


class Ruler extends Component implements Solo {
  public readonly [SOLO] = true;
  public readonly start: EntityRef<RulerEndpoint>;
  public readonly end: EntityRef<RulerEndpoint>;
  public readonly phys: EntityRef<PhysEdge>;

  constructor(entity: Entity) {
    super(entity);

    this.start = entity.ecs.createEntity().add(
      RulerEndpoint,
      this.ref(),
      this.ref().flatMap(r => r.end),
    ).ref();

    this.end = entity.ecs.createEntity().add(
      RulerEndpoint,
      this.ref(),
      this.ref().flatMap(r => r.start),
    ).ref();

    this.phys = entity.add(PhysEdge, () => this.start, () => this.end).ref();

    entity.add(Handle, {
      getPos: () => this.phys.flatMap(e => e.edge).map(e => e.midpoint)
        .or(Position(Point.ZERO, 'screen')),
      setPos: p => { /* todo */ },
    });

    entity.add(
      LengthConstraint,
      () => this.start.unwrap()!,
      () => this.end.unwrap()!,
    );
  }

  public get edge(): EntityRef<SpaceEdge> {
    return this.phys.flatMap(e => e.edge);
  }
}

const RulerRenderer = (ecs: EntityComponentSystem) => {
  if (App.tools.current.name !== 'ruler tool' && !App.settings.showLengths) {
    return;
  }
  for (const ruler of ecs.getComponents(Ruler)) {
    const edge = ruler.edge.unwrap();
    if (edge === null) {
      continue;
    }
   
    const distance = edge.length.get('model');

    const roundAmount = (a: Amount): Amount => ({ value: Math.round(a.value), unit: a.unit });

    const constraint = ruler.entity.only(LengthConstraint);
    const error = constraint?.enabled ? edge.length.get('model') - constraint.length : 0;
    const dispLength = App.project.displayUnit.from(
      roundAmount(App.project.modelUnit.newAmount(edge.length.get('model')))
    );
    const dispError = App.project.modelUnit.newAmount(error);
    dispError.value = Math.round(dispError.value);
    const hasError = Math.abs(dispError.value) > 0;
    const lengthText = App.project.displayUnit.format(dispLength);
    const errorTextU = App.project.displayUnit.format(dispError);
    const errorText = dispError.value >= 0 ? `+${errorTextU}` : errorTextU;
    const distanceLabel = hasError ? `${lengthText} (${errorText})` : lengthText;

    App.canvas.text({
      text: distanceLabel,
      fill: 'black',
      point: edge.midpoint,
      align: 'center',
      baseline: 'middle',
      shadow: hasError ? PINK : undefined,
    });

    const fontSize = App.settings.fontSize;
    const labelGap = Distance(fontSize, 'screen').to('model');

    App.canvas.lineWidth = 1;
    App.canvas.strokeStyle = 'black';
    App.canvas.setLineDash([10, 10]);
    App.canvas.strokeLine(edge.src, edge.midpoint.splus(labelGap, edge.tangent.neg()));
    App.canvas.strokeLine(edge.dst, edge.midpoint.splus(labelGap, edge.tangent));
    App.canvas.setLineDash([]);

    const handlebarWidth = Distance(100, 'screen').to('model')
      .min(edge.length.scale(0.3));

    const start = ruler.start.unwrap()!;
    App.canvas.strokeLine(
      edge.src.splus(handlebarWidth.div(2), edge.normal),
      edge.src.splus(handlebarWidth.div(2), edge.normal.neg()),
    );
    App.canvas.strokeLine(
      edge.dst.splus(handlebarWidth.div(2), edge.normal),
      edge.dst.splus(handlebarWidth.div(2), edge.normal.neg()),
    );
  }
};

