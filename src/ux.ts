// this file is maybe poorly named, but it has code for user interactions
// like clicking and dragging

const PINK = '#F5A9B8';
const BLUE = '#5BCEFA';

interface NamedAxis {
  name: string;
  line: Line;
}

interface HandleProps {
  getPos: () => Position;
  setPos?: (p: Position) => void;
  distance?: (p: Position) => Distance;
  axes?: () => NamedAxis[],
  draggable?: boolean;
  clickable?: boolean;
  hoverable?: boolean;
  priority?: number;
}

class Handle extends Component {
  public readonly events = new UiEventDispatcher(Handle);

  private readonly distanceFunc: (p: Position) => Distance;
  private _dragging: boolean = false;
  private _hovered: boolean = false;

  public draggable: boolean = true;
  public clickable: boolean = true;
  public hoverable: boolean = true;
  public ignoreNonPrimary: boolean = true;
  public priority: number = 0;
  public readonly axes: () => NamedAxis[];

  constructor(entity: Entity, private readonly props: HandleProps) {
    super(entity);

    this.priority = typeof props.priority === 'undefined' ? 0 : props.priority;
    this.draggable = typeof props.draggable === 'undefined' ? true : props.draggable;
    this.clickable = typeof props.clickable === 'undefined' ? true : props.clickable;
    this.hoverable = typeof props.hoverable === 'undefined' ? true : props.hoverable;

    this.axes = typeof props.axes === 'undefined' ? () => [] : props.axes;

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

  get isDragging(): boolean {
    return this._dragging;
  }

  get isHovered(): boolean {
    return this._hovered;
  }

  set hovered(h: boolean) {
    this._hovered = h;
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
}

interface UiDragEvent {
  kind: 'start' | 'update' | 'end';
  position: Position;
  start: Position;
  delta: Vector;
}

interface UiKeyEvent {
  kind: 'keydown' | 'keyup';
  key: string;
  which: number;
}

interface UiDragListener<C> {
  onStart: (event: UiDragEvent) => C;
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

type Kinds<Event> = Event extends { kind: infer K }
  ? K : never;

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

  constructor(containingClass: new (...args: any[]) => any) {
    this.label = containingClass.name;
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

class UiState {
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

  private _snapAxes: NamedAxis[] = [];
  private _selection: Set<Handle> = new Set();
  private keysPressed = new DefaultMap<string, boolean>(() => false);

  constructor() {
    this.events.forward({
      handleDrag: e => App.tools.current.events.handleDrag(e),
      handleKey: e => App.tools.current.events.handleKey(e),
      handleMouse: e => App.tools.current.events.handleMouse(e),
    });

    this.events.onKey('keydown', e => {
      this.keysPressed.set(e.key, true);
      if (e.key === 'Shift') {
        this.axisSnap = true;
      }
      this.evaluateKeybindings();
    });

    this.events.onKey('keyup', e => {
      this.keysPressed.delete(e.key);
      if (e.key === 'Shift') {
        this.axisSnap = false;
      }
    });

    this.setup();
  }

  update() {
    App.tools.current.update();

    if (this.dragging) {
      this.renderSnapAxes();
    }
  }

  get mousePos(): Position {
    return this.mouse.position;
  }

  get dragging(): boolean {
    return this.mouse.dragging;
  }

  get snapAxes(): NamedAxis[] {
    return Array.from(this._snapAxes);
  }

  get selection(): Handle[] {
    return Array.from(this._selection);
  }

  clearSelection() {
    this._selection.clear();
  }

  setSelection(...handles: Handle[]) {
    this.clearSelection();
    this.addSelection(...handles);
  }

  addSelection(...handles: Handle[]) {
    handles.forEach(h => {
      this._selection.add(h);
    });
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

  private evaluateKeybindings() {
    const stroke: KeyStroke = {
      // little does the map api know that its
      // keys are literal keys!!! >:D
      keys: Array.from(this.keysPressed.keys())
        .filter(key => this.keysPressed.get(key)),
    };
    const hotkey = App.keybindings.match(stroke);
    if (hotkey !== null) {
      const action = App.actions.get(hotkey.action);
      App.log('executing keybinding', formatKeyStroke(hotkey.stroke), ':', action.name);
      action.apply();
    }
  }

  private getSnapAxis(pos: Position, delta: Vector): NamedAxis | null {
    if (!this.axisSnap) return null;
    const alignments = this.snapAxes.map(axis => Spaces.getCalc(
      'screen',
      (a: Vec, b: Vec) => Math.abs(a.unit().dot(b.unit())),
      delta, axis.line.tangent
    ));
    let best = -1;
    for (let i = 0; i < alignments.length; i++) {
      if (best < 0 || alignments[i] > alignments[best]) {
        best = i;
      }
    }
    return best >= 0 ? this.snapAxes[best] : null;
  }

  private getAxisColor(axis: NamedAxis): string {
    if (axis.name === 'X-Axis') return 'red';
    if (axis.name === 'Y-Axis') return 'blue';
    const colors = [
      'purple',
      'cyan',
      'pink',
      'green',
    ];
    for (let i = 0; i < this.snapAxes.length; i++) {
      if (axis.name === this.snapAxes[i].name) {
        return colors[i % colors.length];
      }
    }
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

    const renderLine = new SpaceEdge(
      axis.line.origin.minus(axis.line.tangent.scale(Distance(2000, 'screen'))),
      axis.line.origin.plus(axis.line.tangent.scale(Distance(2000, 'screen'))),
    );
    const labelPoint = renderLine.closestPoint(this.mouse.position);

    App.canvas.strokeStyle = this.getAxisColor(axis);
    App.canvas.lineWidth = 1;
    App.canvas.strokeLine(renderLine.src, renderLine.dst);

    App.canvas.strokeLine(this.mouse.start, this.mouse.position);

    App.canvas.text({
      text: `${axis.name}`,
      point: labelPoint.plus(axis.line.normal
        .map((n: Vec, d: number) => n.unit().scale(d), Distance(15, 'screen'))),
      fill: this.getAxisColor(axis),
      shadow: 'black',
      axis: axis.line.tangent,
      keepUpright: true,
      align: 'center',
      baseline: 'bottom',
    });
  }

  private snap(delta: Vector): Vector {
    const axis = this.getSnapAxis(this.mouse.position, delta);
    if (axis === null) return delta;

    return delta.onAxis(axis.line.tangent);
  }

  private updateSnapAxes() {
    // don't add tons of axes that are right next to each other.
    const epsilon = Degrees(30);

    const local = this.selection.map(h => h.axes())
      .reduce((a, b) => [...a, ...b], []);

    const global: NamedAxis[] = [
      {
        name: 'X-Axis',
        line: new Line(this.mouse.start, Vector(Axis.X, 'screen')),
      },
      {
        name: 'Y-Axis',
        line: new Line(this.mouse.start, Vector(Axis.Y, 'screen')),
      },
    ];

    const geometry: NamedAxis[] = [];
    // we can probably add an axis-defining component
    // to do this less ad-hoc.
    for (const wall of App.ecs.getComponents(Wall)) {
      if (wall.entity.get(Handle)
        .some(handle => this.selection.some(s => handle === s))) {
        continue;
      }
      const edge = wall.getEdge();
      geometry.push({
        name: wall.name,
        line: new Line(edge.lerp(0.5), edge.vector),
      });
    }

    // todo: make it configurable which of these are included
    const all: NamedAxis[] = [
      ...global,
      ...local,
      ...geometry
    ];

    const angles = new Set<Degrees>();
    const results: NamedAxis[] = [];
    for (const axis of all) {
      const angle = normalizeRadians(axis.line.tangent.angle().get('screen'));
      const degrees = unwrap(toDegrees(angle));
      // we only care about the axial alignment, not the sign.
      const halved = degrees >= 180 ? degrees - 180 : degrees;
      // divide out to coarser precision
      const rounded = Degrees(Math.round(halved / unwrap(epsilon)));
      if (angles.has(rounded)) continue;
      angles.add(rounded);
      results.push(axis);
    }

    this._snapAxes = results;
  }

  setup() {
    const makeKeyEvent = (kind: Kinds<UiKeyEvent>, e: KeyboardEvent): UiKeyEvent => ({
        kind,
        key: e.key,
        which: e.which,
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
    });

    // mouse drag state management
    const dragThreshold = Distance(5, 'screen');
    const makeDragEvent = (e: UiMouseEvent, kind: Kinds<UiDragEvent>): UiDragEvent => ({
      kind,
      start: this.mouse.start,
      position: e.position,
      delta: this.snap(Vectors.between(this.mouse.start, e.position)),
    });

    const ignoreKeyEventsFrom = new Set([
      'input',
      'textarea',
    ]);

    const shouldIgnoreKeyEvent = (e: Event): boolean => {
      if (e.target && e.target instanceof HTMLElement) {
        ignoreKeyEventsFrom.has(e.target.tagName.toLocaleLowerCase())
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

    App.pane.addEventListener('mousedown', e => {
      this.mouse.buttons = e.buttons;

      const event = makeMouseEvent('down', e);

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
            this.updateSnapAxes();
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
      this.events.handleMouse(event);

      if (this.mouse.dragging) {
        this.events.handleDrag(makeDragEvent(event, 'end'));
      } else {
        this.events.handleMouse(makeMouseEvent('click', e));
      }

      this.mouse.dragging = false;
      this.mouse.pressed = false;
    });
  }
}

