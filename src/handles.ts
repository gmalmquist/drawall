interface KnobProps {
  poly: () => Polygon;
  fill?: CanvasColor;
  stroke?: CanvasColor;
  parent: Entity,
}

interface HandleProps {
  getPos: () => Position;
  distance?: (p: Position) => Distance;
  drag?: () => DragItem;
  clickable?: boolean;
  draggable?: boolean;
  hoverable?: boolean;
  selectable?: boolean;
  priority?: number;
  cursor?: () => Cursor;
  onDelete?: () => 'keep' | 'kill';
  visible?: () => boolean;
  knob?: KnobProps;
  tools?: Array<ToolName>,
  control?: boolean;
}

class Surfaced extends Component implements Surface, Solo {
  public readonly [SOLO] = true;

  constructor(
    entity: Entity, 
    public readonly getSurface: () => EntityRef<Surface>) {
    super(entity);
  }

  intersects(sdf: SDF): boolean {
    return this.getSurface().map(s => s.intersects(sdf)).or(false);
  }

  containedBy(sdf: SDF): boolean {
    return this.getSurface().map(s => s.containedBy(sdf)).or(false);
  }
}

class Lever extends Component {
  private readonly handle: Handle;
  private readonly tangentRef: RoRef<Vector>;

  constructor(
    entity: Entity,
    private readonly parent: Handle,
    public readonly origin: RoRef<Position>,
    public readonly position: Ref<Position>,
    cursor?: Cursor,
  ) {
    super(entity);
    this.handle = entity.ecs.createEntity().add(Handle, {
      draggable: true,
      clickable: false,
      selectable: false,
      hoverable: false,
      control: true,
      visible: () => this.visible,
      getPos: () => position.get(),
      distance: p => new Circle(position.get(), Distance(5, 'screen')).sdist(p),
      cursor: typeof cursor === 'undefined' ? undefined : (() => cursor),
      priority: parent.priority + 0.5,
      tools: Array.from(parent.tools),
      drag: () => ({
        name: 'handle',
        kind: 'point',
        get: () => position.get(),
        set: p => position.set(p),
        disableWhenMultiple: true,
      }),
    });
    this.tangentRef = Refs.memoReduce(
      (a, b, _) => Vectors.between(a.to('screen'), b.to('screen')).unit(),
      origin, position, App.viewport.changedRef,
    );
  }

  get tangent(): Vector {
    return this.tangentRef.get();
  }

  get visible(): boolean {
    return this.parent.isSelected;
  }

  override tearDown() {
    this.handle.entity.destroy();
  }
}

class Dragging extends Component implements Solo {
  public readonly [SOLO] = true;

  constructor(entity: Entity) {
    super(entity);
  }
}

class Hovered extends Component implements Solo {
  public readonly [SOLO] = true;

  constructor(entity: Entity) {
    super(entity);
  }

  unhover() {
    this.entity.removeAll(Hovered);
  }
}

class Selected extends Component implements Solo {
  public readonly [SOLO] = true;
  public readonly selectionIndex: number;

  constructor(entity: Entity) {
    super(entity);
    this.selectionIndex = App.ecs.getComponents(Selected).length;
  }

  deselect() {
    this.entity.removeAll(Selected);
  }
}

class Handle extends Component implements Solo {
  public readonly [SOLO] = true;

  public readonly events = new UiEventDispatcher(Handle);

  private readonly distanceFunc: (p: Position) => Distance;
  private _cursor: () => Cursor | null;
  private readonly getPos: () => Position;
  private readonly _onDelete: (() => 'keep' | 'kill') | undefined;
  private readonly _visible: () => boolean;
  private readonly _drag: () => DragItem;
  private readonly _knob: KnobProps | undefined;
  private readonly knobs: Handle[] = [];
  private readonly _tools: Set<ToolName>;

  public clickable: boolean = true;
  public draggable: boolean = true;
  public hoverable: boolean = true;
  public selectable: boolean = true;
  public ignoreNonPrimary: boolean = true;
  public priority: number = 0;
  public control: boolean = false;

  constructor(entity: Entity, private readonly props: HandleProps) {
    super(entity);

    this.priority = typeof props.priority === 'undefined' ? 0 : props.priority;
    this.clickable = typeof props.clickable === 'undefined' ? true : props.clickable;
    this.draggable = typeof props.draggable === 'undefined' ? true : props.draggable;
    this.hoverable = typeof props.hoverable === 'undefined' ? true : props.hoverable;
    this.selectable = typeof props.selectable === 'undefined' ? true : props.selectable;
    this._cursor = typeof props.cursor === 'undefined' ? () => null : props.cursor;
    this._visible = typeof props.visible === 'undefined' ? (() => true) : props.visible;
    this._drag = typeof props.drag === 'undefined' ? Drags.empty : props.drag;

    this._tools = new Set(props.tools || []);
    this.control = !!props.control;

    this.getPos = props.getPos;
    this._onDelete = props.onDelete;
    this._knob = props.knob;

    const defaultDistanceFunc = (p: Position) => Distances.between(props.getPos(), p);
    this.distanceFunc = typeof props.distance === 'undefined'
      ? defaultDistanceFunc : props.distance;
  }

