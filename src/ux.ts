// this file is maybe poorly named, but it has code for user interactions
// like clicking and dragging

const PINK = '#F5A9B8';
const BLUE = '#5BCEFA';

interface NamedAxis {
  name: string;
  direction: Vector;
  points?: Position[];
}

interface Snapping {
  snapByDefault: boolean;
  localAxes?: () => NamedAxis[];
  preferredAxis?: () => NamedAxis;
  allowLocal?: boolean;
  allowGlobal?: boolean;
  allowGeometry?: boolean;
}

interface HandleProps {
  getPos: () => Position;
  setPos?: (p: Position) => void;
  distance?: (p: Position) => Distance;
  clickable?: boolean;
  draggable?: boolean;
  hoverable?: boolean;
  selectable?: boolean;
  priority?: number;
  cursor?: () => Cursor;
  snapping?: Snapping;
  onDelete?: () => 'keep' | 'kill';
  visible?: () => boolean;
}

type CursorBuiltin = 'default' | 'none' | 'help' | 'context-menu'
  | 'pointer' | 'progress' | 'wait' | 'cell' | 'crosshair'
  | 'text' | 'vertical-text' | 'alias' | 'copy' | 'move'
  | 'no-drop' | 'grab' | 'grabbing' | 'all-scroll' | 'col-resize'
  | 'row-resize' | 'n-resize' | 's-resize' | 'w-resize' | 'e-resize'
  | 'ne-resize' | 'nw-resize' | 'se-resize' | 'sw-resize'
  | 'ew-resize' | 'ns-resize' | 'nesw-resize' | 'nwse-resize'
  | 'zoom-in' | 'zoom-out';

type CursorCustom = `url('${string}')` | `url('${string}') ${number} ${number}`;

type CursorSingle = CursorBuiltin | CursorCustom; 

type CursorWithFallback = `${CursorSingle}, ${CursorSingle}`;

type Cursor = CursorSingle | CursorWithFallback;



const getResizeCursor = (direction: Vector, bidirectional: boolean = true): Cursor => {
  const dir = direction.get('screen');
  const options: Array<readonly [Vec, Cursor, Cursor]> = [
    [new Vec( 0,-1), 'n-resize', 'ns-resize'],
    [new Vec(+1,-1), 'ne-resize', 'nesw-resize'],
    [new Vec(+1, 0), 'e-resize', 'ew-resize'], // ew gross
    [new Vec(+1,+1), 'se-resize', 'nwse-resize'],
    [new Vec( 0,+1), 's-resize', 'ns-resize'],
    [new Vec(-1,+1), 'sw-resize', 'nesw-resize'],
    [new Vec(-1, 0), 'w-resize', 'ew-resize'], // ew gross
    [new Vec(-1,-1), 'nw-resize', 'nwse-resize'],
  ];
  const map = new Map<Cursor, Vec>();
  for (const [vec, uni, bi] of options) {
    map.set(bidirectional ? bi : uni, vec.unit());
  }
  const compare = (a: Vec, b: Vec): number => {
    const d = a.dot(b);
    return bidirectional ? Math.abs(d) : d;
  };
  const choices = Array.from(map.keys());
  return choices.reduce(
    (a, b) => compare(dir, map.get(a)!) >= compare(dir, map.get(b)!) ? a : b,
    choices[0]!,
  );
};


class Form extends Component {
  constructor(
    entity: Entity,
    private factory: (() => AutoForm) | null = null,
  ) {
    super(entity);
  }

  setFactory(f: () => AutoForm) {
    this.factory = f;
  }

  public get form(): AutoForm {
    return this.factory === null ? new AutoForm() : this.factory();
  }
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

  public clickable: boolean = true;
  public draggable: boolean = true;
  public hoverable: boolean = true;
  public selectable: boolean = true;
  public ignoreNonPrimary: boolean = true;
  public priority: number = 0;
  public readonly snapping: Snapping | undefined;

