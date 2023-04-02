type ResizeCursor = 'n-resize' | 's-resize' | 'w-resize' | 'e-resize'
  | 'ne-resize' | 'nw-resize' | 'se-resize' | 'sw-resize'
  | 'ew-resize' | 'ns-resize' | 'nesw-resize' | 'nwse-resize';

type CursorBuiltin = 'default' | 'none' | 'help' | 'context-menu'
  | 'pointer' | 'progress' | 'wait' | 'cell' | 'crosshair'
  | 'text' | 'vertical-text' | 'alias' | 'copy' | 'move'
  | 'no-drop' | 'grab' | 'grabbing' | 'all-scroll' | 'col-resize'
  | 'row-resize' | 'zoom-in' | 'zoom-out' | ResizeCursor;

type CursorCustom = `url('${string}')` | `url('${string}') ${number} ${number}`;

type CursorSingle = CursorBuiltin | CursorCustom; 

type CursorWithFallback = `${CursorSingle}, ${CursorSingle}`;

type Cursor = CursorSingle | CursorWithFallback;

const getResizeCursor = (direction: Vector, bidirectional: boolean = true): ResizeCursor => {
  const dir = direction.get('screen');
  const options: Array<readonly [Vec, ResizeCursor, ResizeCursor]> = [
    [new Vec( 0,-1), 'n-resize', 'ns-resize'],
    [new Vec(+1,-1), 'ne-resize', 'nesw-resize'],
    [new Vec(+1, 0), 'e-resize', 'ew-resize'], // ew gross
    [new Vec(+1,+1), 'se-resize', 'nwse-resize'],
    [new Vec( 0,+1), 's-resize', 'ns-resize'],
    [new Vec(-1,+1), 'sw-resize', 'nesw-resize'],
    [new Vec(-1, 0), 'w-resize', 'ew-resize'], // ew gross
    [new Vec(-1,-1), 'nw-resize', 'nwse-resize'],
  ];
  const map = new Map<ResizeCursor, Vec>();
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
