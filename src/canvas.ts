class Viewport {
  private _changed: boolean = true;

  constructor(
    public origin: Point = Point.ZERO,
    public radius: number = 150.,
    public screen_width: number = 1000,
    public screen_height: number = 1000) {}

  public getModelFrame(): Frame {
    return new Frame(
      this.origin,
      new Vec(this.radius, 0),
      new Vec(0, this.radius),
    );
  }

  public getScreenFrame(): Frame {
    const screen_size = Math.min(this.screen_width, this.screen_height);
    return new Frame(
      new Point(this.screen_width/2., this.screen_height/2),
      new Vec(screen_size/2., 0),
      new Vec(0, -screen_size/2),
    );

  }

  get project(): Transform2  {
    const model = this.getModelFrame().unproject;
    const screen = this.getScreenFrame().project;
    return {
      point: p => screen.point(model.point(p)),
      vec: v => screen.vec(model.vec(v)),
      distance: d => screen.distance(model.distance(d)),
    };
  }

  get unproject(): Transform2  {
    const model = this.getModelFrame().project;
    const screen = this.getScreenFrame().unproject;
    return {
      point: p => model.point(screen.point(p)),
      vec: v => model.vec(screen.vec(v)),
      distance: d => model.distance(screen.distance(d)),
    };
  }

  get changed(): boolean {
    return this._changed;
  }

  public resetChanged() {
    this._changed = false;
  }

  public setup() {
    this.handleResize();
    // sometimes the browser hasn't quite finished rendering things at the
    // point setup() is called.
    setTimeout(() => this.handleResize(), 100);

    window.addEventListener('resize', () => this.handleResize());
    App.pane.addEventListener('wheel', event => {
      const wheel = event as WheelEvent;
      this.radius = Math.max(10, this.radius + Math.sign(wheel.deltaY) * 10);
      this.updateTransforms();
    });
    const markDirty = (_: any) => { this._changed = true; };
    App.settings.fontSizeRef.onChange(markDirty);
    App.settings.showGrid.onChange(markDirty);
    App.project.gridSpacingRef.onChange(markDirty);
    App.project.displayUnitRef.onChange(markDirty);
  }

 public updateTransforms() {
   Spaces.put({
     name: 'model',
     project: this.getModelFrame().project,
     unproject: this.getModelFrame().unproject,
   });
   
   Spaces.put({
     name: 'screen',
     project: this.getScreenFrame().project,
     unproject: this.getScreenFrame().unproject,
   });
   this._changed = true;
 }
 
 private handleResize() {
   this.screen_width = Math.round(App.pane.clientWidth);
   this.screen_height = Math.round(App.pane.clientHeight);
   App.background.updateCanvasSize();
   App.canvas.updateCanvasSize();
   this.updateTransforms();
 }
}

class Canvas2d {
  private readonly g: CanvasRenderingContext2D;

  constructor(
    private readonly el: HTMLCanvasElement,
    private readonly autoclear: boolean,
  ) {
    this.g = el.getContext('2d')!;
  }

  setup() {
    App.settings.fontSizeRef.onChange(f => this.fontSize = f);
  }

  update() {
    if (this.autoclear) {
      this.clear();
    }
  }

  updateCanvasSize() {
    this.el.width = this.el.clientWidth;
    this.el.height = this.el.clientHeight;
    this.fontSize = App.settings.fontSize;
  }

  get width() {
    return Math.floor(this.el.clientWidth);
  }

  get height() {
    return Math.floor(this.el.clientHeight);
  }

  clear() {
    this.g.clearRect(0, 0, this.width + 1, this.height + 1);
  }

  set strokeStyle(style: string | CanvasGradient) {
    this.g.strokeStyle = style;
  }

  set fillStyle(style: string | CanvasGradient) {
    this.g.fillStyle = style;
  }

  setLineDash(segments: number[]) {
    this.g.setLineDash(segments);
  }

  set fontSize(s: number) {
    this.g.font = `${s}px sans-serif`;
  }

  set lineWidth(w: number) {
    this.g.lineWidth = w;
  }

  set textAlign(a: CanvasTextAlign) {
    this.g.textAlign = a;
  }

  set textBaseline(a: CanvasTextBaseline) {
    this.g.textBaseline = a;
  }

  fill() {
    this.g.fill();
  }

  stroke() {
    this.g.stroke();
  }

  beginPath() {
    this.g.beginPath();
  }

  closePath() {
    this.g.closePath();
  }

  moveTo(pos: Position) {
    const p = pos.get('screen');
    this.g.moveTo(p.x, p.y);
  }

  lineTo(pos: Position) {
    const p = pos.get('screen');
    this.g.lineTo(p.x, p.y);
  }