  constructor(entity: Entity, private readonly props: HandleProps) {
    super(entity);

    this.priority = typeof props.priority === 'undefined' ? 0 : props.priority;
    this.clickable = typeof props.clickable === 'undefined' ? true : props.clickable;
    this.draggable = typeof props.draggable === 'undefined' ? true : props.draggable;
    this.hoverable = typeof props.hoverable === 'undefined' ? true : props.hoverable;
    this.selectable = typeof props.selectable === 'undefined' ? true : props.selectable;
    this._cursor = typeof props.cursor === 'undefined' ? () => null : props.cursor;
    this._visible = typeof props.visible === 'undefined' ? (() => true) : props.visible;

    this.getPos = props.getPos;
    this._onDelete = props.onDelete; 

    this.snapping = props.snapping;

    const defaultDistanceFunc = (p: Position) => Distances.between(props.getPos(), p);
    this.distanceFunc = typeof props.distance === 'undefined'
      ? defaultDistanceFunc : props.distance;

    if (typeof props.setPos !== 'undefined') {
      const setPos = props.setPos!;
      this.events.addDragListener({
        onStart: (e) => {
          return props.getPos();
        },
        onUpdate: (e, start: Position) => {
          setPos(start.plus(e.delta));
        },
        onEnd: (e, start: Position) => {
          setPos(start.plus(e.delta));
          return start;
        },
      });
    }
  }

  getContextualCursor(): Cursor {
    // if already selected, prioritize showing the user that this can be dragged.
    // otherwise, prioritize highlighting that this can be clicked.
    if (this.isSelected && this.draggable) {
      const nonSpecific = App.ui.dragging ? 'grabbing' : 'grab';
      if (App.ui.selection.size > 1 || this.cursor === null) {
        return nonSpecific;
      }
      return this.cursor;
    }
    if (this.clickable) {
      return 'pointer';
    }
    if (this.draggable) {
      return this.cursor || 'grab';
    }
    return 'default';
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
    return this.isHovered || this.isSelected;
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
}

interface UiMouseEvent {
  kind: 'down' | 'move' | 'up' | 'click';
  position: Position;
  primary: boolean;
  double: boolean;
}

interface UiDragEvent {
  kind: 'start' | 'update' | 'end';
  position: Position;
  start: Position;
  delta: Vector;
  primary: boolean;
  setSnapping: (snapping?: Snapping) => void;
}

interface UiKeyEvent {
  kind: 'keydown' | 'keyup';
  key: string;
  which: number;
  preventDefault: () => void;
}

interface UiDragListener<C extends Not<unknown, null | undefined>> {
  onStart: (event: UiDragEvent) => C | null;
  onUpdate: (event: UiDragEvent, context: C) => void;
  onEnd: (event: UiDragEvent, context: C) => void;
}

class StatefulUiDragListener<C> {
  private state: C | null = null;
  constructor(private readonly listener: UiDragListener<C>) {
  }

  onStart(event: UiDragEvent) {
    this.state = this.listener.onStart(event);
  }

  onUpdate(event: UiDragEvent) {
    if (this.state === null) return;
    this.listener.onUpdate(event, this.state);
  }

  onEnd(event: UiDragEvent) {
    if (this.state === null) return;
    this.listener.onEnd(event, this.state);
    this.state = null;
  }
}

type UiEventListener<E> = (event: E) => void;

type UiEventListenerMap<Event> = MultiMap<Kinds<Event>, UiEventListener<Event>>;

interface UiEventHandler {
  handleDrag: (event: UiDragEvent) => void;
  handleMouse: (event: UiMouseEvent) => void;
  handleKey: (event: UiKeyEvent) => void;
}

class UiEventDispatcher implements UiEventHandler {
  private readonly forwards = new Array<UiEventHandler>();
  private readonly drag: UiEventListenerMap<UiDragEvent> = new MultiMap();
  private readonly mouse: UiEventListenerMap<UiMouseEvent> = new MultiMap();
  private readonly key: UiEventListenerMap<UiKeyEvent> = new MultiMap();
  private readonly label: string;

