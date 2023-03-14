
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
    this.g = el.getContext('2d');
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
    this.g.strokeStyle = style;
  }

  set lineWidth(w: number) {
    this.g.lineWidth = w;
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
    g.arc(src.x, src.y, radius, 0, 2 * Math.PI);
    g.stroke();
  }

  fillCircle(src: Point, radius: number) {
    const g = this.g;
    const c = this.transform.point(src);
    g.beginPath();
    g.arc(src.x, src.y, radius, 0, 2 * Math.PI);
    g.stroke();
  }

  fillText(text: string, point: Point) {
    const p = this.transform.point(point);
    this.g.fillText(text, p.x, p.y);
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

setTimeout(() => {
  const c = new Canvas2d(document.getElementById('main-canvas') as HTMLCanvasElement);
  c.handleResize();

  const mouse = new Mouse();
  mouse.listenTo(document.body);

  const state = {
    edge: new Edge(new Point(10, 100), new Point(0, 0)),
  };

  const draggables: Draggable[] = [
    {
      getPos: () => c.viewport.project.point(state.edge.src),
      setPos: p => { state.edge = new Edge(c.viewport.unproject.point(p), state.edge.dst); },
      distance: p => Vec.between(p, c.viewport.project.point(state.edge.src)).mag(),
      priority: 1,
    },
    {
      getPos: () => c.viewport.project.point(state.edge.dst),
      setPos: p => { state.edge = new Edge(state.edge.src, c.viewport.unproject.point(p)); },
      distance: p => Vec.between(p, c.viewport.project.point(state.edge.dst)).mag(),
      priority: 1,
    },
    {
      getPos: () => c.viewport.project.point(state.edge.src),
      setPos: p => {
        state.edge = new Edge(
          c.viewport.unproject.point(p),
          c.viewport.unproject.point(p).plus(state.edge.vector())
        );
      },
      distance: p => c.viewport.project.distance(state.edge.distance(c.viewport.unproject.point(p))),
      priority: 0,
    },
    {
      getPos: () => c.viewport.project.point(c.viewport.origin),
      setPos: (p, delta, o) => {
        console.log(`${c.viewport.getWorldFrame()}`);
        const { origin, project, unproject } = o as {
          origin: Point,
          project: Transform2,
          unproject: Transform2,
        };
        c.viewport.origin = origin.minus(unproject.vec(delta));
        c.updateTransforms();
      },
      distance: (p) => 0,
      priority: -1,
      getState: () => ({
        origin: c.viewport.origin,
        project: c.viewport.project,
        unproject: c.viewport.unproject,
      }),
    },
  ];

  const priority = (draggable: Draggable): number => {
    if (typeof draggable.priority === 'undefined') return 0;
    return draggable.priority;
  };

  mouse.addDragListener({
    dragStart: drag => {
      let closest: Draggable | null = null;
      let closestD = 0;
      for (const d of draggables) {
        const distance = d.distance(drag.start);
        if (distance > 20) continue;
        if (closest === null 
          || priority(d) > priority(closest) 
          || (priority(d) === priority(closest) && distance < closestD)) {
          closest = d;
          closestD = distance;
        }
      }
      if (closest !== null) {
        drag.addDraggable(closest);
      }
    }, 
    dragUpdate: drag => {
    },
    dragEnd: drag => {
    },
  });

  setInterval(() => {
    c.clear();

    const { edge } = state;

    const mouseW = c.viewport.unproject.point(mouse.pos);

    const dist = c.viewport.project.distance(edge.distance(mouseW));

    c.lineWidth = dist < 10 ? 2 : 1;
    c.strokeLine(edge.src, edge.dst);
    c.lineWidth = 1;
    
    c.strokeCircle(mouse.pos, 3);

    c.fillText(`${dist}`, new Point(-25, 25)); 
  }, 15);
}, 100);


