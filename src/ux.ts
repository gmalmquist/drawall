// this file is maybe poorly named, but it has code for user interactions
// like clicking and dragging

const PINK = '#F5A9B8';
const BLUE = '#5BCEFA';

interface HandleClickEvent {
  point: Position;
}

interface HandleDragEvent {
  point: Position;
  start: Position;
  delta: Vector;
}

interface HandleHoverEvent {
  point: Position;
  hovered: boolean;
}

interface HandleDragListener<C> {
  onStart: (event: HandleDragEvent) => C;
  onUpdate: (event: HandleDragEvent, context: C) => void;
  onEnd: (event: HandleDragEvent, context: C) => void;
}

interface NamedAxis {
  name: string;
  line: Line;
}

class StatefulHandleDragListener<C> {
  private state: C | null = null;
  constructor(private readonly listener: HandleDragListener<C>) {
  }

  onStart(event: HandleDragEvent) {
    this.state = this.listener.onStart(event);
  }

  onUpdate(event: HandleDragEvent) {
    if (this.state === null) return;
    this.listener.onUpdate(event, this.state);
  }

  onEnd(event: HandleDragEvent) {
    if (this.state === null) return;
    this.listener.onEnd(event, this.state);
    this.state = null;
  }
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
  private readonly onClicks = new Set<Consume<HandleClickEvent>>();
  private readonly onDrags = new Set<StatefulHandleDragListener<any>>();
  private readonly onHovers = new Set<Consume<HandleHoverEvent>>();
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
      this.onDrag({
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

  onClick(listener: Consume<HandleClickEvent>) {
    this.onClicks.add(listener);
  }

  onDrag<C>(listener: HandleDragListener<C>) {
    this.onDrags.add(new StatefulHandleDragListener(listener));
  }

  onHover(listener: Consume<HandleHoverEvent>) {
    this.onHovers.add(listener);
  }

  fireClick(event: HandleClickEvent) {
    if (!this.clickable) return;
    for (const listener of this.onClicks) {
      listener(event);
    }
  }

  fireDragStart(event: HandleDragEvent) {
    if (!this.draggable) return;
    this._dragging = true;
    for (const listener of this.onDrags) {
      listener.onStart(event);
    }
  }

  fireDragUpdate(event: HandleDragEvent) {
    if (!this.draggable) return;
    for (const listener of this.onDrags) {
      listener.onUpdate(event);
    }
  }

  fireDragEnd(event: HandleDragEvent) {
    if (!this.draggable) return;
    this._dragging = false;
    for (const listener of this.onDrags) {
      listener.onEnd(event);
    }
  }

  fireHover(event: HandleHoverEvent) {
    if (!this.hoverable) return;
    this._hovered = event.hovered;
    for (const listener of this.onHovers) {
      listener(event);
    }
  }
}

class DragUi {
  public mousePos: Position = Position(Point.ZERO, 'screen');
  public dragRadius = 10; // px
  public clickRadius = 10;
  private dragging: Handle | null = null;
  private dragStart: Position = Position(Point.ZERO, 'screen');
  private clicking: boolean = false;
  private axisSnapping: boolean = false;
  private snapAxes: NamedAxis[] = [];

  constructor(private readonly canvas: HTMLElement) {
    this.connectListeners(canvas);
  }

  public get isDragging(): boolean {
    return this.dragging !== null;
  }

  private getHandles(): Handle[] {
    const handles = App.ecs.getComponents(Handle);
    // sort descending
    return handles.sort((a, b) => b.priority - a.priority);
  }

  private pickHandle(
    pos: Position,
    buttons: number,
    radius: number,
    filter?: (h: Handle) => boolean,
  ): Handle | null {
    const isPrimary = buttons <= 1;
    let choice: Handle | null = null;
    let choiceDistance = 0;
    for (const handle of this.getHandles()) {
      if (typeof filter !== 'undefined' && !filter(handle)) {
        continue;
      }
      if (!isPrimary && handle.ignoreNonPrimary) {
        continue;
      }
      if (choice !== null && choice.priority > handle.priority) {
        // the handles are sorted by descending priority, so we
        // can exit early here. 
        return choice;
      }
      const handleDistance = handle.distanceFrom(pos).get('screen');
      if (handleDistance > this.dragRadius) {
        continue;
      }
      if (choice === null || handleDistance < choiceDistance) {
        choice = handle;
        choiceDistance = handleDistance;
      }
    }
    return choice;
  }

  private getSnapAxis(pos: Position, delta: Vector): NamedAxis | null {
    if (!this.axisSnapping) return null;
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

  private snap(delta: Vector): Vector {
    const axis = this.getSnapAxis(this.mousePos, delta);
    if (axis === null) return delta;

    const snapped = delta.onAxis(axis.line.tangent);

    const renderLine = new SpaceEdge(
      axis.line.origin.minus(axis.line.tangent.scale(Distance(2000, 'screen'))),
      axis.line.origin.plus(axis.line.tangent.scale(Distance(2000, 'screen'))),
    );
    const labelPoint = renderLine.closestPoint(this.mousePos);

    App.canvas.strokeStyle = this.getAxisColor(axis);
    App.canvas.lineWidth = 1;
    App.canvas.strokeLine(renderLine.src, renderLine.dst);

    App.canvas.strokeLine(this.dragStart, this.mousePos);

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

    return snapped;
  }

  private updateSnapAxes() {
    // don't add tons of axes that are right next to each other.
    const epsilon = Degrees(30);

    const local = this.dragging?.axes() || [];

    const global: NamedAxis[] = [
      {
        name: 'X-Axis',
        line: new Line(this.dragStart, Vector(Axis.X, 'screen')),
      },
      {
        name: 'Y-Axis',
        line: new Line(this.dragStart, Vector(Axis.Y, 'screen')),
      },
    ];

    const geometry: NamedAxis[] = [];
    // we can probably add an axis-defining component
    // to do this less ad-hoc.
    for (const wall of App.ecs.getComponents(Wall)) {
      if (wall.entity.get(Handle).some(h => h === this.dragging)) {
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

    this.snapAxes = results;
  }

  private connectListeners(canvas: HTMLElement) {
    window.addEventListener('keydown', e => {
      if (e.key === 'Shift') {
        this.axisSnapping = true;
      }
    });
    window.addEventListener('keyup', e => {
      if (e.key === 'Shift') {
        this.axisSnapping = false;
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.buttons <= 1) {
        // hide any popups when we click on the canvas
        App.ecs.getComponents(Popup).forEach(p => {
          if (p.closeOnUnfocus) {
            p.hide();
          }
        });
      }

      const pos = this.getPoint(e);
      this.clicking = true;
      this.dragStart = pos;
      this.dragging = this.pickHandle(
        pos, e.buttons, this.dragRadius, h => h.draggable);
      if (this.dragging !== null) {
        this.updateSnapAxes();
        this.dragging.fireDragStart({
          start: this.dragStart,
          point: pos,
          delta: Vector(Vec.ZERO, 'screen'),
        });
      }
    });
    canvas.addEventListener('mousemove', (e) => {
      const pos = this.getPoint(e);
      this.mousePos = pos;
      const delta = Vectors.between(this.dragStart, pos);
      if (this.clicking && delta.get('screen').mag() > this.clickRadius) { this.clicking = false;
      }
      if (this.dragging !== null) {
        this.dragging.fireDragUpdate({
          start: this.dragStart,
          point: pos,
          delta: this.snap(delta),
        });
        App.pane.style.cursor = 'grab';
      } else {
        let nearClickable = false;
        let nearDraggable = false;
        for (const handle of this.getHandles()) {
          if (!handle.hoverable) continue;
          const isNear = handle.distanceFrom(pos).get('screen') <= this.dragRadius;
          nearClickable = nearClickable || (isNear && handle.clickable);
          nearDraggable = nearDraggable || (isNear && handle.draggable);
          if (handle.isHovered !== isNear) {
            handle.fireHover({ point: pos, hovered: isNear });
          }
        }
        if (nearClickable) {
          App.pane.style.cursor = 'pointer';
        } else if (nearDraggable) {
          App.pane.style.cursor = 'grab';
        } else {
          App.pane.style.cursor = 'default';
        }
      }
    });
    canvas.addEventListener('mouseup', (e) => {
      const point = this.getPoint(e);
      const delta = Vectors.between(this.dragStart, point);
      if (this.dragging !== null) {
        const event = {
          point,
          start: this.dragStart,
          delta: this.snap(delta),
        };
        this.dragging.fireDragUpdate(event);
        this.dragging.fireDragEnd(event);
        this.dragging = null;
        App.pane.style.cursor = 'default';
      }
      if (this.clicking) {
        this.clicking = false;
        const handle = this.pickHandle(
          point, e.buttons, this.dragRadius, h => h.clickable);
        if (handle !== null) {
          handle.fireClick({ point });
        }
      }
    });
  }

  public update() {
    if (this.dragging !== null) {
      this.dragging.fireDragUpdate({
        point: this.mousePos,
        start: this.dragStart,
        delta: this.snap(Vectors.between(this.dragStart, this.mousePos)),
      });
    }
  }

  private getPoint(e: MouseEvent): Position {
    const view = this.canvas.getBoundingClientRect();
    return Position(new Point(e.clientX - view.left, e.clientY - view.top), 'screen');
  }
}

