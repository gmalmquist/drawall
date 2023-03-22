class CanvasViewport {
  constructor(
    public origin: Point = Point.ZERO,
    public radius: number = 150.,
    public screen_width: number = 1000,
    public screen_height: number = 1000) {}

  getModelFrame(): Frame {
    return new Frame(
      this.origin,
      new Vec(this.radius, 0),
      new Vec(0, this.radius),
    );

  }

  getScreenFrame(): Frame {
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
}

class Canvas2d {
  private readonly g: CanvasRenderingContext2D;
  viewport: CanvasViewport = new CanvasViewport();

  constructor(private readonly el: HTMLCanvasElement) {
    this.g = el.getContext('2d')!!;
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

  set strokeStyle(style: string) {
    this.g.strokeStyle = style;
  }

  set fillStyle(style: string) {
    this.g.fillStyle = style;
  }

  setLineDash(segments: number[]) {
    this.g.setLineDash(segments);
  }

  set fontSize(s: number) {
    this.g.font = `${s} sans-serif`;
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

  handleResize() {
    this.el.width = this.el.clientWidth;
    this.el.height = this.el.clientHeight;
    this.viewport.screen_width = this.width;
    this.viewport.screen_height = this.height;
    this.updateTransforms();
  }

  updateTransforms() {
    Spaces.put({
      name: 'model',
      project: this.viewport.getModelFrame().project,
      unproject: this.viewport.getModelFrame().unproject,
    });
    
    Spaces.put({
      name: 'screen',
      project: this.viewport.getScreenFrame().project,
      unproject: this.viewport.getScreenFrame().unproject,
    });
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

setTimeout(() => {
  const c = App.canvas;
  c.handleResize();

  window.addEventListener('resize', () => App.canvas.handleResize());

  App.pane.addEventListener('wheel', event => {
    const wheel = event as WheelEvent;
    c.viewport.radius = Math.max(10, c.viewport.radius + Math.sign(wheel.deltaY) * 10);
    c.updateTransforms();
  });

  const drawGridLines = () => {
    // render grid
    const gridSpacing = App.project.modelUnit.from(App.project.gridSpacing).value;
    const left = Vector(new Vec(-1, 0), 'screen').get('model').unit();
    const right = Vector(new Vec(1, 0), 'screen').get('model').unit();
    const up = Vector(new Vec(0, -1), 'screen').get('model').unit();
    const down = Vector(new Vec(0, 1), 'screen').get('model').unit();

    const dirMinus = left.plus(up);
    const dirPlus = right.plus(down);
    const topLeft = Position(Point.ZERO, 'screen').get('model')
      .trunc(gridSpacing)
      .splus(gridSpacing, dirMinus);
    const bottomRight = Position(new Point(c.width, c.height), 'screen').get('model')
      .trunc(gridSpacing)
      .splus(gridSpacing, dirPlus);

    const axisX = Vector(Axis.X, 'screen');
    const axisY = Vector(Axis.Y, 'screen');

    const gridX = Vec.between(topLeft, bottomRight).onAxis(axisX.get('model'));
    const gridY = Vec.between(topLeft, bottomRight).onAxis(axisY.get('model'));
    const steps = Math.floor(Math.max(gridX.mag(), gridY.mag()) / gridSpacing);

    c.lineWidth = 1;
    c.strokeStyle = '#ccc'; 
    c.fillStyle = 'black'; 
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let i = 0; i <= steps; i++) {
      const s = gridSpacing * i;
      const x = topLeft.splus(s, dirPlus.onAxis(axisX.get('model')).unit());
      c.strokeLine(
        Position(x, 'model'), 
        Position(x.plus(gridY), 'model'),
      );
      const value = App.project.modelUnit.newAmount(x.trunc().x);
      const label = App.project.displayUnit.format(value);
      c.text({
        text: label,
        point: Position(x, 'model')
          .onLine(Position(new Point(0, 10), 'screen'), axisX),
      });
    }
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    for (let i = 0; i <= steps; i++) {
      const s = gridSpacing * i;
      const y = topLeft.splus(s, dirPlus.onAxis(axisY.get('model')).unit());
      c.strokeLine(
        Position(y, 'model'),
        Position(y.plus(gridX), 'model'),
      );
      const value = App.project.modelUnit.newAmount(y.trunc().y);
      const label = App.project.displayUnit.format(value);
      if (i > 0) {
        c.text({
          text: label,
          point: Position(y, 'model')
            .onLine(Position(new Point(10, 0), 'screen'), axisY),
        });
      }
    }
    c.strokeStyle = 'black';
  };

  setInterval(() => {
    Time.tick();
    c.clear();
    c.fontSize = App.project.fontSize;
    drawGridLines();
    App.update();
  }, 15);
}, 100);


