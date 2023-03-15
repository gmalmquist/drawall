interface Draggable {
  getPos: () => Point;
  setPos: (pt: Point, delta: Vec, state: any) => void;
  distance: (pt: Point) => number;
  priority?: number;
  getState?: () => any;
}

interface DWO {
  draggable: Draggable,
  offset: Vec,
  state: any,
}

class Drag {
  public end: Point;
  private draggables: DWO[] = [];

  constructor(public start: Point) {
    this.end = start;
  }

  get delta(): Vec {
    return Vec.between(this.start, this.end);
  }

  addDraggable(draggable: Draggable) {
    this.draggables.push({
      draggable,
      offset: Vec.between(this.start, draggable.getPos()),
      state: draggable.getState ? draggable.getState() : null,
    });
  }

  update(point: Point) {
    this.end = point;
    this.draggables.forEach(d => {
      d.draggable.setPos(point.plus(d.offset), this.delta, d.state);
    });
  }
}

interface DragListener {
  dragStart: (drag: Drag) => void;
  dragUpdate: (drag: Drag) => void;
  dragEnd: (drag: Drag) => void;
}

class Mouse {
  public pos: Point = Point.ZERO;
  public drag: Drag | null = null;
  private dragListeners: DragListener[] = [];

  constructor() {}

  addDragListener(d: DragListener) {
    this.dragListeners.push(d);
  }

  listenTo(element: HTMLElement) {
    element.addEventListener('mousemove', event => {
      this.pos = new Point(event.clientX, event.clientY);
      this.updateDrag();
    });
    element.addEventListener('drag', event => {
      this.pos = new Point(event.clientX, event.clientY);
    });
    element.addEventListener('mousedown', event => {
      this.pos = new Point(event.clientX, event.clientY);
      const drag = new Drag(this.pos);
      this.drag = drag;
      this.dragListeners.forEach(l => l.dragStart(drag));
    });
    element.addEventListener('mouseup', event => {
      this.pos = new Point(event.clientX, event.clientY);
      const drag = this.drag;
      if (drag !== null) {
        this.updateDrag();
        this.dragListeners.forEach(l => l.dragEnd(drag));
        this.drag = null;
      }
    });
  }

  private updateDrag() {
    const drag = this.drag;
    if (drag === null) return;
    drag.update(this.pos);
    this.dragListeners.forEach(l => l.dragUpdate(drag));
  }
}

