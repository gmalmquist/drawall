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
        ruler.start.dragTo(e.start);
        ruler.end.dragTo(e.start.plus(e.delta));
        return { ruler };
      },
      onUpdate: (e, { ruler, events }) => {
        if (ruler) {
          ruler.end.dragTo(e.start.plus(e.delta));
        }
        events?.handleDrag(e);
      },
      onEnd: (e, { ruler, events }) => {
        if (ruler) {
          ruler.end.dragTo(e.start.plus(e.delta));
        }
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
      const edge = handle.entity.only(PhysEdge).edge;
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
  node: PhysNode;
}

interface RulerAttachmentVertex {
  kind: 'vertex';
  node: PhysNode;
}

interface RulerAttachmentEdge {
  kind: 'edge',
  node: PhysEdge;
  at?: number;
}

class RulerEndpoint extends Component implements PointMass, Solo {
  public readonly [SOLO] = true;

  private _attachment: Ref<RulerAttachment>;
  public readonly position: RoRef<Position>;

  constructor(
    entity: Entity,
    private readonly ruler: Ruler,
  ) {
    super(entity);

    this._attachment = Refs.of<RulerAttachment>({
      kind: 'canvas',
      node: entity.ecs.createEntity().add(PhysNode),
    }, areEq);

    this.position = Refs.flatMapRo(Refs.memo(
      this._attachment,
      attach => this.getAttachmentPosition(attach)
    ), x => x);

    const handle = entity.add(Handle, {
      priority: 2,
      visible: Ruler.areRulersVisible,
      getPos: () => this.pos,
      distance: p => {
        const attach = this.attachment;
        const position = this.position.get();
        if (position === null) return Distance(Number.POSITIVE_INFINITY, 'screen');
        if (attach.kind === 'vertex') {
          return Vectors.between(p, position).mag()
            .minus(this.handleRingRadius).abs();
        }
        if (attach.kind === 'edge') {
          const edge = attach.node.edge;
          const w = this.handlebarWidth;
          const offset = this.handlebarOffset;
          return new SpaceEdge(
            position.splus(w.scale(0.5), edge.tangent).plus(offset),
            position.splus(w.scale(-0.5), edge.tangent).plus(offset),
          ).distance(p);
        }
        if (attach.kind === 'canvas') {
          const edge = this.ruler.edge;
          const w = this.handlebarWidth;
          return new SpaceEdge(
            position.splus(w.scale(0.5), edge.normal),
            position.splus(w.scale(-0.5), edge.normal)
          ).distance(p);
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
        this.ruler.entity.destroy();
        this.twin.entity.destroy();
        this.entity.destroy();
        return 'kill';
      },
    });

    handle.events.onMouse('down', e => {
      this.ruler.entity.only(Handle).selected = true;
    });

    handle.events.onMouse('move', e => {
      this.ruler.entity.only(Handle).hovered = true;
    });
  }

  private get twin(): RulerEndpoint {
    return this.ruler.start === this ? this.ruler.end : this.ruler.start;
  }

  get pos(): Position {
    return this.position.get();
  }

  addForce(force: Vector) {
    const attach = this.attachment;
    if (attach.kind !== 'canvas' && this.twin.attachment.kind === 'canvas') {
      this.twin.addForce(force.neg());
      return;
    }
    attach.node.addForce(force);
  }

  get handlebarOffset(): Vector {
    if (this.attachment.kind !== 'edge') {
      return Vector(Vec.ZERO, 'screen');
    }
    const rulerMidpoint = this.ruler.edge.midpoint;
    const other = this.attachment.node.edge;
    const flip = other.normal.dot(Vectors.between(this.pos, rulerMidpoint)).sign;
    return other.normal.scale(flip).scale(Distance(7, 'screen'));
  }

  get handleRingRadius(): Distance {
    return Distance(20, 'screen');
  }

  get handlebarWidth(): Distance {
    const edge = this.ruler.edge;
    const handlebarWidth = Distance(100, 'screen').to('model')
      .min(edge.length.scale(0.3));

    if (this.attachment.kind === 'edge') {
      const other = this.attachment.node.edge;
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
        node: vertex,
      };
      return;
    }

    const edge = App.ui.getHandleAt(
      pos, 
      handle => filter(handle) && handle.entity.has(PhysEdge),
    )?.entity?.only(PhysEdge);

    if (edge) {
      const node = edge;
      if (this.twin.isAnchored) {
        this.attachment = { kind: 'edge', node };
        return;
      }
      this.attachment = {
        kind: 'edge',
        node,
        at: clamp01(node.edge.unlerp(pos)),
      };
      return;
    }

    const existing = this.attachment;
    if (existing.kind === 'canvas') {
      existing.node.pos = pos;
      return;
    }

    const node = this.entity.ecs.createEntity().add(PhysNode);
    node.pos = pos;
    this.attachment = {
      kind: 'canvas',
      node,
    };
  }

  isAttachedTo(e: Entity): boolean {
    return e == this.attachment.node.entity;
  }

