type DragItem = DragGroup | DragPoint;

interface DragPoint {
  kind: 'point';
  name: string;
  get: () => Position;
  set: (p: Position) => void;
}

interface DragGroup {
  kind: 'group';
  aggregate: 'first' | 'all';
  items: DragItem[];
}

interface SnapBase<K extends string> {
  kind: K;
  name: string;
}

interface SnapAxis extends SnapBase<'axis'> {
  direction: Vector;
  origins?: Position[];
}

interface SnapPoint extends SnapBase<'point'> {
  point: Position;
}

interface SnapFunc extends SnapBase<'func'> {
  func: (p: Position) => Position;
}

