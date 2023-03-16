class Wall extends Component {
  public static readonly cid = nextCid();
  id() { return Wall.cid; }

  public src: WallJoint = new WallJoint();
  public dst: WallJoint = new WallJoint();

  constructor() {
    super();
    this.src.outgoing = this;
    this.dst.incoming = this;
  }

  attach(entity: Entity) {
    super.attach(entity);

    entity.ecs.createEntity(this.src); 
    entity.ecs.createEntity(this.dst);

    const handle = new DragHandle({
      getPos: () => App.canvas.viewport.project.point(this.src.pos),
      setPos: p => {
        const delta = Vec.between(this.src.pos, this.dst.pos);
        this.src.pos = App.canvas.viewport.unproject.point(p);
        this.dst.pos = this.src.pos.plus(delta);
      },
      distance: (pt: Point) => App.canvas.viewport.project.distance(
        new Edge(this.src.pos, this.dst.pos).distance(
          App.canvas.viewport.unproject.point(pt),
        )
      ),
      priority: 0,
    });
    entity.add(handle);

    entity.ecs.createEntity(new LengthConstraint(
      100,
      () => new Edge(this.src.pos, this.dst.pos),
      edge => {
        this.src.pos = edge.src;
        this.dst.pos = edge.dst;
      },
    ));
  }
}

class WallJoint extends Component {
  public static readonly cid = nextCid();
  id() { return WallJoint.cid; }

  public pos: Point = Point.ZERO;
  public outgoing: Wall | null = null;
  public incoming: Wall | null = null;

  attach(entity: Entity) {
    super.attach(entity);

    const handle = new DragHandle({
      getPos: () => App.canvas.viewport.project.point(this.pos),
      setPos: p => {
        this.pos = App.canvas.viewport.unproject.point(p);
      },
      distance: (pt: Point) => Vec.between(
        App.canvas.viewport.project.point(this.pos), pt
      ).mag(),
      priority: 1,
    });
    entity.add(handle);

    entity.ecs.createEntity(new AngleConstraint(
      Math.PI/2.,
      () => this.outgoing ?
        Vec.between(this.pos, this.outgoing.dst.pos) : null,
      () => this.incoming ?
        Vec.between(this.pos, this.incoming.src.pos) : null,
      v => {
        if (this.outgoing) {
          this.outgoing.dst.pos = this.pos.plus(v);
        }
      },
      v => {
        if (this.incoming) {
          this.incoming.src.pos = this.pos.plus(v);
        }
      },
    ));
  }
}

abstract class Constraint extends Component {
  public static readonly cid = nextCid();
  id() { return Constraint.cid; }
  abstract enforce(): void;
}

class LengthConstraint extends Constraint {
  constructor(
    private readonly length: number,
    private readonly getEdge: () => Edge | null,
    private readonly setEdge: (e: Edge) => void) {
    super();
  }

  enforce() {
    const edge = this.getEdge();
    if (edge === null) return;
    const delta = this.length - edge.vector().mag();
    const correction = edge.vector().unit().scale(delta/2 * Time.delta);
    this.setEdge(new Edge(
      edge.src.minus(correction),
      edge.dst.plus(correction),
    ));
  }

}

class AngleConstraint extends Constraint {
  constructor(
    private readonly angle: number,
    private readonly getLeft: () => Vec | null,
    private readonly getRight: () => Vec | null,
    private readonly setLeft: (v: Vec) => void,
    private readonly setRight: (v: Vec) => void) {
    super();
  }

  enforce() {
    const left = this.getLeft();
    if (left === null) return;
    const right = this.getRight();
    if (right === null) return;
    const lu = left.unit();
    const ru = right.unit();
    const angle = Math.acos(lu.dot(ru));
    const delta = radianDelta(angle, this.angle);
    this.setLeft(left.rotate(delta/2 * Time.delta));
    this.setRight(right.rotate(-delta/2 * Time.delta));
  }
}

class DragHandle extends Component {
  public static readonly cid = nextCid();
  id() { return DragHandle.cid; }

  constructor(public readonly draggable: Draggable) {
    super();
  }
}

const WallRenderer = (ecs: EntityComponentSystem) => {
  const walls = ecs.getComponents<Wall>(Wall.cid);
  for (const wall of walls) {
    if (wall.src === null || wall.dst ===  null) continue;
    const canvas = App.canvas;
    canvas.strokeStyle = 'black';
    canvas.lineWidth = 1;
    canvas.strokeLine(wall.src.pos, wall.dst.pos);
    const ray = new Edge(wall.src.pos, wall.dst.pos).ray();
    const tickSpacing = 10; // px
    const tickSize = 10; // px
    const ticks = Math.floor(canvas.viewport.project
      .distance(ray.direction.mag()) / tickSpacing);
    for (let i = 0; i < ticks; i++) {
      const s = 1.0 * i / ticks;
      const p = ray.at(s);
      const v = ray.direction.unit()
        .scale(canvas.viewport.unproject.distance(tickSize))
        .rotate(30 * Math.PI / 180);
      canvas.strokeLine(p, p.plus(v));
    }

  }
};

const ConstraintEnforcer = (ecs: EntityComponentSystem) => {
  for (const c of ecs.getComponents<Constraint>(Constraint.cid)) {
    c.enforce();
  }
};