  constructor(containingClass: new (...args: any[]) => any, label?: string) {
    this.label = typeof label === 'undefined'
      ? containingClass.name
      : `${containingClass.name}: ${label}`;
  }

  addDragListener<C>(listener: UiDragListener<C>) {
    const wrap = new StatefulUiDragListener(listener);
    this.onDrag('start', e => wrap.onStart(e));
    this.onDrag('update', e => wrap.onUpdate(e));
    this.onDrag('end', e => wrap.onEnd(e));
  }

  onDrag(
    kind: Kinds<UiDragEvent>,
    listener: UiEventListener<UiDragEvent>) {
    this.drag.add(kind, listener);
  }

  onMouse(
    kind: Kinds<UiMouseEvent>,
    listener: UiEventListener<UiMouseEvent>) {
    this.mouse.add(kind, listener);
  }

  onKey(
    kind: Kinds<UiKeyEvent>,
    listener: UiEventListener<UiKeyEvent>) {
    this.key.add(kind, listener);
  }

  forward(dispatch: UiEventHandler) {
    this.forwards.push(dispatch);
  }

  handleDrag(event: UiDragEvent) {
    this.forwards.forEach(f => f.handleDrag(event));
    this.drag.get(event.kind).forEach(handle => handle(event));
  }

  handleMouse(event: UiMouseEvent) {
    this.forwards.forEach(f => f.handleMouse(event));
    this.mouse.get(event.kind).forEach(handle => handle(event));
  }

  handleKey(event: UiKeyEvent) {
    this.forwards.forEach(f => f.handleKey(event));
    this.key.get(event.kind).forEach(handle => handle(event));
  }
}

interface MouseState {
  position: Position;
  buttons: number;
  pressed: boolean;
  dragging: boolean;
  start: Position;
  distanceDragged: Distance; 
}

interface SnapAxes {
  local: NamedAxis[],
  global: NamedAxis[],
  geometry: NamedAxis[],
  preferred: NamedAxis | null,
}

class SnapState {
  public readonly enableByDefaultRef: Ref<boolean> = Refs.of(false);
  public readonly enabledRef: Ref<boolean> = Refs.of(false);
  public readonly snapToLocalRef: Ref<boolean> = Refs.of(true);
  public readonly snapToGlobalRef: Ref<boolean> = Refs.of(true);
  public readonly snapToGeometryRef: Ref<boolean> = Refs.of(false);

  public get enabled(): boolean {
    return this.enabledRef.get();
  }

  public set enabled(v: boolean) {
    this.enabledRef.set(v);
  }

  public get snapToLocal(): boolean {
    return this.snapToLocalRef.get();
  }

  public set snapToLocal(v: boolean) {
    this.snapToLocalRef.set(v);
  }

  public get snapToGlobal(): boolean {
    return this.snapToGlobalRef.get();
  }

  public set snapToGlobal(v: boolean) {
    this.snapToGlobalRef.set(v);
  }

  public get snapToGeometry(): boolean {
    return this.snapToGeometryRef.get();
  }

  public set snapToGeometry(v: boolean) {
    this.snapToGeometryRef.set(v);
  }
}

class UiState {
  private static readonly GLOBAL_X: NamedAxis = {
    name: 'X-Axis',
    direction: Vector(Axis.X, 'screen'),
  };

  private static readonly GLOBAL_Y: NamedAxis = {
    name: 'Y-Axis',
    direction: Vector(Axis.Y, 'screen'),
  };

  public readonly events = new UiEventDispatcher(UiState);
  public axisSnap: boolean = false;
  public grabRadius: Distance = Distance(10, 'screen');

  private readonly mouse: MouseState = {
    position: Position(Point.ZERO, 'screen'),
    buttons: 0,
    pressed: false,
    dragging: false,
    start: Position(Point.ZERO, 'screen'),
    distanceDragged: Distance(0, 'screen'),
  };

  private keysPressed = new DefaultMap<string, boolean>(() => false);
  private swappedTool: ToolName | null = null;
  private snapAxes: SnapAxes | null = null;
  public readonly snapping = new SnapState();

