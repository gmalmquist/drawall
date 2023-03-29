const Drags = {
  empty: (): DragEmpty => ({ kind: 'empty', name: '', }),
  closure: (
    type: 'minimal' | 'complete',
    ...roots: DragItem[]
  ): DragClosure => {
    const closure: DragClosure = {
      points: [],
      snaps: [],
    };

    const seenItems = new Set<DragItem>();
    const seenSnaps = new Set<DragSnap>();

    const frontier = [...roots];
    while (frontier.length > 0) {
      const item = frontier.pop()!;
      if (seenItems.has(item)) continue;
      seenItems.add(item);

      item.snaps?.forEach(s => {
        if (seenSnaps.has(s)) return;
        seenSnaps.add(s);
        closure.snaps.push(s);
      });

      if (item.kind === 'empty') {
        continue;
      }
      if (item.kind === 'point') {
        closure.points.push(item);
        continue;
      }
      if (item.kind === 'group') {
        for (let i = 0; i < 1 || type === 'complete'; i++) {
          frontier.push(item.items[i]);
        }
      }
    }

    return closure;
  },
  chooseSnap: (
    context: DragContext,
    filter: ((snap: DragSnap) => boolean) = ((_) => true),
  ): SnapResult | null => {
    const { drag, starts, closure } = context;
    let best: SnapResult | null = null;
    let index = 0;
    for (const point of closure.points) {
      for (const snap of closure.snaps) {
        if (!filter(snap)) continue;
        if (typeof snap.closeEnough !== 'undefined' && !snap.closeEnough(drag)) {
          continue;
        }
        const snapped = drag.snapped(snap);
        const distance = Distances.between(drag.end, snapped.end);
        if (best === null || distance.lt(best.distance)) {
          best = {
            snap,
            item: closure.points[index],
            distance,
            snapped,
            original: drag,
          };
        }
      }
      index++;
    }
    return best;
  },
};

type DragItem = DragGroup | DragPoint | DragEmpty;
type DragSnap = SnapAxis | SnapPoint | SnapVec | SnapFunc;
type SnapCategory = 'local' | 'geometry' | 'guide' | 'global' | 'grid';

interface DragContext {
  drag: Drag;
  starts: Position[];
  closure: DragClosure;
}

interface DragClosure {
  points: DragPoint[];
  snaps: DragSnap[];
}

interface DragBase<K extends string> {
  kind: K;
  name: string;
  snaps?: DragSnap[];
}

interface DragPoint extends DragBase<'point'> {
  get: () => Position;
  set: (p: Position) => void;
}

interface DragGroup extends DragBase<'group'> {
  aggregate: 'first' | 'all';
  items: DragItem[];
}

interface DragEmpty extends DragBase<'empty'> {
}

interface SnapBase<K extends string> {
  kind: K;
  category: SnapCategory;
  name: string;
  closeEnough?: (drag: Drag) => boolean;
}

interface SnapAxis extends SnapBase<'axis'> {
  direction: Vector;
  origin?: Position;
}

interface SnapPoint extends SnapBase<'point'> {
  func: (pos: Position) => Position;
}

interface SnapVec extends SnapBase<'vector'> {
  func: (delta: Vector) => Vector;
}

interface SnapFunc extends SnapBase<'func'> {
  func: (drag: Drag) => Position;
}

interface SnapResult {
  snap: DragSnap;
  item: DragItem;
  snapped: Drag;
  original: Drag; 
  distance: Distance;
}

class Drag {
  public readonly edge: SpaceEdge;

  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {
    this.edge = new SpaceEdge(start, end);
  }

  get midpoint(): Position {
    return this.edge.midpoint;
  }

  get tangent(): Vector {
    return this.edge.tangent;
  }

  get normal(): Vector {
    return this.edge.normal;
  }

  get delta(): Vector {
    return this.edge.vector;
  }

  onAxis(direction: Vector): Drag {
    return new Drag(
      this.start,
      this.start.plus(this.delta.onAxis(direction)),
    );
  }

  onLine(origin: Position, direction: Vector): Drag {
    return new Drag(
      this.start,
      this.end.onLine(origin, direction),
    );
  }

  snapped(snap: DragSnap): Drag {
    if (snap.kind === 'point') {
      return new Drag(this.start, snap.func(this.end));
    }
    if (snap.kind === 'vector') {
      return new Drag(
        this.start,
        this.start.plus(snap.func(this.delta)),
      );
    }
    if (snap.kind === 'func') {
      return new Drag(this.start, snap.func(this));
    }
    if (snap.kind === 'axis') {
      if (typeof snap.origin === 'undefined') {
        return this.onAxis(snap.direction);
      }
      return this.onLine(snap.origin, snap.direction);
    }
    return impossible(snap);
  }

  applyTo(item: DragItem) {
    if (item.kind === 'empty') return;
    if (item.kind === 'group') {
      item.items.forEach(item => this.applyTo(item));
      return;
    }
    if (item.kind === 'point') {
      item.set(this.end);
      return;
    }
    return impossible(item);
  }
}