  private getAttachmentPosition(attach: RulerAttachment): RoRef<Position> {
    if (attach.kind === 'canvas' || attach.kind === 'vertex') {
      return Refs.ro(attach.node.position);
    }
    if (attach.kind === 'edge') {
      return attach.node.edgeRef.map(edge => {
        if (typeof attach.at !== 'undefined') {
          return edge.lerp(attach.at);
        }
        const twin = this.twin;
        if (twin.attachment.kind === 'edge') {
          const twinEdge = twin.attachment.node.edge;
          if (typeof twin.attachment.at === 'undefined'
            || !twin.attachment.node.entity.isAlive) {
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
          const position = twin.attachment.node.pos;
          if (position !== null) {
            return edge.closestPoint(position);
          }
          return position !== null ? position : edge.midpoint; 
        }
        return impossible(twin.attachment);
      });
    }
    return impossible(attach);
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
    return this._attachment.get();
  }

  set attachment(attach: RulerAttachment) {
    if (this.attachment === attach) {
      return;
    }
    const prev = this.attachment;
    this._attachment.set(attach);

    if (prev.kind === 'canvas') {
      prev.node.entity.destroy();
    }
  }

  tearDown() {
    if (this.attachment.kind === 'canvas') {
      this.attachment.node.entity.destroy();
    }
  }
}

ComponentFactories.register(RulerEndpoint, (entity: Entity) => 'skip');

class Ruler extends Component implements Solo {
  public static readonly areRulersVisible = (): boolean => {
    return App.tools.current.name === 'ruler tool' || App.settings.showLengths.get();
  };

  public readonly [SOLO] = true;
  public readonly start: RulerEndpoint;
  public readonly end: RulerEndpoint;
  public readonly phys: PhysEdge;

  constructor(entity: Entity) {
    super(entity);

    this.start = entity.ecs.createEntity().add(RulerEndpoint, this);
    this.end = entity.ecs.createEntity().add(RulerEndpoint, this);
    this.phys = entity.add(PhysEdge, Refs.ofRo(this.start), Refs.ofRo(this.end));

    entity.add(LengthConstraint);

    const handle = entity.add(Handle, {
      getPos: () => this.phys.edge.midpoint,
      distance: p => this.phys.edge.distanceFrom(p),
      visible: Ruler.areRulersVisible,
      drag: () => ({
        kind: 'group',
        aggregate: 'all',
        name: this.name,
        items: [ this.start, this.end ].map(e => e.entity.only(Handle).getDragItem()),
      }),
    });

    handle.events.addDragListener({
      onStart: e => {
        const edge = this.phys.edge;
        const start = this.start;
        const end = this.end;
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

  public get edge(): MemoEdge {
    return this.phys.edge;
  }

  override toJson(): SavedComponent {
    const attach = (end: RulerEndpoint): JsonObject => {
      const attach = end.attachment;
      if (attach.kind === 'canvas') {
        return {
          kind: attach.kind,
          position: MoreJson.position.to(attach.node.pos),
        };
      }
      if (attach.kind === 'vertex') {
        return {
          kind: attach.kind,
          node: attach.node.entity.id,
        };
      }
      if (attach.kind === 'edge') {
        return {
          kind: attach.kind,
          edge: attach.node.entity.id,
          at: typeof attach.at !== 'undefined' ? attach.at : false,
        };
      }
      return impossible(attach);
    };
    return {
      factory: this.constructor.name,
      arguments: [attach(this.start), attach(this.end)],
    };
  }

  tearDown() {
    this.start.entity.destroy();
    this.end.entity.destroy();
  }
}

ComponentFactories.register(Ruler, (
  entity: Entity,
  startJson: JsonObject,
  endJson: JsonObject,
) => {
  const ruler = entity.getOrCreate(Ruler);

  const load = (end: RulerEndpoint, a: JsonObject): boolean => {
    const kind = a.kind! as string;
    if (kind === 'canvas') {
      const pos = MoreJson.position.from(a.position! as JsonObject);
      end.dragTo(pos);
      return true;
    }
    if (kind === 'vertex') {
      const v = entity.ecs.getEntity(a.node! as Eid)?.maybe(PhysNode);
      if (!v) return false;
      end.dragTo(v.pos);
      return true;
    }
    if (kind === 'edge') {
      const edge = entity.ecs.getEntity(a.edge as Eid)
        ?.maybe(PhysEdge)?.edge;
      if (!edge || edge.length.get('model') === 0) return false;
      if (a.at === false) {
        end.dragTo(edge.midpoint);
        return true;
      }
      end.dragTo(edge.lerp(a.at! as number));
      return true;
    }
    throw new Error(`unrecognized ruler endpoint kind: '${kind}'`);
  };

  const start = ruler.start;
  const end = ruler.end;

  if (start !== null && !load(start, startJson)) {
    return 'not ready';
  }

  if (end !== null && !load(end, endJson)) {
    return 'not ready';
  }

  return ruler;
});

const RulerRenderer = (ecs: EntityComponentSystem) => {
  if (!Ruler.areRulersVisible()) return;

  for (const ruler of ecs.getComponents(Ruler)) {
    if (!ruler.start.attachment.node.entity.isAlive
      || !ruler.end.attachment.node.entity.isAlive) {
      ruler.entity.destroy();
      continue;
    }
    const edge = ruler.edge;
  
    const rulerActive = ruler.entity.maybe(Handle)?.isActive;
    const distance = edge.length.get('model');

    const constraint = ruler.entity.only(LengthConstraint);
    const label = constraint.label;

    App.canvas.text({
      text: label.text,
      fill: rulerActive ? 'black' : 'grey',
      point: edge.midpoint,
      align: 'center',
      baseline: 'middle',
      shadow: label.status !== 'satisfied' ? PINK : undefined,
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

      const position = endpoint.position.get();
      const attachment = endpoint.attachment;

      if (attachment.kind === 'canvas') {
        App.canvas.strokeLine(
          position.splus(handlebarWidth.div(2), edge.normal),
          position.splus(handlebarWidth.div(2), edge.normal.neg()),
        );
        return;
      }

      if (attachment.kind === 'edge') {
        const other = attachment.node.edge;

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

    renderEndpoint(ruler.start);
    renderEndpoint(ruler.end);
    App.canvas.setLineDash([]);
  }
};

