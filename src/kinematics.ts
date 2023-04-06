interface PointMass {
  readonly position: RefView<Position, RefK>,
  readonly addForce: (force: Vector) => void;
}

class PhysNode extends Component implements Solo, Surface, PointMass {
  readonly [SOLO] = true;

  private static readonly CMP_POINT = (a: Point, b: Point) => {
    return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001
  };

  private readonly pointRef = Refs.of(Point.ZERO, PhysNode.CMP_POINT);
  private velocity: Vec = Vec.ZERO;
  private acceleration: Vec = Vec.ZERO;
  private forceAccum: Vec = Vec.ZERO;
  private mass: number = 1.0;
  private dragFactor: number = 0.5;

  public readonly position: Ref<Position>;

  constructor(entity: Entity) {
    super(entity);

    this.position = this.pointRef.map({
      to: pt => Position(pt, 'model'),
      from: pos => pos.get('model'),
      compareValues: areEq,
    });
  }

  get pos(): Position {
    return this.position.get();
  }

  set pos(p: Position) {
    this.position.set(p);
  }

  update() {
    const dt = Time.delta;

    // fake physics: if there are no forces, we don't move
    if (this.forceAccum.mag() < 0.1) {
      this.velocity = Vec.ZERO;
    }

    const dragForce = this.velocity.scale(-this.dragFactor * this.velocity.mag());

    this.velocity = this.velocity.splus(dt / this.mass, dragForce);
    this.velocity = this.velocity.splus(dt, this.acceleration);
    this.velocity = this.velocity.splus(dt / this.mass, this.forceAccum);
    const delta = this.velocity.scale(dt);
    if (delta.mag2() > 0.0001) {
      this.pointRef.set(this.pointRef.get().plus(delta));
    }
    this.clearForces();
  }

  addForce(f: Vector) {
    this.forceAccum = this.forceAccum.plus(f.get('model'));
  }

  clearForces() {
    this.forceAccum = Vec.ZERO;
  }

  intersects(sdf: SDF): boolean {
    return sdf.contains(this.pos);
  }

  containedBy(sdf: SDF): boolean {
    return sdf.contains(this.pos);
  }

  toJson(): SavedComponent | null {
    return {
      factory: this.constructor.name,
      arguments: [ MoreJson.position.to(this.pos) ],
    };
  }
}

ComponentFactories.register(PhysNode, (
  entity: Entity,
  pos: JsonObject,
) => {
  const node = entity.getOrCreate(PhysNode);
  node.pos = MoreJson.position.from(pos);
  return node;
});

class MemoEdge implements EdgeLike {
  private readonly _vector = Memo((): Vector => Vectors.between(this.src, this.dst));
  private readonly _tangent = Memo((): Vector => this.vector.unit());
  private readonly _normal = Memo((): Vector => this.tangent.r90());
  private readonly _midpoint = Memo((): Position => this.lerp(0.5));
  private readonly _length = Memo((): Distance => Distances.between(this.src, this.dst));

  constructor(
    public readonly src: Position,
    public readonly dst: Position,
  ) {
  }

  public get vector() { return this._vector(); }
  public get tangent() { return this._tangent(); }
  public get normal() { return this._normal(); }
  public get midpoint() { return this._midpoint(); }
  public get length() { return this._length(); }

  public lerp(s: number): Position {
    return this.src.lerp(s, this.dst);
  }

  public unlerp(p: Position): number {
    const vector = this.vector;
    return Vectors.between(this.src, p).dot(vector).div(vector.mag2());
  }

  public closestPoint(pos: Position): Position {
    const s = this.unlerp(pos);
    if (s <= 0) return this.src;
    if (s >= 1) return this.dst;
    return this.lerp(s);
  }

  public distanceFrom(pos: Position): Distance {
    return Distances.between(pos, this.closestPoint(pos));
  }

  public intersection(other: MemoEdge): Position | null {
    const denominator = this.vector.dot(other.normal);
    if (denominator.sign === 0) return null;
    const time = Vectors.between(this.src, other.src).dot(other.normal)
      .div(denominator);
    if (time < 0 || time > 1) return null;
    
    const hit = this.lerp(time);
    const s = other.unlerp(hit);
    if (s < 0 || s > 1) return null;
    return hit;
  }
}

class PhysEdge extends Component implements Solo, Surface {
  public readonly [SOLO] = true;

  public readonly edgeRef: RoRef<MemoEdge>;

  constructor(
    entity: Entity,
    public readonly srcRef: RoRef<PointMass>,
    public readonly dstRef: RoRef<PointMass>,
  ) {
    super(entity);
    this.edgeRef = Refs.memo(
      Refs.reduceRo(a => a,
        Refs.flatMapRo(srcRef, p => p.position), 
        Refs.flatMapRo(dstRef, p => p.position), 
      ),
      ([a, b]) => new MemoEdge(a, b),
    );
  }

  get edge(): MemoEdge {
    return this.edgeRef.get();
  }

  addForces({src, dst}: { src: Vector, dst: Vector }) {
    this.srcRef.get().addForce(src);
    this.dstRef.get().addForce(dst);
  }

  addForce(force: Vector) {
    this.addForces({
      src: force,
      dst: force,
    });
  }

  intersects(sdf: SDF): boolean {
    if (this.containedBy(sdf)) return true;
    const edge = this.edge;
    const hit = sdf.raycast(new SpaceRay(edge.src, edge.vector));
    return hit !== null && hit.time >= 0 && hit.time <= 1;
  }

  containedBy(sdf: SDF): boolean {
    const edge = this.edge;
    return sdf.contains(edge.src) && sdf.contains(edge.dst);
  }
}

const Kinematics = (ecs: EntityComponentSystem) => {
  const enabled = App.settings.kinematics.get() && !App.ui.dragging;

  const positions = ecs.getComponents(PhysNode);
  if (!enabled) {
    // make sure we're not accumulating forces in the meantime
    positions.forEach(p => p.clearForces());
    return; 
  }

  const points = positions.map(p => p.pos);

  positions.forEach(p => p.update());

  // correct drift
  if (positions.length > 0) {
    let dx = 0.;
    let dy = 0.;
    for (let i = 0; i < positions.length; i++) {
      const a = points[i].get('model');
      const b = positions[i].pos.get('model');
      dx += b.x - a.x;
      dy += b.y - a.y;
    }
    dx /= positions.length;
    dy /= positions.length;
    const drift = Vector(new Vec(dx, dy), 'model');
    if (drift.get('model').mag2() > 0) {
      positions.forEach(p => {
        p.pos = p.pos.minus(drift);
      });
    }
  }
};