  isSpecificallyFor(name: ToolName) {
    return this._tools.has(name);
  }

  isForTool(name: ToolName) {
    return this._tools.size === 0 || this._tools.has(name);
  }

  get tools(): ToolName[] {
    return Array.from(this._tools);
  }

  selectWithAppropriateTool() {
    const tools = this.tools;
    if (tools.length === 0) {
      App.tools.set('pointer tool');
      return;
    }
    for (const tool of tools) {
      App.tools.set(tool);
      App.ui.clearSelection();
      App.ui.select(this);
      return;
    }
  }

  get knob(): KnobProps | null {
    const k = this._knob;
    if (typeof k === 'undefined') {
      return null;
    }
    return { ...k };
  }

  createKnob(
    props: Omit<KnobProps, 'parent'>,
    handleProps: Partial<HandleProps>,
  ): Handle {
    const knob = this.entity.ecs.createEntity().add(Handle, {
      ...handleProps,
      knob: { ...props, parent: this.entity, },
      distance: p => props.poly().sdist(p).max(Distance(0, 'model')),
      getPos: () => props.poly().centroid,
    });
    this.addKnob(knob);
    return knob;
  }

  addKnob(knob: Handle) {
    this.knobs.push(knob);
    this.tools.forEach(t => knob._tools.add(t));
  }

  getDragClosure(type: 'minimal' | 'complete'): DragClosure {
    return Drags.closure(type, this.getDragItem());
  }

  getDragItem(): DragItem {
    return this._drag();
  }

  getContextualCursor(): Cursor {
    // if already selected, prioritize showing the user that this can be dragged.
    // otherwise, prioritize highlighting that this can be clicked.
    if (this.clickable && !App.ui.dragging && !this.isSelected) {
      return 'pointer';
    }
    if (this.draggable) {
      const nonSpecific = App.ui.dragging ? 'grabbing' : 'grab';
      if (App.ui.selection.size > 1 || this.cursor === null) {
        return nonSpecific;
      }
      return this.cursor;
    }
    return this.clickable ? 'pointer' : 'default';
  }

  /** user initiated delete event. */
  public delete(): boolean {
    if (this.entity.isDestroyed) {
      return false; // we're already dead ....
    }
    // tries to "nicely" delete this by asking permission first.
    if (typeof this._onDelete !== 'undefined') {
      if (this._onDelete() === 'keep') {
        return false;
      }
    }
    this.entity.destroy();
    return true;
  }

  public intersects(sdf: SDF): boolean {
    if (this.entity.has(Surfaced)) {
      return this.entity.only(Surfaced).intersects(sdf);
    }
    return sdf.contains(this.getPos());
  }

  public containedBy(sdf: SDF): boolean {
    if (this.entity.has(Surfaced)) {
      return this.entity.only(Surfaced).containedBy(sdf);
    }
    return sdf.contains(this.getPos());
  }

  get visible(): boolean {
    return this._visible();
  }

  get cursor(): Cursor | null {
    return this._cursor();
  }

  get isHovered(): boolean {
    return this.entity.has(Hovered);
  }

  get isSelected(): boolean {
    return this.entity.has(Selected);
  }

  get isActive(): boolean {
    return this.isHovered || this.isSelected || this.dragging;
  }

  get dragging(): boolean {
    return this.entity.has(Dragging);
  }

  set dragging(d: boolean) {
    if (d) this.entity.getOrCreate(Dragging);
    else this.entity.removeAll(Dragging);
  }

  set hovered(h: boolean) {
    if (h) {
      this.entity.add(Hovered);
    } else {
      this.entity.removeAll(Hovered);
    }
  }

  set selected(s: boolean) {
    if (!s) {
      this.entity.removeAll(Selected);
      this.hovered = false;
    } else {
      this.entity.add(Selected);
    }
  }

  get pos(): Position {
    return this.props.getPos();
  }

  distanceFrom(p: Position): Distance {
    return this.distanceFunc(p);
  }

  override tearDown() {
    for (const knob of this.knobs) {
      knob.entity.destroy();
    }
  }

  public override toJson(): SavedComponent {
    return {
      factory: this.constructor.name,
      arguments: [{
        clickable: this.clickable,
        draggable: this.draggable,
        hoverable: this.hoverable,
        selectable: this.selectable,
        priority: this.priority,
        tools: this.tools,
      }],
    };
  }

  public static load(entity: Entity, props: {
    clickable: boolean,
    draggable: boolean,
    hoverable: boolean,
    selectable: boolean,
    priority: number,
    tools: ToolName[],
  }): Handle | 'not ready' {
    const handle = entity.maybe(Handle);
    if (!handle) return 'not ready';
    handle.clickable = props.clickable;
    handle.draggable = props.draggable;
    handle.hoverable = props.hoverable;
    handle.selectable = props.selectable;
    handle.priority = props.priority || 0;
    (props.tools || []).forEach(t => handle._tools.add(t));
    return handle;
  }
}

ComponentFactories.register(Handle, Handle.load);


