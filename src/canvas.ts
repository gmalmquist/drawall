class CanvasViewport {
  constructor(
    public origin: Point = Point.ZERO,
    public radius: number = 100.,
    public screen_width: number = 1000,
    public screen_height: number = 1000) {}

  getWorldFrame(): Frame {
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
    const world = this.getWorldFrame().unproject;
    const screen = this.getScreenFrame().project;
    return {
      point: p => screen.point(world.point(p)),
      vec: v => screen.vec(world.vec(v)),
      distance: d => screen.distance(world.distance(d)),
    };
  }

  get unproject(): Transform2  {
    const world = this.getWorldFrame().project;
    const screen = this.getScreenFrame().unproject;
    return {
      point: p => world.point(screen.point(p)),
      vec: v => world.vec(screen.vec(v)),
      distance: d => world.distance(screen.distance(d)),
    };
  }
}

class Canvas2d {
  private readonly g: CanvasRenderingContext2D;
  private transform: Transform2 = Frame.IDENTITY.project;
  private untransform: Transform2 = Frame.IDENTITY.unproject;
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

  moveTo(pos: Point) {
    const p = this.transform.point(pos);
    this.g.moveTo(p.x, p.y);
  }

  lineTo(pos: Point) {
    const p = this.transform.point(pos);
    this.g.lineTo(p.x, p.y);
  }

  bezierCurveTo(two: Point, three: Point, four: Point) {
    const b = this.transform.point(two);
    const c = this.transform.point(three);
    const d = this.transform.point(four);
    this.g.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y);
  }

  arc(
    center: Point,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterClockwise?: boolean,
  ) {
    const c = this.transform.point(center);
    this.g.arc(c.x, c.y, radius, startAngle, endAngle, counterClockwise);
  }

  strokeLine(src: Point, dst: Point) {
    const g = this.g;
    const t = this.transform.point;
    const [a, b] = [t(src), t(dst)];
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }

  strokeCircle(src: Point, radius: number) {
    const g = this.g;
    const c = this.transform.point(src);
    g.beginPath();
    g.arc(c.x, c.y, radius, 0, 2 * Math.PI);
    g.stroke();
  }

  fillCircle(src: Point, radius: number) {
    const g = this.g;
    const c = this.transform.point(src);
    g.beginPath();
    g.arc(c.x, c.y, radius, 0, 2 * Math.PI);
    g.fill();
  }

  text(props: TextDrawProps) {
    const p = this.transform.point(props.point);
    const fillStyle = props.fill || this.g.fillStyle;
    const axisAngle = typeof props.axis === 'undefined' ? 0
      : this.transform.vec(props.axis).angle();
    const angle = props.keepUpright ? uprightAngle(axisAngle) : axisAngle;
    this.g.translate(p.x, p.y);
    this.g.rotate(angle);
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
    this.g.rotate(-angle);
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
    this.transform = this.viewport.project;
    this.untransform = this.viewport.unproject;
  }
}

interface TextDrawProps {
  text: string;
  point: Point;
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  shadow?: string;
  axis?: Vec;
  keepUpright?: boolean;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

setTimeout(() => {
  const c = App.canvas;
  c.handleResize();

  window.addEventListener('resize', () => App.canvas.handleResize());

  const mouse = App.mouse;
  mouse.listenTo(App.pane);

  const canvasHandle = App.ecs.createEntity().add(Handle, {
    getPos: () => c.viewport.project.point(c.viewport.origin),
    distance: (p) => 0,
    draggable: true,
    clickable: false,
    hoverable: false,
    priority: -1,
  });
  canvasHandle.ignoreNonPrimary = false;

  canvasHandle.onDrag({
    onStart: (e) => ({
      origin: c.viewport.origin,
      project: c.viewport.project,
      unproject: c.viewport.unproject,
    }),
    onUpdate: (e, context) => {
      const { origin, project, unproject } = context;
      c.viewport.origin = origin.minus(unproject.vec(e.delta));
      c.updateTransforms();
      return context;
    },
    onEnd: (e, context) => {
    },
  });

  App.pane.addEventListener('wheel', event => {
    const wheel = event as WheelEvent;
    c.viewport.radius = Math.max(10, c.viewport.radius + Math.sign(wheel.deltaY) * 10);
    c.updateTransforms();
  });

  const drawGridLines = () => {
    // render grid
    const gridSpacing = App.project.worldUnit.from(App.project.gridSpacing).value;
    const left = c.viewport.unproject.vec(new Vec(-1, 0)).unit();
    const right = c.viewport.unproject.vec(new Vec(1, 0)).unit();
    const up = c.viewport.unproject.vec(new Vec(0, -1)).unit();
    const down = c.viewport.unproject.vec(new Vec(0, 1)).unit();

    const dirMinus = left.plus(up);
    const dirPlus = right.plus(down);
    const topLeft = c.viewport.unproject.point(Point.ZERO)
      .trunc(gridSpacing)
      .splus(gridSpacing, dirMinus);
    const bottomRight = c.viewport.unproject.point(new Point(c.width, c.height))
      .trunc(gridSpacing)
      .splus(gridSpacing, dirPlus);
    const gridX = Vec.between(topLeft, bottomRight).onAxis(c.viewport.unproject.vec(Axis.X));
    const gridY = Vec.between(topLeft, bottomRight).onAxis(c.viewport.unproject.vec(Axis.Y));
    const steps = Math.floor(Math.max(gridX.mag(), gridY.mag()) / gridSpacing);

    c.lineWidth = 1;
    c.strokeStyle = '#ccc'; 
    c.fillStyle = 'black'; 
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let i = 0; i <= steps; i++) {
      const s = gridSpacing * i;
      const x = topLeft.splus(s, dirPlus.onAxis(c.viewport.unproject.vec(Axis.X)).unit());
      c.strokeLine(x, x.plus(gridY));
      const value = App.project.worldUnit.newAmount(x.trunc().x);
      const label = App.project.displayUnit.format(value);
      c.text({
        text: label,
        point: x.onLine(
          c.viewport.unproject.point(new Point(0, 10)),
          c.viewport.unproject.vec(Axis.X),
        ),
      });
    }
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    for (let i = 0; i <= steps; i++) {
      const s = gridSpacing * i;
      const y = topLeft.splus(s, dirPlus.onAxis(c.viewport.unproject.vec(Axis.Y)).unit());
      c.strokeLine(y, y.plus(gridX));
      const value = App.project.worldUnit.newAmount(y.trunc().y);
      const label = App.project.displayUnit.format(value);
      if (i > 0) {
        c.text({
          text: label,
          point: y.onLine(
            c.viewport.unproject.point(new Point(10, 0)),
            c.viewport.unproject.vec(Axis.Y), 
          ),
        });
      }
    }
    c.strokeStyle = 'black';
  };

  setInterval(() => {
    Time.tick();
    c.clear();
    drawGridLines();
    App.update();
  }, 15);
}, 100);