  update() {
    App.tools.current.update();

    if (this.dragging) {
      this.renderSnapAxes();
    }
  }

  isKeyPressed(key: string): boolean {
    return this.keysPressed.get(key);
  }

  get pressedKeys(): string[] {
    // little does the map api know that its
    // keys are literal keys this time!!! >:D
    return Array.from(this.keysPressed.keys())
      .filter(key => this.keysPressed.get(key));
  }

  get multiSelecting(): boolean {
    return this.keysPressed.get('Shift');
  }

  get mousePos(): Position {
    return this.mouse.position;
  }

  get dragging(): boolean {
    return this.mouse.dragging;
  }

  cancelDrag() {
    if (!this.mouse.dragging) return;
    const base = {
      start: this.mouse.start,
      position: this.mouse.start,
      delta: Vector(Vec.ZERO, 'screen'),
      primary: true,
      setSnapping: (snapping?: Snapping) => this.updateSnapping(snapping),
    };
    this.events.handleDrag({ kind: 'update', ...base });
    this.events.handleDrag({ kind: 'end', ...base });
    this.mouse.dragging = false;
  }

  get selection(): Set<Handle> {
    return new Set(
      App.ecs.getComponents(Selected)
        .map(s => s.entity)
        .filter(s => s.has(Handle))
        .map(s => s.only(Handle))
    ); 
  }

  clearSelection() {
    App.ecs.getComponents(Selected).map(s => s.entity.only(Handle)).forEach(e => {
      e.selected = false;
      e.hovered = false;
    });
    this.updateForms();
  }

  setSelection(...handles: Handle[]) {
    const current = this.selection;
    const updated = new Set(handles);
    for (const h of current) {
      if (!updated.has(h)) {
        h.selected = false;
      }
    }
    for (const h of updated) {
      h.selected = true;
    }
    this.updateForms();
  }

  addSelection(...handles: Handle[]) {
    handles.forEach(h => { 
      h.selected = true;
    });
    this.updateForms();
  }

  select(...handles: Handle[]) {
    if (handles.every(h => h.isSelected)) return;
    if (this.multiSelecting) {
      this.addSelection(...handles);
    } else {
      this.setSelection(...handles);
    }
  }

  loopSelect() {
    const collected = new Set<Handle>();
    const frontier = [...this.selection];
    while (frontier.length > 0) {
      const handle = frontier.pop()!;
      if (collected.has(handle)) {
        continue;
      }
      collected.add(handle);
      if (handle.entity.has(Wall)) {
        handle.entity.only(Wall).getConnectedLoop()
          .map(wall => wall.entity.only(Handle))
          .forEach(h => collected.add(h));
      } else if (handle.entity.has(WallJoint)) {
        const dst = handle.entity.only(WallJoint).outgoing?.entity?.only(Handle);
        if (dst) frontier.push(dst);
      }
    }
    this.setSelection(...Array.from(collected).filter(h => h.selectable));
  }

  selectAll() {
    this.setSelection(...App.ecs.getComponents(Handle).filter(h => h.selectable));
  }

  deleteSelected() {
    const selected = this.selection;
    if (selected.size === 0) {
      return;
    }
    this.cancelDrag();
    this.clearSelection();
    selected.forEach(s => s.delete());
  }

  clearHovered() {
    App.ecs.getComponents(Hovered).forEach(h => h.unhover());
  }

  setHovered(...handles: Handle[]) {
    const set = new Set(handles);
    handles.forEach(h => { h.hovered = true; });
    App.ecs.getComponents(Hovered)
      .map(h => h.entity.only(Handle))
      .forEach(h => { h.hovered = set.has(h); });
  }