  bezierCurveTo(two: Position, three: Position, four: Position) {
    const [b, c, d] = [two, three, four].map(p => p.get('screen'));
    this.g.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y);
  }

  polygon(polygon: Polygon) {
    this.beginPath();
    polygon.vertices.forEach((v, i) => {
      if (i === 0) {
        this.moveTo(v);
      } else {
        this.lineTo(v);
      }
    });
    this.closePath();
  }

  arc(
    center: Position,
    radius: Distance,
    startAngle: Angle,
    endAngle: Angle,
    counterClockwise?: boolean,
  ) {
    const c = center.get('screen');
    this.g.arc(
      c.x, 
      c.y, 
      radius.get('screen'), 
      unwrap(startAngle.get('screen')), 
      unwrap(endAngle.get('screen')), 
      counterClockwise,
    );
  }

  strokeLine(src: Position, dst: Position) {
    this.beginPath();
    this.moveTo(src);
    this.lineTo(dst);
    this.stroke();
  }

  strokeCircle(src: Position, radius: Distance) {
    const g = this.g;
    const c = src.get('screen');
    g.beginPath();
    g.arc(c.x, c.y, radius.get('screen'), 0, 2 * Math.PI);
    g.stroke();
  }

  fillCircle(src: Position, radius: Distance) {
    const g = this.g;
    const c = src.get('screen');
    g.beginPath();
    g.arc(c.x, c.y, radius.get('screen'), 0, 2 * Math.PI);
    g.fill();
  }

  rect(rect: Rect) {
    this.beginPath();
    const [first, ...more] = rect.corners;
    this.moveTo(first);
    for (const m of more) {
      this.lineTo(m);
    }
    this.closePath();
  }

  text(props: TextDrawProps) {
    const p = props.point.get('screen');
    const fillStyle = props.fill || this.g.fillStyle;
    const axisAngle = typeof props.axis === 'undefined'
      ? Radians(0)
      : props.axis.get('screen').angle();
    const angle = props.keepUpright ? uprightAngle(axisAngle) : axisAngle;
    this.g.translate(p.x, p.y);
    this.g.rotate(unwrap(angle));
    if (typeof props.align !== 'undefined') {
      this.g.textAlign = props.align;
    }
    if (typeof props.baseline !== 'undefined') {
      this.g.textBaseline = props.baseline;
    }
    if (typeof props.shadow !== 'undefined') {
      this.g.fillStyle = props.shadow;
      this.g.fillText(props.text, 1, 1);
    }
    this.g.fillStyle = fillStyle;
    this.g.fillText(props.text, 0, 0);
    if (typeof props.stroke !== 'undefined') {
      this.g.lineWidth = props.lineWidth || this.g.lineWidth;
      this.g.strokeStyle = props.stroke;
      this.g.strokeText(props.text, 0, 0);
    }
    this.g.rotate(-unwrap(angle));
    this.g.translate(-p.x, -p.y);
  }

  createLinearGradient(src: Position, dst: Position): CanvasGradient {
    const a = src.get('screen');
    const b = dst.get('screen');
    return this.g.createLinearGradient(a.x, a.y, b.x, b.y);
  }
}

interface TextDrawProps {
  text: string;
  point: Position;
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  shadow?: string;
  axis?: Vector;
  keepUpright?: boolean;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

class Grid extends Component implements Solo {
  public readonly [SOLO] = true;

  private readonly origin = Position(Point.ZERO, 'model');
  private _dirty: boolean = true;
  private _spacing: Distance = Distance(1, 'model');
  private _horizontal: Vector = Vector(Axis.X, 'model');
  private _vertical: Vector = Vector(Axis.Y, 'model');
  private _displayDecimals: number = 0;

  constructor(entity: Entity) {
    super(entity);
    App.project.gridSpacingRef.onChange(gs => this.markDirty());
    App.project.displayUnitRef.onChange(gs => this.markDirty());
    App.project.modelUnitRef.onChange(gs => this.markDirty());
  }

  get spacing(): Distance { return this._spacing; }
  get horizontalSpan(): Vector { return this._horizontal; }
  get verticalSpan(): Vector { return this._vertical; }
  get displayDecimals(): number { return this._displayDecimals; }

  get dirty(): boolean {
    return this._dirty;
  }

  markDirty() {
    this._dirty = true;
  }

  update() {
    this._dirty = false;

    this._spacing = Distance(
      App.project.modelUnit.from(App.project.gridSpacing).value,
      'model',
    );

    this._horizontal = Vector(Axis.X, 'screen').to('model').unit().scale(this.spacing);
    this._vertical = Vector(Axis.Y, 'screen').to('model').unit().scale(this.spacing);
    this._displayDecimals = this.calcDisplayDecimals();
  }

