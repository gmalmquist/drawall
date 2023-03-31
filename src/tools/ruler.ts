class RulerTool extends Tool {
  private hoveredPhysHandle: Handle | null = null;

  constructor() {
    super('ruler tool');
  }

  override get icon(): URL {
    return Icons.rulerTool;
  }

  override get allowSnap(): boolean {
    return true;
  }

  get cursor(): Cursor {
    return `url('${Icons.rulerCursor}') 4 4, default`;
  }

  override onToolSelected() {
    App.ui.clearSelection();
    App.ui.snapping.enabled = false;
  }

  override setup() {
    this.events.onMouse('move', e => {
      if (App.ui.dragging) return;

      const handle = App.ui.getHandleAt(e.position);


      if (handle === null) {
        App.ui.clearHovered();
        App.pane.style.cursor = this.cursor;
        this.hoveredPhysHandle = null;
        return;
      }

      if (this.isRulerHandle(handle)) {
        App.ui.setHovered(handle);
        App.pane.style.cursor = 'grab';
        this.hoveredPhysHandle = null;
        return;
      }

      if (handle.entity.has(PhysEdge) || handle.entity.has(PhysNode)) {
        App.pane.style.cursor = this.cursor;
        this.hoveredPhysHandle = handle;
      }
    });

    this.events.onMouse('down', e => {
      if (App.ui.dragging) return;

      const handle = App.ui.getHandleAt(e.position);
      if (handle === null) {
        App.ui.clearSelection();
        return;
      }

      if (this.isRulerHandle(handle)) {
        App.ui.select(handle);
        return;
      }
    });

    type DragState = { events?: UiEventDispatcher, ruler?: Ruler };
    this.events.addDragListener<DragState>({
      onStart: (e) => {
        const handle = App.ui.getHandleAt(e.start);
        if (handle !== null && this.isRulerHandle(handle)) {
          const events = App.ui.getDefaultDragHandler(h => this.isRulerHandle(h));
          events.handleDrag(e);
          return { events };
        }

        App.pane.style.cursor = this.cursor;
        const ruler = App.ecs.createEntity().add(Ruler);
        ruler.start.with(s => s.dragTo(e.start));
        ruler.end.with(s => s.dragTo(e.start.plus(e.delta)));
        return { ruler };
      },
      onUpdate: (e, { ruler, events }) => {
        ruler?.end?.with(s => s.dragTo(e.start.plus(e.delta)));
        events?.handleDrag(e);
      },
      onEnd: (e, { ruler, events }) => {
        ruler?.end?.with(s => s.dragTo(e.start.plus(e.delta)));
        events?.handleDrag(e);
        if (ruler) {
          App.ui.setSelection(ruler.entity.only(Handle));
        }
        App.pane.style.cursor = this.cursor;
      },
    });
  }

  override update() {
    const handle = this.hoveredPhysHandle;
    if (handle === null || App.ui.dragging) {
      return;
    }

    if (handle.entity.has(PhysEdge)) {
      const edge = handle.entity.only(PhysEdge).edge.unwrap();
      if (edge === null) return;
      const point = edge.closestPoint(App.ui.mousePos);
      const flip = edge.normal.dot(Vectors.between(point, App.ui.mousePos)).sign;
      const offsetX = edge.tangent.to('screen').unit()
        .scale(Distance(50, 'screen').min(edge.length.scale(0.75)))
        .scale(0.5);
      const offsetY = edge.normal.to('screen').unit()
        .scale(Distance(7, 'screen')).scale(flip);
      App.canvas.setLineDash([5, 3]);
      App.canvas.lineWidth = 2;
      App.canvas.strokeStyle = BLUE;
      App.canvas.strokeLine(
        point.plus(offsetY).plus(offsetX),
        point.plus(offsetY).minus(offsetX),
      );
      App.canvas.lineWidth = 1;
      App.canvas.setLineDash([]);
      return;
    }

    if (handle.entity.has(PhysNode)) {
      const vertex = handle.entity.only(PhysNode).pos;
      App.canvas.setLineDash([5, 3]);
      App.canvas.lineWidth = 2;
      App.canvas.strokeStyle = BLUE;
      App.canvas.strokeCircle(vertex, Distance(20, 'screen'));
      App.canvas.lineWidth = 1;
      App.canvas.setLineDash([]);
    }
  }

  private isRulerHandle(handle: Handle): boolean {
    return handle.entity.has(Ruler) || handle.entity.has(RulerEndpoint);
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
    
    const handle = entity.add(Handle, {
      priority: 2,
      visible: Ruler.areRulersVisible,
      getPos: () => this.pos,
      setPos: p => this.dragTo(p),
      distance: p => {
        const attach = this.attachment;
        const position = this.posRef.unwrap();
        if (position === null) return Distance(Number.POSITIVE_INFINITY, 'screen');
        if (attach.kind === 'vertex') {
          return Vectors.between(p, position).mag()
            .minus(this.handleRingRadius).abs();
        }
        if (attach.kind === 'edge') {
          return attach.edge.flatMap(e => e.edge).map(edge => {
            const w = this.handlebarWidth;
            const offset = this.handlebarOffset;
            return new SpaceEdge(
              position.splus(w.scale(0.5), edge.tangent).plus(offset),
              position.splus(w.scale(-0.5), edge.tangent).plus(offset),
            ).distance(p);
          }).or(Vectors.between(p, position).mag());
        }
        if (attach.kind === 'canvas') {
          return this.ruler.flatMap(r => r.edge).map(edge => {
            const w = this.handlebarWidth;
            return new SpaceEdge(
              position.splus(w.scale(0.5), edge.normal),
              position.splus(w.scale(-0.5), edge.normal)
            ).distance(p);
          }).or(Vectors.between(p, position).mag());
        }
        return impossible(attach);
      },
      drag: () => ({
        kind: 'point',
        name: this.name,
        get: () => this.pos,
        set: p => this.dragTo(p),
      }),
      onDelete: () => {
        this.ruler.map(x => x.entity).with(x => x.destroy());
        this.twin.map(x => x.entity).with(x => x.destroy());
        this.entity.destroy();
        return 'kill';
      },
    });

    handle.events.onMouse('down', e => {
      this.ruler.with(r => {
        const h = r.entity.only(Handle);
        h.selected = true;
      });
    });

    handle.events.onMouse('move', e => {
      this.ruler.with(r => {
        const h = r.entity.only(Handle);
        h.hovered = true;
      });
    });
  }

  override addForce(force: Vector) {
    const attach = this.attachment;
    if (attach.kind === 'canvas') {
      attach.position.with(p => p.addForce(force));
      return;
    }
    if (attach.kind === 'vertex') {
      if (this.twin.map(twin => twin.attachment.kind === 'canvas').or(false)) {
        this.twin.with(twin => twin.addForce(force.neg()));
        return;
      }
      attach.position.with(p => p.addForce(force));
      return;
    }
    if (attach.kind === 'edge') {
      if (this.twin.map(twin => twin.attachment.kind === 'canvas').or(false)) {
        this.twin.with(twin => twin.addForce(force.neg()));
        return;
      }
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

  get handlebarOffset(): Vector {
    if (this.attachment.kind !== 'edge') {
      return Vector(Vec.ZERO, 'screen');
    }
    const rulerMidpoint = this.ruler.flatMap(r => r.edge).map(e => e.midpoint).unwrap();
    if (rulerMidpoint === null) {
      return Vector(Vec.ZERO, 'screen');
    }

    const other = this.attachment.edge.flatMap(e => e.edge).unwrap()!;
    const flip = other.normal.dot(Vectors.between(this.pos, rulerMidpoint)).sign;
    return other.normal.scale(flip).scale(Distance(7, 'screen'));
  }

  get handleRingRadius(): Distance {
    return Distance(20, 'screen');
  }

  get handlebarWidth(): Distance {
    const edge = this.ruler.flatMap(ruler => ruler.edge).unwrap();
    if (edge === null) return Distance(0, 'screen');

    const handlebarWidth = Distance(100, 'screen').to('model')
      .min(edge.length.scale(0.3));

    if (this.attachment.kind === 'edge') {
      const other = this.attachment.edge.flatMap(e => e.edge).unwrap();
      if (other !== null) {
        return handlebarWidth.min(other.length.scale(0.75));
      }
    }
    return handlebarWidth;
  }

  dragTo(pos: Position) {
    // this is different from just a straightforward set pos = p,
    // because we might attach to a wall something.

    const filter = (handle: Handle): boolean => ( 
      !handle.entity.has(RulerEndpoint) && !handle.entity.has(Ruler)
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
            //const ray = new SpaceRay(twinEdge.lerp(twin.attachment.at), twinEdge.normal);
            //const hit = ray.intersection(edge);
            //if (hit === null) return edge.midpoint;
            //const at = clamp01(edge.unlerp(hit.point));
            //return edge.lerp(at);
            return edge.closestPoint(twinEdge.lerp(twin.attachment.at));
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
  public static readonly areRulersVisible = (): boolean => {
    return App.tools.current.name === 'ruler tool' || App.settings.showLengths.get();
  };

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

    entity.add(
      LengthConstraint,
      () => this.start.unwrap()!,
      () => this.end.unwrap()!,
    );

    const handle = entity.add(Handle, {
      getPos: () => this.phys.flatMap(e => e.edge)
        .map(e => e.midpoint)
        .or(Position(Point.ZERO, 'screen')),
      setPos: p => { /* todo */ },
      distance: p => this.phys.flatMap(e => e.edge)
        .map(e => e.distance(p))
        .or(Distance(Number.POSITIVE_INFINITY, 'screen')),
      visible: Ruler.areRulersVisible,
      drag: () => ({
        kind: 'group',
        aggregate: 'all',
        name: this.name,
        items: [ this.start, this.end ]
          .map(ref => ref.unwrap())
          .filter(r => r !== null)
          .map(e => e!.entity.only(Handle).getDragItem()),
      }),
    });

    handle.events.addDragListener({
      onStart: e => {
        const edge = this.phys.flatMap(phys => phys.edge).unwrap();
        if (edge === null) {
          return null;
        }
        const start = this.start.unwrap()!;
        const end = this.end.unwrap()!;
        return {
          start,
          end,
          srcDelta: Vectors.between(e.start, edge.src),
          dstDelta: Vectors.between(e.start, edge.dst),
        };
      },
      onUpdate: (e, { start, end, srcDelta, dstDelta }) => {
        const pos = e.start.plus(e.delta);
        start.dragTo(pos.plus(srcDelta));
        end.dragTo(pos.plus(dstDelta));
      },
      onEnd: (e, nodes) => {
      },
    });
  }

  public get edge(): EntityRef<SpaceEdge> {
    return this.phys.flatMap(e => e.edge);
  }

  tearDown() {
    this.start.with(x => x.entity.destroy());
    this.end.with(x => x.entity.destroy());
  }
}

const RulerRenderer = (ecs: EntityComponentSystem) => {
  if (!Ruler.areRulersVisible()) return;

  for (const ruler of ecs.getComponents(Ruler)) {
    const edge = ruler.edge.unwrap();
    if (edge === null) {
      continue;
    }
  
    const rulerActive = ruler.entity.ref(r => r.only(Handle))
      .map(h => h.isActive)
      .or(false);

    const distance = edge.length.get('model');

    const constraint = ruler.entity.only(LengthConstraint);
    const error = constraint?.enabled ? edge.length.get('model') - constraint.length : 0;
    const dispLength = App.project.displayUnit.from(
      App.project.modelUnit.newAmount(edge.length.get('model'))
    );
    const dispError = App.project.modelUnit.newAmount(error);
    dispError.value = Math.round(dispError.value);
    const hasError = Math.abs(dispError.value) > 0;
    const decimals = App.project.displayDecimals;
    const lengthText = App.project.displayUnit.format(dispLength, decimals);
    const errorTextU = App.project.displayUnit.format(dispError, decimals);
    const errorText = dispError.value >= 0 ? `+${errorTextU}` : errorTextU;
    const distanceLabel = hasError ? `${lengthText} (${errorText})` : lengthText;

    App.canvas.text({
      text: distanceLabel,
      fill: rulerActive ? 'black' : 'grey',
      point: edge.midpoint,
      align: 'center',
      baseline: 'middle',
      shadow: hasError ? PINK : undefined,
    });

    const primaryColor = BLUE;

    const fontSize = App.settings.fontSize;
    const labelGap = Distance(fontSize, 'screen').to('model');
    const endpointGap = Distance(14, 'screen').to('model');

    App.canvas.lineWidth = rulerActive ? 2 : 1;
    App.canvas.strokeStyle = rulerActive ? primaryColor : 'gray';
    App.canvas.setLineDash(constraint.enabled ? [] : [5, 3]);
    App.canvas.strokeLine(
      edge.src.splus(endpointGap, edge.tangent),
      edge.midpoint.splus(labelGap, edge.tangent.neg()),
    );
    App.canvas.strokeLine(
      edge.dst.splus(endpointGap, edge.tangent.neg()),
      edge.midpoint.splus(labelGap, edge.tangent),
    );

    const renderEndpoint = (endpoint: RulerEndpoint) => {
      const endpointActive = rulerActive || endpoint.entity.ref(r => r.only(Handle))
        .map(h => h.isActive)
        .or(false);
      App.canvas.strokeStyle = endpointActive ? primaryColor : 'gray';
      const handlebarWidth = endpoint.handlebarWidth;

      const position = endpoint.posRef.unwrap();
      if (position === null) {
        return;
      }

      const attachment = endpoint.attachment;

      if (attachment.kind === 'canvas') {
        App.canvas.strokeLine(
          position.splus(handlebarWidth.div(2), edge.normal),
          position.splus(handlebarWidth.div(2), edge.normal.neg()),
        );
        return;
      }

      if (attachment.kind === 'edge') {
        const other = attachment.edge.flatMap(e => e.edge).unwrap();
        if (other === null) return;

        const inward = other.normal.dot(Vectors.between(position, edge.midpoint)).sign < 0
          ? other.normal.neg() : other.normal;

        const offset1 = inward.scale(endpointGap.scale(0.5));
        const offset2 = inward.scale(endpointGap.scale(0.5).plus(Distance(3, 'screen')));

        App.canvas.setLineDash([]);
        App.canvas.strokeLine(
          position.splus(handlebarWidth.div(2), other.tangent).plus(offset1),
          position.splus(handlebarWidth.div(2), other.tangent.neg()).plus(offset1),
        );
        App.canvas.strokeLine(
          position.splus(handlebarWidth.div(2.5), other.tangent).plus(offset2),
          position.splus(handlebarWidth.div(2.5), other.tangent.neg()).plus(offset2),
        );
        return;
      }

      if (attachment.kind === 'vertex') {
        App.canvas.strokeCircle(position, endpoint.handleRingRadius);
        return;
      }

      return impossible(attachment);
    };

    ruler.start.with(renderEndpoint);
    ruler.end.with(renderEndpoint);
    App.canvas.setLineDash([]);
  }
};