  getHandleAt(
    position: Position,
    filter?: (h: Handle) => boolean,
  ): Handle | null {
    const radius = this.grabRadius;
    const handles = App.ecs.getComponents(Handle);
    // sort descending
    handles.sort((a, b) => b.priority - a.priority);

    let choice: Handle | null = null;
    let choiceDistance = 0;
    for (const handle of handles) {
      if (!handle.visible) {
        continue;
      }
      if (typeof filter !== 'undefined' && !filter(handle)) {
        continue;
      }
      if (choice !== null && choice.priority > handle.priority) {
        // the handles are sorted by descending priority, so we
        // can exit early here. 
        return choice;
      }
      const handleDistance = handle.distanceFrom(position).get('screen');
      if (handleDistance > radius.get('screen')) {
        continue;
      }
      if (choice === null || handleDistance < choiceDistance) {
        choice = handle;
        choiceDistance = handleDistance;
      }
    }
    return choice;
  }

  private updateForms() {
    const forms = Array.from(this.selection)
      .map(handle => handle.entity.get(Form))
      .map(forms => AutoForm.union(forms.map(form => form.form)));
    const form = AutoForm.union(forms);
    App.gui.selection.clear();
    form.inflate(App.gui.selection);
  }

  private getAxisColor(axis: NamedAxis): string {
    if (axis.name === 'X-Axis') return BLUE;
    if (axis.name === 'Y-Axis') return PINK;
    const axes = this.snapAxes;
    if (axes === null) {
      return 'gray';
    }
    if (axis.name === axes.preferred?.name) {
      return BLUE;
    }
    
    const indexIn = (arr: NamedAxis[]): number => {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].name === axis.name) {
          return i; 
        }
      }
      return -1;
    };

    const colors = [
      BLUE,
      PINK,
      'purple',
      'orange',
      'green',
      'brown',
      'cyan',
    ];

    const li = indexIn(axes.local);
    if (li >= 0) return colors[li % colors.length];

    const gi = indexIn(axes.geometry);
    if (gi >= 0) return colors[(gi + axes.local.length) % colors.length];

    return 'gray';
  }

  private renderSnapAxes() {
    const axis = this.getSnapAxis(
      this.mouse.position,
      Vectors.between(this.mouse.start, this.mouse.position),
    );
    if (axis === null) {
      return;
    }

    const points = axis.points || [ this.mouse.start ];

    for (let i = 0; i < points.length; i++) {
      const origin = points[i];
      const renderLine = new SpaceEdge(
        origin.minus(axis.direction.scale(Distance(2000, 'screen'))),
        origin.plus(axis.direction.scale(Distance(2000, 'screen'))),
      );
      const labelPoint = renderLine.closestPoint(this.mouse.position);

      App.canvas.strokeStyle = this.getAxisColor(axis);
      App.canvas.lineWidth = 1;
      App.canvas.strokeLine(renderLine.src, renderLine.dst);

      if (i === 0) {
        App.canvas.text({
          text: `${axis.name}`,
          point: labelPoint.plus(axis.direction.r90()
            .to('screen').unit().scale(15)),
          fill: this.getAxisColor(axis),
          shadow: 'black',
          axis: axis.direction,
          keepUpright: true,
          align: 'center',
          baseline: 'bottom',
        });
      }
    }

    if (axis.points) {
      App.canvas.strokeLine(this.mouse.start, this.mouse.position);
    }
  }

  private snap(delta: Vector): Vector {
    const axis = this.getSnapAxis(this.mouse.position, delta);
    if (axis === null) return delta;

    return delta.onAxis(axis.direction);
  }

  private updateSnapping(snapping?: Snapping) {
    this.snapAxes = this.getSnapAxes(snapping);
    this.snapping.enabled = !!snapping?.snapByDefault || this.snapping.enableByDefaultRef.get();
  }

  private getSnapAxes(snapping?: Snapping): SnapAxes {
    const snapAxes: SnapAxes = {
      local: [],
      global: [],
      geometry: [],
      preferred: null,
    };

    if (snapping?.preferredAxis) {
      snapAxes.preferred = snapping!.preferredAxis();
    }

    if (snapping?.allowLocal !== false) {
      // don't add tons of axes that are right next to each other.
      snapAxes.local = Array.from(this.selection)
        .map(h => h.snapping?.localAxes || (() => []))
        .map(axes => axes())
        .reduce((a, b) => [...a, ...b], []);
    }

    if (snapping?.allowGlobal !== false) {
      snapAxes.global = [UiState.GLOBAL_X, UiState.GLOBAL_Y];
    }

    if (snapping?.allowGeometry !== false) {
      // we can probably add an axis-defining component
      // to do this less ad-hoc.
      for (const wall of App.ecs.getComponents(Wall)) {
        if (wall.entity.get(Handle).some(handle => handle.isSelected)) {
          continue;
        }
        snapAxes.geometry.push({
          name: wall.name,
          direction: wall.tangent,
          points: [ wall.midpoint ],
        });
      }
    }

    return snapAxes;
  }

  private elideAxes(axes: NamedAxis[]): NamedAxis[] {
    const epsilon = Degrees(30);
    const angles = new Set<Degrees>();
    const results: NamedAxis[] = [];
    for (const axis of axes) {
      const angle = normalizeRadians(axis.direction.angle().get('screen'));
      const degrees = unwrap(toDegrees(angle));
      // we only care about the axial alignment, not the sign.
      const halved = degrees >= 180 ? degrees - 180 : degrees;
      // divide out to coarser precision
      const rounded = Degrees(Math.round(halved / unwrap(epsilon)));
      if (angles.has(rounded)) continue;
      angles.add(rounded);
      results.push(axis);
    }
    return axes;
  }

  private getSnapAxis(pos: Position, delta: Vector): NamedAxis | null {
    if (!this.snapping.enabled || this.snapAxes === null || !App.tools.current.allowSnap) return null;
    if (this.snapAxes.preferred) {
      return this.snapAxes.preferred;
    }
    const options = new Array<NamedAxis>();
    if (this.snapping.snapToLocal) {
      this.snapAxes.local.forEach(a => options.push(a));
    }
    if (this.snapping.snapToGlobal) {
      this.snapAxes.global.forEach(a => options.push(a));
    }
    if (this.snapping.snapToGeometry) {
      this.snapAxes.geometry.forEach(a => options.push(a));
    }
    const elided = this.elideAxes(options);

    if (elided.length === 0) return null;
    const alignments = elided.map(axis => Spaces.getCalc(
      'screen',
      (a: Vec, b: Vec) => Math.abs(a.unit().dot(b.unit())),
      delta, axis.direction
    ));
    let best = -1;
    for (let i = 0; i < alignments.length; i++) {
      if (best < 0 || alignments[i] > alignments[best]) {
        best = i;
      }
    }
    return best >= 0 ? elided[best] : null;
  }

  setup() {
    this.events.forward({
      handleDrag: e => App.tools.current.events.handleDrag(e),
      handleKey: e => App.tools.current.events.handleKey(e),
      handleMouse: e => App.tools.current.events.handleMouse(e),
    });

    this.events.onKey('keydown', e => {
      if (this.keysPressed.get(e.key)) {
        return;
      }

      this.keysPressed.set(e.key, true);
      if (this.dragging) {
        if (e.key === 'Control') {
          this.snapping.enabled = !this.snapping.enabled;
        } else if (e.key === 'x') {
          this.updateSnapping({
            snapByDefault: true,
            preferredAxis: () => UiState.GLOBAL_X,
          });
        } else if (e.key === 'y') {
          this.updateSnapping({
            snapByDefault: true,
            preferredAxis: () => UiState.GLOBAL_Y,
          });
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        this.deleteSelected();
      }

      if (App.actions.evaluateKeybindings()) {
        e.preventDefault();
      }
    });

    this.events.onKey('keyup', e => {
      this.keysPressed.delete(e.key);
    });

    window.addEventListener('focus', () => this.keysPressed.clear());

    const makeKeyEvent = (kind: Kinds<UiKeyEvent>, e: KeyboardEvent): UiKeyEvent => ({
        kind,
        key: e.key,
        which: e.which,
        preventDefault: () => e.preventDefault(),
    });

    // mouse event util
    const isPrimary = (buttons: number) => {
      return typeof buttons === 'undefined' || buttons === 1;
    };

    const getMousePosition = (e: MouseEvent) => {
      const rect = App.pane.getBoundingClientRect();
      return Position(new Point(
        e.clientX - rect.left,
        e.clientY - rect.top,
      ), 'screen');
    };

    const makeMouseEvent = (kind: Kinds<UiMouseEvent>, e: MouseEvent): UiMouseEvent => ({
        kind,
        position: getMousePosition(e),
        primary: isPrimary(this.mouse.buttons),
        double: false,
    });

    // mouse drag state management
    const dragThreshold = Distance(5, 'screen');
    const makeDragEvent = (e: UiMouseEvent, kind: Kinds<UiDragEvent>): UiDragEvent => ({
      kind,
      start: this.mouse.start,
      position: e.position,
      delta: this.snap(Vectors.between(this.mouse.start, e.position)),
      primary: e.primary,
      setSnapping: (snapping?: Snapping) => {
        this.updateSnapping(snapping);
      },
    });

    const ignoreKeyEventsFrom = new Set([
      'input',
      'textarea',
    ]);

    const shouldIgnoreKeyEvent = (e: Event): boolean => {
      if (e.target && e.target instanceof HTMLElement) {
        return ignoreKeyEventsFrom.has(e.target.tagName.toLocaleLowerCase())
      }
      return false;
    };

    window.addEventListener('keydown', e => {
      if (shouldIgnoreKeyEvent(e)) return;
      this.events.handleKey(makeKeyEvent('keydown', e));
    });

    window.addEventListener('keyup', e => {
      if (shouldIgnoreKeyEvent(e)) return;
      this.events.handleKey(makeKeyEvent('keyup', e));
    });

    App.pane.addEventListener('contextmenu', e => e.preventDefault());

    App.pane.addEventListener('mousedown', e => {
      this.mouse.buttons = e.buttons;

      const event = makeMouseEvent('down', e);
      if (!event.primary) {
        const tool = App.tools.current;
        if (tool.name !== 'pan tool') {
          App.tools.set('pan tool');
          this.swappedTool = tool.name;
        }
      }

      this.mouse.start = event.position;
      this.mouse.distanceDragged = Distance(0, 'screen');
      this.mouse.pressed = true;

      this.events.handleMouse(makeMouseEvent('down', e));

      // close pop-up windows
      if (event.primary) {
        App.ecs.getComponents(Popup)
          .filter(p => p.closeOnUnfocus)
          .forEach(p => p.hide());
      }
    });

    App.pane.addEventListener('mousemove', e => {
      const event = makeMouseEvent('move', e);
      this.mouse.position = event.position;

      this.events.handleMouse(event);

      if (this.mouse.pressed) {
        if (!this.mouse.dragging) {
          this.mouse.distanceDragged = Spaces.calc(
            Distance,
            (a: number, b: number) => Math.max(a, b),
            this.mouse.distanceDragged,
            Distances.between(this.mouse.start, event.position),
          );
          if (this.mouse.distanceDragged.get('screen') >= dragThreshold.get('screen')) {
            this.mouse.dragging = true;
            this.events.handleDrag(makeDragEvent(event, 'start'));
          }
        }
        if (this.mouse.dragging) {
          this.events.handleDrag(makeDragEvent(event, 'update'));
        }
      }
    });

    App.pane.addEventListener('mouseup', e => {
      const event = makeMouseEvent('up', e);
      if (!event.primary && this.swappedTool !== null) {
        App.tools.set(this.swappedTool);
        this.swappedTool = null;
      }

      this.events.handleMouse(event);

      if (this.mouse.dragging) {
        this.events.handleDrag(makeDragEvent(event, 'end'));
      } else {
        this.events.handleMouse(makeMouseEvent('click', e));
      }

      this.mouse.dragging = false;
      this.mouse.pressed = false;
      this.updateSnapping();
    });
  }
}