  snap(position: Position): Position {
    const point = position.get('model');
    const spacing = this.spacing.get('model');
    return Position(new Point(
      Math.round(point.x / spacing) * spacing,
      Math.round(point.y / spacing) * spacing,
    ), 'model');
  }

  snapDelta(position: Position): Vector {
    return Vectors.between(position, this.snap(position));
  }

  snapHorizontal(position: Position): Position {
    const delta = this.snapDelta(position);
    return position.plus(delta.onAxis(this._horizontal));
  }

  snapVertical(position: Position): Position {
    const delta = this.snapDelta(position);
    return position.plus(delta.onAxis(this._vertical));
  }

  getClosestRow(position: Position): number {
    const delta = Vectors.between(this.origin, position.to('model'));
    return Math.round(delta.dot(this._vertical.unit()).div(this.spacing));
  }

  getClosestColumn(position: Position): number {
    const delta = Vectors.between(this.origin, position.to('model'));
    return Math.round(delta.dot(this._horizontal.unit()).div(this.spacing));
  }

  getPointAt(row: number, col: number): Position {
    return this.origin 
      .splus(row, this._vertical)
      .splus(col, this._horizontal);
  }

  formatLabel(index: number, decimals?: number): string {
    const { value, unit } = App.project.gridSpacing;
    return App.project.displayUnit.format(
      { value: value * index, unit },
      typeof decimals !== 'undefined' ? decimals : this.displayDecimals,
    );
  }

  private calcDisplayDecimals(): number {
    const du = App.project.displayUnit;
    const spacing = App.project.gridSpacing;
    const enough = (decimals: number): boolean => {
      const multiples = [0, 1, 2, 3];
      const labels = new Set<string>(
        multiples.map(m => this.formatLabel(m, decimals)),
      );
      return labels.size === multiples.length;
    };
    let decimals = 0;
    while (!enough(decimals) && decimals < 6) {
      decimals++;
    }
    return decimals;
  }

  static getGrid(): Grid {
    const grids = App.ecs.getComponents(Grid);
    if (grids.length === 0) {
      return App.ecs.createEntity().add(Grid);
    }
    if (grids.length > 1) {
      throw new Error('There should never be more than one grid!');
    }
    return grids[0]!;
  }
}

const GridRenderer = (ecs: EntityComponentSystem) => {
  const grid = Grid.getGrid();

  if (!App.viewport.changed && !grid.dirty) return;
  App.viewport.resetChanged();
  grid.update();

  const c = App.background;
  c.clear();

  if (!App.settings.showGrid.get()) return;

  const columns = Math.ceil(
    Distance(App.viewport.screen_width, 'screen').div(grid.spacing)
  ) + 1;
  const rows = Math.ceil(
    Distance(App.viewport.screen_height, 'screen').div(grid.spacing)
  ) + 1;

  const screenOrigin = Position(Point.ZERO, 'screen'); // top-left corner
  const startRow = grid.getClosestRow(screenOrigin) - 1;
  const startCol = grid.getClosestColumn(screenOrigin) - 1;
  const endRow = startRow + rows;
  const endCol = startCol + columns;

  c.lineWidth = 1;
  c.setLineDash([]);
  c.strokeStyle = '#cccccc'; 

  const textMargin = Distance(10, 'screen');

  for (let i = 0; i < rows; i++) {
    c.strokeLine(grid.getPointAt(startRow + i, startCol), grid.getPointAt(startRow + i, endCol));
  }

  for (let i = 0; i < columns; i++) {
    c.strokeLine(grid.getPointAt(startRow, startCol + i), grid.getPointAt(endRow, startCol + i));
  }

  const rowLabelOrigin = screenOrigin.splus(textMargin, Vector(Axis.X, 'screen'));
  for (let i = 1; i < rows; i++) {
    const row = startRow + i;
    c.text({
      text: grid.formatLabel(row),
      point: grid.snapVertical(rowLabelOrigin.splus(i, grid.verticalSpan)),
      align: 'left',
      baseline: 'middle',
      fill: 'black',
    });
  }

  const columnLabelOrigin = screenOrigin.splus(textMargin, Vector(Axis.Y, 'screen'));
  for (let i = 1; i < columns; i++) {
    const col = startCol + i;
    c.text({
      text: grid.formatLabel(col),
      point: grid.snapHorizontal(columnLabelOrigin.splus(i, grid.horizontalSpan)),
      align: 'center',
      baseline: 'top',
      fill: 'black',
    });
  }
};


