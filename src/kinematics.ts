class PhysNode extends Component implements Solo, Surface {
  readonly [SOLO] = true;

  private static readonly CMP_POINT = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

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
    if (this.velocity.mag2() > 0.0001) {
      this.pointRef.set(this.pointRef.get().splus(dt, this.velocity));
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

class PhysEdge extends Component implements Solo, Surface {
  public readonly [SOLO] = true;

  constructor(
    entity: Entity,
    private readonly _src: () => EntityRef<PhysNode>,
    private readonly _dst: () => EntityRef<PhysNode>,
  ) {
    super(entity);
  }

  get src(): EntityRef<PhysNode> {
    return this._src();
  }

  get dst(): EntityRef<PhysNode> {
    return this._dst();
  }

  get edge(): EntityRef<SpaceEdge> {
    return this.src.and(this.dst).map(([src, dst]) => new SpaceEdge(src.pos, dst.pos));
  }

  addForce(force: Vector) {
    this.src.and(this.dst).with(([a, b]) => {
      a.addForce(force);
      b.addForce(force);
    });
  }

  intersects(sdf: SDF): boolean {
    if (this.containedBy(sdf)) return true;
    return this.src.and(this.dst).map(([a, b]) => {
      // lazy sampling is good enough for now
      const samples = 100;
      for (let i = 0; i < samples; i++) {
        if (sdf.contains(a.pos.lerp(1.0*i/samples, b.pos))) return true;
      }
      return false;
    }).or(false);
  }

  containedBy(sdf: SDF): boolean {
    return this.src.and(this.dst).map(([a, b]) => {
      return a.containedBy(sdf) && b.containedBy(sdf);
    }).or(false);
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

