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

