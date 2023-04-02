class PhysNode extends Component implements Solo, Surface {
  readonly [SOLO] = true;

  private _pos: Point = Point.ZERO;
  private velocity: Vec = Vec.ZERO;
  private acceleration: Vec = Vec.ZERO;
  private forceAccum: Vec = Vec.ZERO;
  private mass: number = 1.0;
  private dragFactor: number = 0.5;

  constructor(
    entity: Entity,
    private readonly getPos?: () => Position,
    private readonly setPos?: (p: Position) => void) {
    super(entity);
  }

  get pos(): Position {
    return typeof this.getPos === 'undefined' ? Position(this._pos, 'model') : this.getPos();
  }

  set pos(p: Position) {
    if (typeof this.setPos !== 'undefined') {
      this.setPos(p);
    } else {
      this._pos = p.get('model');
    }
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
    this.pos = this.pos.splus(dt, Vector(this.velocity, 'model'));
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
    if (this.getPos || this.setPos) return null;
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

