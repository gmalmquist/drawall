interface KnobProps {
  poly: () => Polygon;
  fill?: CanvasColor;
  stroke?: CanvasColor;
  parent: Entity,
}

interface HandleProps {
  getPos: () => Position;
  // TODO obsolete; delete
  setPos?: (p: Position) => void;
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

class Rectangular extends Component implements Solo {
  public readonly [SOLO] = true;

  private static posEq = (one: Position, two: Position): boolean => {
    if (one.space !== two.space) return false;
    const a = one.get(one.space);
    const b = two.get(two.space);
    return Math.abs(a.x - b.x) < 0.01
      && Math.abs(a.y - b.y) < 0.01;
  };

  private static distEq = (one: Distance, two: Distance) => {
    if (one.space !== two.space) return false;
    const a = one.get(one.space);
    const b = two.get(two.space);
    return Math.abs(a - b) < 0.01;
  };

  public readonly centerRef = Refs.of(Positions.zero('model'), Rectangular.posEq);
  public readonly widthRef = Refs.of(Distances.zero('model'), Rectangular.distEq);
  public readonly heightRef = Refs.of(Distances.zero('model'), Rectangular.distEq);
  // vectors from left to right and top to bottom
  private readonly horizontal: RoRef<Vector>;
  private readonly vertical: RoRef<Vector>;
  // horizontal & vertical extents from center
  private readonly leftSpan: RoRef<Vector>;
  private readonly rightSpan: RoRef<Vector>;
  private readonly upSpan: RoRef<Vector>;
  private readonly downSpan: RoRef<Vector>;
  // edge centers
  private readonly topRef: RoRef<Position>;
  private readonly leftRef: RoRef<Position>;
  private readonly rightRef: RoRef<Position>;
  private readonly bottomRef: RoRef<Position>;
  // corners
  private readonly topLeftRef: RoRef<Position>;
  private readonly topRightRef: RoRef<Position>;
  private readonly bottomLeftRef: RoRef<Position>;
  private readonly bottomRightRef: RoRef<Position>;

  constructor(entity: Entity) {
    super(entity);

    this.horizontal = Refs.memoReduce(
      (width: Distance, _: boolean) =>
        Vector(Axis.X, 'screen').to('model').unit().scale(width),
      this.widthRef, App.viewport.changedRef,
    );
    this.vertical = Refs.memoReduce(
      (height: Distance, _: boolean) =>
        Vector(Axis.Y, 'screen').to('model').unit().scale(height),
      this.heightRef, App.viewport.changedRef,
    );

    const spanCalc = (scale: number) => (extent: Vector): Vector => extent.scale(scale);

    // directional extents from centroid
    this.upSpan = Refs.memoReduce(spanCalc(-0.5), this.vertical);
    this.downSpan = Refs.memoReduce(spanCalc(0.5), this.vertical);
    this.leftSpan = Refs.memoReduce(spanCalc(-0.5), this.horizontal);
    this.rightSpan = Refs.memoReduce(spanCalc(0.5), this.horizontal);

    const aplusb = (a: Position, b: Vector) => a.plus(b);

    // edge midpoints
    this.topRef = Refs.memoReduce(aplusb, this.centerRef, this.upSpan);
    this.bottomRef = Refs.memoReduce(aplusb, this.centerRef, this.downSpan);
    this.leftRef = Refs.memoReduce(aplusb, this.centerRef, this.leftSpan);
    this.rightRef = Refs.memoReduce(aplusb, this.centerRef, this.rightSpan);

    // corners
    this.topLeftRef = Refs.memoReduce(aplusb, this.topRef, this.leftSpan);
    this.topRightRef = Refs.memoReduce(aplusb, this.topRef, this.rightSpan);
    this.bottomLeftRef = Refs.memoReduce(aplusb, this.bottomRef, this.leftSpan);
    this.bottomRightRef = Refs.memoReduce(aplusb, this.bottomRef, this.rightSpan);
  }

  public contains(position: Position) {
    const halfplanes: Array<readonly [RoRef<Position>, RoRef<Vector>]> = [
      [this.topRef, this.downSpan],
      [this.bottomRef, this.upSpan],
      [this.leftRef, this.rightSpan],
      [this.rightRef, this.leftSpan],
    ];
    return halfplanes.every(([origin, normal]) =>
      Vectors.between(origin.get(), position).dot(normal.get()).sign >= 0
    );
  }

  public containedBy(sdf: SDF) {
    return [this.topRef, this.bottomRef, this.leftRef, this.rightRef].every(pos =>
      sdf.contains(pos.get())
    );
  }

  public intersects(sdf: SDF) {
    if (this.containedBy(sdf)) return true;
    const edges: Array<readonly [RoRef<Position>, RoRef<Vector>]> = [
      [this.topLeftRef, this.horizontal],
      [this.bottomLeftRef, this.horizontal],
      [this.topLeftRef, this.vertical],
      [this.topRightRef, this.vertical],
    ];
    for (const [corner, extent] of edges) {
      const hit = sdf.raycast(new SpaceRay(corner.get(), extent.get()));
      if (hit !== null && hit.time >= 0 && hit.time <= 1) {
        return true;
      }
    }
    return false;
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

  public clickable: boolean = true;
  public draggable: boolean = true;
  public hoverable: boolean = true;
  public selectable: boolean = true;
  public ignoreNonPrimary: boolean = true;
  public priority: number = 0;

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

    this.getPos = props.getPos;
    this._onDelete = props.onDelete;
    this._knob = props.knob;

    const defaultDistanceFunc = (p: Position) => Distances.between(props.getPos(), p);
    this.distanceFunc = typeof props.distance === 'undefined'
      ? defaultDistanceFunc : props.distance;
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
      setPos: _ => { /* noop */ },
    });
    this.addKnob(knob);
    return knob;
  }

  addKnob(knob: Handle) {
    this.knobs.push(knob);
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

  set pos(p: Position) {
    const setPos = this.props.setPos;
    if (typeof setPos === 'undefined') {
      return;
    }
    setPos(p);
  }

  distanceFrom(p: Position): Distance {
    return this.distanceFunc(p);
  }

  override tearDown() {
    for (const knob of this.knobs) {
      knob.entity.destroy();
    }
  }
}

