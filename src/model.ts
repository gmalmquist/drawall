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

class Room extends Component implements Solo {
  public readonly [SOLO] = true;

  private _wallSet = new Set<Wall>();
  private _walls: Wall[] = [];

  constructor(entity: Entity) {
    super(entity);
  }

  get isInverted(): boolean {
    const poly = this.polygon;
    if (poly === null || poly.isDegenerate) return false;
    const vertices = poly.vertices;
    let inversity = 0;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const c = vertices[(i + 2) % vertices.length];
      const ab = Vectors.between(a, b);
      const bc = Vectors.between(b, c);
      inversity += ab.r90().dot(bc).sign > 0 ? 1 : -1;
    }
    return inversity > 0;
  }

  get walls(): Wall[] {
    return this._walls.map(x => x);
  }

  addWall(wall: Wall) {
    if (!this._wallSet.has(wall)) {
      this._walls.push(wall);
      this._wallSet.add(wall);
    }
    wall.room = this;
  }

  removeWall(wall: Wall) {
    if (this._wallSet.has(wall)) {
      this._wallSet.delete(wall);
      this._walls = this._walls.filter(w => w.name !== wall.name);
    }
    if (wall.room === this) {
      wall.room = null;
    }
    if (this._walls.length === 0) {
      this.entity.destroy();
    }
  }

  containsPoint(point: Position): boolean {
    return !!this.polygon?.contains(point);
  }

  get polygon(): Polygon | null {
    for (const wall of this._walls) {
      return new Polygon(
        wall.getConnectedLoop().map(w => w.src.pos)
      );
    }
    return null;
  }

  get loop(): Wall[] {
    const walls = this._walls;
    if (walls.length === 0) {
      return [];
    }
    return walls[0]!.getConnectedLoop();
  }

  get centroid(): Position {
    const zerop = Position(Point.ZERO, 'model');
    const loop = this.loop;
    if (loop.length === 0) {
      return zerop;
    }
    const zerov = Vector(Vec.ZERO, 'model');
    const sum = this.loop.map(w => w.src.pos)
      .map(w => Vectors.between(zerop, w))
      .reduce((a, b) => a.plus(b), zerov)!;
    return zerop.splus(1.0 / loop.length, sum);
  }

  toJson(): SavedComponent {
    return {
      factory: this.constructor.name,
      arguments: [
        { walls: this.walls.map(w => w.entity.id) },
      ],
    };
  }

  tearDown() {
    for (const wall of this.walls) {
      if (wall.room === this) {
        wall.room = null;
        wall.entity.destroy();
      }
    }
  }
}

ComponentFactories.register(Room, (
  entity: Entity,
  data: {
    walls: Eid[],
  },
) => {
  const walls = data.walls.map(w => entity.ecs.getEntity(w));
  if (walls.some(w => !w?.has(Wall))) {
    return 'not ready';
  }

  const room = entity.getOrCreate(Room);
  walls.forEach(w => room.addWall(w!.only(Wall)));

  return room;
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

class Wall extends Component implements Solo {
  public readonly [SOLO] = true;
  private _src: WallJoint;
  private _dst: WallJoint;
  private _room: Room | null = null;

  constructor(entity: Entity) {
    super(entity);
    this._src = entity.ecs.createEntity().add(WallJoint);
    this._dst = entity.ecs.createEntity().add(WallJoint);
    this.src.attachOutgoing(this);
    this.dst.attachIncoming(this);

    entity.add(
      PhysEdge,
      () => this.src.ref().map(x => x.entity.only(PhysNode)),
      () => this.dst.ref().map(x => x.entity.only(PhysNode)),
    );

    entity.add(Surfaced, () => entity.ref(e => e.only(PhysEdge)));

    const handle = entity.add(Handle, {
      getPos: () => this.src.pos,
      setPos: p => {
      },
      distance: (pt: Position) => new SpaceEdge(this.src.pos, this.dst.pos).distance(pt),
      priority: 0,
      drag: () => ({
        kind: 'group',
        name: 'endpoints',
        aggregate: 'all',
        items: [
          this.src.entity.only(Handle).getDragItem(),
          this.dst.entity.only(Handle).getDragItem(),
        ],
      }),
      onDelete: () => {
        this.elideWall();
        return 'kill';
      },
    });

    const arrowDir = (): Vector => {
      const edge = this.getEdge();
      const srcpos = this.src.pos;
      const dstpos = this.dst.pos;
      const srctan = this.src.incoming?.tangent;
      const dsttan = this.dst.outgoing?.tangent;
      if (!srctan
        || !dsttan
        || !srctan.mag2().nonzero
        || !dsttan.mag2().nonzero) {
        return edge.normal;
      }
      const srcray = new SpaceRay(srcpos, srctan);
      const dstray = new SpaceRay(dstpos, dsttan);
      const tanray = new SpaceRay(
        edge.midpoint.splus(10, edge.normal),
        edge.tangent,
      );
      const srchit = srcray.intersection(tanray);
      const dsthit = dstray.intersection(tanray);
      if (srchit === null || dsthit === null) {
        return edge.normal;
      }
      return Vectors.between(
        edge.midpoint,
        srchit.point.lerp(0.5, dsthit.point),
      ).unit();
    };

    handle.createKnob({
      poly: () => {
        const normal = this.getEdge().normal;
        const src = this.midpoint.splus(Distance(10, 'screen'), normal);
        const dst = src.splus(Distance(50, 'screen'), normal);
        return Polygon.lollipop(src, dst, Distance(10, 'screen'));
      },
      fill: BLUE,
    }, {
      clickable: false,
      selectable: false,
      draggable: true,
      drag: () => {
        const srcpos = this.src.pos;
        const dstpos = this.dst.pos;
        const srctan = this.src.incoming?.tangent;
        const dsttan = this.dst.outgoing?.tangent;
        return {
          kind: 'point',
          name: 'midpoint',
          get: () => this.getEdge().midpoint,
          set: (midpoint) => {
            if (typeof srctan !== 'undefined' && typeof dsttan !== 'undefined') {
              const tangent = Vectors.between(srcpos, dstpos);
              const ray = new SpaceRay(midpoint, tangent);
              const srchit = ray.intersection(new SpaceRay(srcpos, srctan));
              const dsthit = ray.intersection(new SpaceRay(dstpos, dsttan));
              if (srchit === null || dsthit === null) {
                // shouldn't happen unless the edge is degenerate or smth.
                return; 
              }
              this.src.pos = srchit.point;
              this.dst.pos = dsthit.point;
            } else {
              const wing = Vectors.between(srcpos, dstpos).scale(0.5);
              this.src.pos = midpoint.minus(wing);
              this.dst.pos = midpoint.plus(wing);
            }
          },
          disableWhenMultiple: true,
          snapCategories: ['grid', 'guide'],
        };
      },
    });

    entity.add(LengthConstraint,
      () => this.src.entity.only(PhysNode),
      () => this.dst.entity.only(PhysNode),
    );

    entity.add(MinLengthConstraint,
      () => this.src.entity.only(PhysNode),
      () => this.dst.entity.only(PhysNode),
    );

    entity.add(AxisConstraint);
  }

  getConnectedLoop(direction: 'forward' | 'backward' | 'both' = 'both'): Wall[] {
    const results: Wall[] = [ this ];
    const seen: Set<Wall> = new Set(results);

    if (direction === 'backward' || direction === 'both') {
      for (let wall = this.src.incoming;
           wall !== null && !seen.has(wall);
           wall = wall.src.incoming) {
        seen.add(wall);
        results.push(wall);
      }
      reverseInPlace(results);
    }

    if (direction === 'forward' || direction === 'both') {
      for (let wall = this.dst.outgoing;
           wall !== null && !seen.has(wall);
           wall = wall.dst.outgoing) {
        seen.add(wall);
        results.push(wall);
      }
    }

    return results;
  }

  elideWall() {
    const joints = this.src.ref().and(this.dst.ref()).unwrap();
    if (joints === null) return 'kill';
    const [src, dst] = joints;
    const prev = src.incoming;
    const next = dst.outgoing;

    const loop = this.getConnectedLoop('both');
    if (loop.length <= 3) {
      loop.forEach(wall => {
        wall.entity.destroy();
        wall.src.entity.destroy();
        wall.dst.entity.destroy();
      });
      return 'kill';
    }

    if (prev === null || next === null) return 'kill';

    const midjoint = this.entity.ecs.createEntity().add(WallJoint);
    midjoint.pos = src.pos.lerp(0.5, dst.pos);

    prev.dst = midjoint;
    next.src = midjoint;

    return 'kill';
  }

  get room(): Room | null {
    return this._room;
  }

  set room(room: Room | null) {
    if (room === this._room) return;
    const old = this._room;
    this._room = room;
    if (old !== null) {
      old.removeWall(this);
    }
    if (room !== null) {
      room.addWall(this);
    }
  }

  get src() { return this._src; }
  get dst() { return this._dst; }

  set src(j: WallJoint) {
    if (j === this._src) return;
    const old = this._src;
    this._src = j;
    if (old.outgoing === this) {
      old.detachOutgoing();
    }
    j.attachOutgoing(this);
  }

  set dst(j: WallJoint) {
    if (j === this._dst) return;
    const old = this._dst;
    this._dst = j;
    if (old.incoming === this) {
      old.detachIncoming();
    }
    j.attachIncoming(this);
  }

  get outsideNormal(): Vector {
    return this.tangent.r90();
  }

  get insideNormal(): Vector {
    return this.outsideNormal.scale(-1);
  }

  get tangent(): Vector {
    return Vectors.between(this.src.pos, this.dst.pos);
  }

  get midpoint(): Position {
    return this.src.pos.lerp(0.5, this.dst.pos);
  }

  get length(): Distance {
    return Distances.between(this.src.pos, this.dst.pos);
  }

  // split this wall into two walls, creating a new
  // wall joint between them.
  splitWall(at: Position): readonly [Wall, Wall] | null {
    const edge = this.getEdge();
    const s = Vectors.between(edge.src, at).get('model')
      .dot(edge.vector.get('model')) / edge.vector.get('model').mag2();

    if (s >= 1) {
      return null;
    }

    if (s <= 0) {
      // same as above case but on the other side.
      return null;
    }

    const rest = this.entity.ecs.createEntity().add(Wall);
    if (this.room !== null) {
      this.room.addWall(rest);
    }
    rest.src.pos = edge.lerp(s);
    rest.dst = this.dst;
    this.dst = rest.src;

    // need to redestribute length constraints, if enabled.
    const length1 = this.entity.only(LengthConstraint);
    if (length1.enabled) {
      const length2 = rest.entity.only(LengthConstraint);
      const total = length1.targetLength.get();
      length1.targetLength.set(total * s);
      length2.targetLength.set(total * (1-s));
      length2.enabled = true;
      length2.tension = length1.tension;
    }

    length1.entity.only(AxisConstraint).enabled = false;

    return [this, rest];
  }

  getEdge(): SpaceEdge {
    return new SpaceEdge(this.src.pos, this.dst.pos);
  }

  getLength(): Distance {
    return this.getEdge().length;
  }

  toJson(): SavedComponent {
    const lc = this.entity.only(LengthConstraint);
    const ac = this.entity.only(AxisConstraint);
    return {
      factory: this.constructor.name,
      arguments: [
        lc.enabled ? MoreJson.distance.to(Distance(lc.length, 'model')) : false,
        ac.enabled ? ac.axisToggle.get() : 0,
      ],
    };
  }

  tearDown() {
    this.src.detachOutgoing();
    this.dst.detachIncoming();
    this.room = null;
  }
}

ComponentFactories.register(Wall, (
  entity: Entity,
  length: JsonObject | false,
  axis: boolean | 0,
) => {
  const wall = entity.add(Wall);
  const lc = wall.entity.only(LengthConstraint);
  const ac = wall.entity.only(AxisConstraint);

  if (length !== false) {
    lc.enabled = true;
    lc.length = MoreJson.distance.from(length).get('model');
  }

  if (axis !== 0) {
    ac.enabled = true;
    ac.axisToggle.set(axis);
  }

  return wall;
});

class WallJoint extends Component {
  private _pos: Position = Position(Point.ZERO, 'model');
  private _outgoing: Wall | null = null;
  private _incoming: Wall | null = null;

  constructor(entity: Entity) {
    super(entity);

    const position = entity.add(
      PhysNode,
      () => this.pos,
      (pos: Position) => { this.pos = pos; },
    );

    const handle = entity.add(Handle, {
      getPos: () => this.pos,
      setPos: point => {
        const p = App.ui.selection.size === 1 ? App.ui.snapPoint(point) : point;
        this.pos = p;
        entity.get(FixedConstraint).forEach(c => c.updateTargets([p]));
      },
      drag: () => ({
        kind: 'point',
        name: this.name,
        get: () => this.pos,
        set: p => {
          this.pos = p;
          entity.get(FixedConstraint).forEach(c => c.updateTargets([p]));
        },
      }),
      priority: 2,
      onDelete: () => {
        this.elideJoint();
        return 'kill';
      },
    });

    entity.add(AngleConstraint,
      () => {
        return {
          center: position,
          left: this.outgoing ? this.outgoing.dst.entity.onlyRef(PhysNode).or(position) : position,
          right: this.incoming ? this.incoming.src.entity.onlyRef(PhysNode).or(position) : position,
        };
      },
    );

    entity.add(FixedConstraint,
      () => [ this.pos ],
      ([p]: Position[]) => { this.pos = p; },
    );
  }

  shallowDup(): WallJoint {
    // create a wall joint in the same place,
    // but with no connectivity info
    const joint = this.entity.ecs.createEntity().add(WallJoint);
    joint.pos = this.pos;
    return joint;
  }

  elideJoint() {
    // remove this joint from the wall by attempting to join the neighboring walls together.
    const incoming = this.incoming;
    const outgoing = this.outgoing;
    if (incoming === null || outgoing === null) return;
    if (!incoming.entity.isAlive || !outgoing.entity.isAlive) return;
    this._incoming = null;
    this._outgoing = null;

    if (incoming.src.incoming === outgoing.dst.outgoing) {
      // oops, we'll end up with less than three walls! best scrap the whole thing.
      const seen = new Set<WallJoint>();
      for (let joint: WallJoint | null = this; joint != null && !seen.has(joint); joint = outgoing?.dst) {
        joint.entity.destroy();
        seen.add(joint);
      }
      for (let joint: WallJoint | null = this; joint != null && !seen.has(joint); joint = incoming?.src) {
        joint.entity.destroy();
        seen.add(joint);
      }
      this.entity.destroy();
      return;
    }

    const next = outgoing.dst;

    outgoing.dst = outgoing.dst.shallowDup();
    outgoing.src = outgoing.src.shallowDup();
    outgoing.dst.entity.destroy();
    outgoing.src.entity.destroy();
    outgoing.entity.destroy();

    incoming.dst = next;
    incoming.dst.entity.get(AngleConstraint).forEach(a => a.enabled = false);
    incoming.entity.get(LengthConstraint).forEach(a => a.enabled = false);

    this.entity.destroy();
  }

  get pos(): Position {
    return this._pos;
  }

  set pos(p: Position) {
    this._pos = p.to('model');
  }

  get isCorner(): boolean {
    return this.incoming !== null && this.outgoing !== null;
  }

  get incoming(): Wall | null {
    return this._incoming;
  }

  get outgoing(): Wall | null {
    return this._outgoing;
  }

  attachIncoming(wall: Wall) {
    this._incoming = wall;
  }

  attachOutgoing(wall: Wall) {
    this._outgoing = wall;
  }

  detachIncoming() {
    if (this._incoming?.dst === this) {
      this._incoming.entity.destroy();
    }
    this._incoming = null;
    if (this._outgoing === null || this._outgoing.entity.isDestroyed) {
      this.entity.destroy();
    }
  }

  detachOutgoing() {
    if (this._outgoing?.src === this) {
      this._outgoing.entity.destroy();
    }
    this._outgoing = null;
    if (this._incoming === null || this._incoming.entity.isDestroyed) {
      this.entity.destroy();
    }
  }

  override toJson(): SavedComponent {
    const angleConstraint = this.entity.only(AngleConstraint);
    const fixedConstraint = this.entity.only(FixedConstraint);
    const position = this.pos;
    return {
      factory: this.constructor.name,
      arguments: [
        this._incoming === null ? -1 : unwrap(this._incoming.entity.id),
        this._outgoing === null ? -1 : unwrap(this._outgoing.entity.id),
        {
          angle: angleConstraint.enabled 
            ? MoreJson.angle.to(angleConstraint.targetAngle) : false,
          fixed: fixedConstraint.enabled,
          position: MoreJson.position.to(position),
        },
      ],
    };
  }

  override tearDown() {
    const out = this._outgoing;
    const inc = this._incoming;
    if (out !== null && out.src === this) out.entity.destroy();
    if (inc !== null && inc.dst === this) inc.entity.destroy();
  }
}

ComponentFactories.register(WallJoint, (
  entity: Entity,
  incomingId: Eid,
  outgoingId: Eid,
  options: {
    angle: JsonObject | false;
    fixed: boolean;
    position: JsonObject;
  },
) => {
  const joint = entity.getOrCreate(WallJoint);

  const constraint = joint.entity.only(AngleConstraint);
  if (options.angle !== false) {
    const angle = MoreJson.angle.from(options.angle);
    constraint.enabled = true;
    constraint.targetAngle = angle;
  }

  joint.pos = MoreJson.position.from(options.position);
  joint.entity.only(FixedConstraint).enabled = options.fixed;

  if (unwrap(incomingId) >= 0) {
    const incoming = entity.ecs.getEntity(incomingId)?.maybe(Wall);
    if (!incoming) return 'not ready';
    incoming.dst = joint;
  }

  if (unwrap(outgoingId) >= 0) {
    const outgoing = entity.ecs.getEntity(outgoingId)?.maybe(Wall);
    if (!outgoing) return 'not ready';
    outgoing.src = joint;
  }

  return joint;
});

class Constraint extends Component {
  protected readonly enabledRef = Refs.of(false);
  protected readonly tensionRef = Refs.of(0.5);

  public enforce(): void {}

  public priority: number = 0;

  constructor(entity: Entity) {
    super(entity);
    this.addKind(Constraint);
    this.enabledRef.onChange(e => {
      if (e) this.onEnable();
      else this.onDisable();
      App.project.requestSave(`constraint ${this.name} enabled`);
    });
    this.tensionRef.onChange(_ =>
      App.project.requestSave(`${this.name} tension changed`));
  }

  public get enabled(): boolean {
    return this.enabledRef.get();
  }

  public set enabled(enabled: boolean) {
    this.enabledRef.set(enabled);
  }

  public get tension(): number {
    return this.tensionRef.get();
  }

  public set tension(t: number) {
    this.tensionRef.set(t);
  }

  get influence() {
    if (!this.enabled) return 0;
    const dt = clamp01(Time.delta);
    const a = lerp(this.tension, 0, dt);
    const b = lerp(this.tension, dt, 1);
    return lerp(this.tension, a, b);
  }

  // for subclasses to override
  protected onEnable() {}
  protected onDisable() {}
}

class FixedConstraint extends Constraint {
  private targets: Position[] = [];

  constructor(
    entity: Entity,
    private readonly getPoints: () => Position[],
    private readonly setPoints: (pts: Position[]) => void,
  ) {
    super(entity);
    this.tension = 1.0;
    this.priority = 5;
    this.enabled = false;

    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      const lockField = form.add({
        name: 'lock position',
        kind: 'toggle',
        value: this.enabledRef,
        icons: {
          on: Icons.posLocked,
          off: Icons.posUnlocked,
        },
      });
      return form;
    });
  }

  getTargets(): Position[] {
    return this.targets.map(x => x);
  }

  updateTargets(pts: Position[]) {
    this.targets = pts;
  }

  enforce() {
    const influence = this.influence;
    const points = [...this.getPoints()];
    for (let i = 0; i < points.length && i < this.targets.length; i++) {
      points[i] = points[i].lerp(influence, this.targets[i]);
    }
    this.setPoints(points);
  }

  onEnable() {
    this.targets = this.getPoints();
  }
}

class MinLengthConstraint extends Constraint {
  constructor(
    entity: Entity,
    private readonly getSrc: () => PhysNode,
    private readonly getDst: () => PhysNode,
  ) {
    super(entity);
    this.enabled = true;
    this.tension = 1;
  }

  private get springConstant(): number {
    return this.tension * 3;
  }

  private getEdge(): Edge {
    return Spaces.getCalc(
      'model',
      (a: Point, b: Point) => new Edge(a, b),
      this.getSrc().pos, this.getDst().pos,
    );
  }

  enforce() {
    if (this.entity.get(LengthConstraint).some(c => c.enabled)) {
      // only apply this constraint in the absense of another length constraint.
      return;
    }
    const length = App.project.modelUnit.from({ value: 3, unit: 'inch' }).value;
    const edge = this.getEdge();
    if (edge === null) return;
    const delta = length - edge.vector().mag();
    if (delta < 0) {
      return;
    }
    const correction = edge.vector().unit().scale(delta/2 * this.springConstant);
    this.getSrc().addForce(Vector(correction.neg(), 'model'));
    this.getDst().addForce(Vector(correction, 'model'));
  }
}

class LengthConstraint extends Constraint {
  public readonly targetLength = Refs.of(0);
  public lengthReference: LengthReference | null = null;

  constructor(
    entity: Entity,
    private readonly getSrc: () => PhysNode,
    private readonly getDst: () => PhysNode,
  ) {
    super(entity);
    this.enabled = false;

    this.targetLength.onChange(_ => {
      if (this.enabled) App.project.requestSave('target length changed');
    });

    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      const lockField = form.add({
        name: 'lock length',
        kind: 'toggle',
        value: this.enabledRef,
        icons: {
          on: Icons.lengthLocked,
          off: Icons.lengthUnlocked,
        },
      });
      const lengthField = form.add({
        name: 'length',
        label: 'length',
        kind: 'amount',
        hidden: Refs.negate(this.enabledRef),
        value: this.targetLength.map({
          to: modelLength => App.project.displayUnit.from(App.project.modelUnit.newAmount(modelLength)),
          from: amount => App.project.modelUnit.from(amount).value,
          compareValues: (a, b) => a.value === b.value && a.unit === b.unit,
        }),
        min: App.project.modelUnit.newAmount(0),
        unit: Units.distance,
      });
      const hardnessField = form.add({
        name: 'length tension',
        label: 'tension',
        kind: 'slider',
        hidden: Refs.negate(this.enabledRef),
        value: this.tensionRef,
        min: 0,
        max: 1,
      });
      return form;
    });

    Refs.polling({
      poll: () => this.getEdge().length,
      stopWhen: () => this.entity.isDestroyed,
      delayMillis: 250,
    }).onChange(value => {
      if (!this.enabled) {
        this.targetLength.set(value);
      }
    });
  }

  get length() {
    return this.targetLength.get();
  }

  set length(v: number) {
    this.targetLength.set(v);
  }

  private get springConstant(): number {
    return this.tension * 3;
  }

  private getEdge(): Edge {
    return Spaces.getCalc(
      'model',
      (a: Point, b: Point) => new Edge(a, b),
      this.getSrc().pos, this.getDst().pos,
    );
  }

  enforce() {
    if (this.lengthReference !== null) {
      this.length = this.lengthReference.getLength().get('model');
    }

    const edge = this.getEdge();
    if (edge === null) return;
    const delta = this.length - edge.vector().mag();
    const correction = edge.vector().unit().scale(delta/2 * this.springConstant);
    this.getSrc().addForce(Vector(correction.neg(), 'model'));
    this.getDst().addForce(Vector(correction, 'model'));
  }

  onEnable() {
    const mag = this.getEdge()?.vector()?.mag();
    if (typeof mag !== 'undefined') {
      this.length = mag;
    }
  }
}

interface Corner {
  center: PhysNode;
  left: PhysNode;
  right: PhysNode;
}

class AngleConstraint extends Constraint {
  public readonly targetAngleRef = Refs.of(Angle(Radians(Math.PI/2), 'model'));

  constructor(
    entity: Entity,
    public readonly getCorner: () => Corner,
  ) {
    super(entity);

    this.targetAngleRef.onChange(_ => {
      if (this.enabled) App.project.requestSave('target angle changed');
    });

    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      const lockField = form.add({
        name: 'lock angle',
        kind: 'toggle',
        value: this.enabledRef,
        icons: {
          on: Icons.angleLocked,
          off: Icons.angleUnlocked,
        },
      });
      const angleField = form.add({
        name: 'angle',
        label: 'angle',
        kind: 'angle',
        hidden: Refs.negate(this.enabledRef),
        value: this.targetAngleRef,
      });
      const tensionField = form.add({
        name: 'angle tension',
        label: 'tension',
        kind: 'slider',
        hidden: Refs.negate(this.enabledRef),
        value: this.tensionRef,
        min: 0,
        max: 1,
      });
      Refs.polling({
        poll: () => this.currentAngle,
        stopWhen: () => this.entity.isDestroyed,
        delayMillis: 250,
      }).onChange(value => {
        if (!this.enabled) {
          this.targetAngle = value;
        }
      });
      return form;
    });
  }

  get targetAngle(): Angle {
    return this.targetAngleRef.get();
  }

  set targetAngle(a: Angle) {
    this.targetAngleRef.set(a);
  }
    
  private getLeft(): Vector {
    const c = this.getCorner();
    return Vectors.between(c.center.pos, c.left.pos);
  }

  private getRight(): Vector {
    const c = this.getCorner();
    return Vectors.between(c.center.pos, c.right.pos);
  }

  get currentAngle(): Angle {
    const left = this.getLeft();
    const right = this.getRight();
    if (left.mag2().get('model') === 0 || right.mag2().get('model') === 0) {
      return Angles.zero('model');
    }
    return left.angle().minus(right.angle()).normalize();
  }

  get springConstant(): number {
    return this.tension * 3;
  }

  enforce() {
    const left = this.getLeft();
    const right = this.getRight();
    if (left.get('model').mag2() === 0 || right.get('model').mag2() === 0) {
      return;
    }
    const delta = this.targetAngle.normalize().minus(this.currentAngle);
    const corner = this.getCorner();

    const targetLeft = corner.center.pos.plus(left.rotate(delta.scale(this.springConstant / 2)));
    const targetRight = corner.center.pos.plus(right.rotate(delta.scale(-this.springConstant / 2)));

    const deltaL = Vectors.between(corner.left.pos, targetLeft);
    const deltaR = Vectors.between(corner.right.pos, targetRight);
    corner.left.addForce(deltaL.scale(this.tension));
    corner.right.addForce(deltaR.scale(this.tension));

    if (!App.debug) return;
    App.canvas.lineWidth = 1;

    App.canvas.strokeStyle = 'green';
    App.canvas.strokeLine(corner.center.pos, targetLeft);
    App.canvas.strokeStyle = 'blue';
    App.canvas.setLineDash([2, 2]);
    App.canvas.strokeLine(corner.left.pos, targetLeft);
    App.canvas.setLineDash([]);

    App.canvas.strokeStyle = 'red';
    App.canvas.strokeLine(corner.center.pos, targetRight);
    App.canvas.strokeStyle = 'blue';
    App.canvas.setLineDash([2, 2]);
    App.canvas.strokeLine(corner.right.pos, targetRight);
    App.canvas.setLineDash([]);
  }

  onEnable() {
    this.targetAngle = this.currentAngle;
  }
}

class AxisConstraint extends Constraint {
  public readonly axis = Refs.of(
    Vector(Axis.X, 'screen'),
    (one, two) => {
      const a = one.get('screen');
      const b = two.get('screen');
      return a.minus(b).mag() < 0.001;
    },
  );
  public readonly axisToggle = this.axis.map<boolean>({
    to: (axis: Vector) => Math.abs(axis.get('screen').x) < Math.abs(axis.get('screen').y),
    from: (vertical: boolean) => vertical ? Vector(Axis.Y, 'screen') : Vector(Axis.X, 'screen'),
  });

  constructor(entity: Entity) {
    super(entity);
    this.axis.onChange(_ => {
      if (this.enabled) App.project.requestSave('axis constraint changed');
    });
    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      form.add({
        name: 'axis lock enabled',
        kind: 'toggle',
        value: this.enabledRef,
        icons: {
          on: Icons.axisLocked,
          off: Icons.axisUnlocked,
        },
      });
      form.add({
        name: 'axis',
        kind: 'toggle',
        value: this.axisToggle,
        hidden: Refs.negate(this.enabledRef),
        icons: { on: Icons.axisY, off: Icons.axisX }, 
      });
      form.add({
        name: 'axis tension',
        label: 'axis tension',
        kind: 'slider',
        min: 0,
        max: 1,
        value: this.tensionRef,
        hidden: Refs.negate(this.enabledRef),
      });
      return form;
    });
  }

  onEnable() {
    for (const phys of this.entity.get(PhysEdge)) {
      const edge = phys.edge.unwrap();
      if (edge === null) continue;
      const tangent = edge.tangent;
      const x = Vector(Axis.X, 'screen').to(tangent.space);
      const y = Vector(Axis.Y, 'screen').to(tangent.space);
      this.axis.set(tangent.dot(x).abs().gt(tangent.dot(y).abs()) ? x : y);
    }
  }

  enforce() {
    if (!this.entity.has(PhysEdge)) {
      return;
    }
    const phys = this.entity.only(PhysEdge);
    const edge = phys.edge.unwrap();
    if (edge === null) {
      return;
    }
 
    const tangent = edge.tangent;

    const axis = this.axis.get().to('model').unit();
    const flip = axis.dot(tangent) > axis.neg().dot(tangent) ? 1 : -1;

    const center = edge.lerp(0.5);
    const length = edge.length.scale(0.5);

    const targetSrc = center.splus(length, axis.scale(-flip));
    const targetDst = center.splus(length, axis.scale(flip));

    const deltaSrc = Vectors.between(edge.src, targetSrc);
    const deltaDst = Vectors.between(edge.dst, targetDst);

    // now enforce the deltas to be normal to the current position
    // so we hopefully rotate with out changing size, all else equal.
    const normDeltaSrc = deltaSrc.onAxis(edge.normal).unit().scale(deltaSrc.mag());
    const normDeltaDst = deltaDst.onAxis(edge.normal).unit().scale(deltaDst.mag());

    const k = 3 * this.tension; // spring constant

    phys.src.with(s => s.addForce(normDeltaSrc.scale(k / 2)));
    phys.dst.with(s => s.addForce(normDeltaDst.scale(k / 2)));

    App.ifDebug(() => {
      App.canvas.lineWidth = 1;

      App.canvas.strokeStyle = 'purple';
      App.canvas.strokeLine(edge.src, edge.src.plus(normDeltaSrc));

      App.canvas.strokeStyle = 'orange';
      App.canvas.strokeLine(edge.dst, edge.dst.plus(normDeltaDst));

      App.canvas.strokeStyle = BLUE;
      App.canvas.strokeLine(
        center.splus(Distance(1000, 'screen'), axis),
        center.splus(Distance(-1000, 'screen'), axis),
      );
    })
  }
}

// reference the length of something else
interface LengthReference {
  name: string;
  getLength: () => Distance;
}

interface AngleReference {
  name: string;
  getAngle: () => Angle;
}

// cleanup broken geometry
const Recycler = (ecs: EntityComponentSystem) => {
  for (const wall of ecs.getComponents(Wall)) {
    if (wall.dst.entity.isDestroyed || wall.src.entity.isDestroyed) {
      wall.entity.destroy();
    }
  }
  for (const joint of ecs.getComponents(WallJoint)) {
    const incoming = joint.incoming;
    const outgoing = joint.outgoing;
    if (incoming !== null && incoming.entity.isDestroyed) {
      joint.detachIncoming();
    }
    if (outgoing !== null && outgoing.entity.isDestroyed) {
      joint.detachOutgoing();
    }
  }
};

const AxisConstraintRenderer = (ecs: EntityComponentSystem) => {
  if (!App.settings.showGuides.get()) return;
  const canvas = App.canvas;
  const constraints = ecs.getComponents(AxisConstraint);
  for (const constraint of constraints) {
    if (!constraint.enabled) continue;

    const phys = constraint.entity.only(PhysEdge);

    phys.edge.with(edge => {
      const center = edge.midpoint;
      const axis = constraint.axis.get().to(center.space).unit();
      const scale = 1.5;
      const left = center.splus(edge.length.scale(scale/2), axis);
      const right = center.splus(edge.length.scale(scale/2), axis.neg());

      canvas.strokeStyle = BLUE;
      canvas.lineWidth = 1;
      canvas.setLineDash([8, 4]);
      canvas.strokeLine(left, right);
      canvas.setLineDash([]);
    });
  }
};

const createRainbow = (edge: SpaceEdge): CanvasGradient => {
  const gradient = App.canvas.createLinearGradient(edge.src, edge.dst);
  new Array(100).fill(0).forEach((_, i, arr) => {
    const s = 1.0 * i / (arr.length - 1);
    const hue = ((360 * s * 10) + (Time.now * 100.)) % 360; 
    gradient.addColorStop(s, `hsl(${hue},100%,50%)`)
  });
  return gradient;
};

const WallRenderer = (ecs: EntityComponentSystem) => {
  const canvas = App.canvas;

  const rainbow = createRainbow(new SpaceEdge(
    Position(Point.ZERO, 'screen'),
    Position(new Point(canvas.width, canvas.height), 'screen'),
  ));

  const walls = ecs.getComponents(Wall);
  for (const wall of walls) {
    if (wall.src === null || wall.dst ===  null) continue;
    const active = wall.entity.get(Handle).some(h => h.isActive);
   
    const edge = new SpaceEdge(wall.src.pos, wall.dst.pos);
    const wallColor = active ? rainbow : 'black'; 

    const getEndPad = (joint: WallJoint, offset: Distance): Distance => {
      // nb: at offset = 0, this will always be 0
      const angle = joint.entity.only(AngleConstraint).currentAngle;
      const radians = unwrap(angle.get('model'));
      return offset.scale(Math.sin(radians)).neg();
    };

    const strokeWall = (
      width: number,
      offset: Distance = Distances.zero('screen'),
      color: string | CanvasGradient = wallColor,
    ) => {
      const srcpad = getEndPad(wall.src, offset);
      const dstpad = getEndPad(wall.dst, offset);
      const src = wall.src.pos
        .splus(offset, edge.normal)
        .splus(srcpad, edge.tangent);
      const dst = wall.dst.pos
        .splus(offset, edge.normal)
        .splus(dstpad, edge.tangent.neg());
      canvas.strokeStyle = color;
      canvas.lineWidth = width;
      canvas.strokeLine(src, dst);
      canvas.fillStyle = color;
      canvas.fillCircle(src, Distance(width/2, 'screen'));
      canvas.fillCircle(dst, Distance(width/2, 'screen'));
    };

    const thickness = Distance(6, 'screen');
    strokeWall(3, thickness.scale(0.5));
    strokeWall(1, thickness.scale(-0.5));

    if (!App.settings.showLengths.get()) continue;

    const constraint = wall.entity.only(LengthConstraint);
    const error = constraint?.enabled ? edge.length.get('model') - constraint.length : 0;
    const decimals = App.project.displayDecimals;
    const dispLength = App.project.displayUnit.from(
      App.project.modelUnit.newAmount(edge.length.get('model'))
    );
    const dispError = App.project.modelUnit.newAmount(error);
    dispError.value = Math.round(dispError.value);
    const hasError = Math.abs(dispError.value) > 0;
    const lengthText = App.project.displayUnit.format(dispLength, decimals);
    const errorTextU = App.project.displayUnit.format(dispError, decimals);
    const errorText = dispError.value >= 0 ? `+${errorTextU}` : errorTextU;
    const label = hasError ? `${lengthText} (${errorText})` : lengthText;
    const textOffset = Distance(App.settings.fontSize/2 + 10, 'screen');
    const textPosition = edge.lerp(0.5).splus(textOffset.neg(), edge.vector.r90().unit());

    if (constraint.enabled) {
      const offCenter = Distance(App.settings.fontSize * 3, 'screen');
      const maxAccentWidth = edge.length.scale(0.5).minus(offCenter.scale(1.5));
      const accentWidth = Distance(50, 'screen').min(maxAccentWidth);
      if (accentWidth.sign > 0) {
        canvas.strokeStyle = 'black';
        canvas.lineWidth = 1;

        canvas.strokeLine(
          textPosition.splus(offCenter, edge.tangent),
          textPosition.splus(offCenter.plus(accentWidth), edge.tangent),
        );
        canvas.strokeLine(
          textPosition.splus(offCenter, edge.tangent.neg()),
          textPosition.splus(offCenter.plus(accentWidth), edge.tangent.neg()),
        );
      }
    }

    canvas.text({
      point: textPosition,
      axis: edge.vector,
      keepUpright: true,
      text: label,
      fill: 'black',
      shadow: hasError ? (dispError.value > 0 ? PINK : BLUE) : undefined,
      align: 'center',
      baseline: 'middle',
    });

    if (App.debug) {
      canvas.text({
        point: textPosition.splus(Distance(-15, 'screen'), edge.vector.r90().unit()),
        axis: edge.vector,
        keepUpright: true,
        text: wall.name,
        fill: 'black',
        align: 'center',
        baseline: 'middle',
      });
    }
  }
};

const WallJointRenderer = (ecs: EntityComponentSystem) => {
  if (!App.settings.showAngles.get()) return;

  const joints = ecs.getComponents(WallJoint);
  const canvas = App.canvas;
  for (const joint of joints) {
    const active = joint.entity.get(Handle).some(h => h.isActive);
    const locked = joint.entity.get(FixedConstraint).some(f => f.enabled);

    canvas.fillStyle = 'black';
    canvas.strokeStyle = 'black';

    const pos = joint.pos;
    const radius = Distance(5, 'screen');
    if (locked) {
      canvas.fillStyle = 'black';
      canvas.fillCircle(pos, radius);
    } else {
      canvas.fillStyle = 'white';
      canvas.fillCircle(pos, radius);
    }
    canvas.lineWidth = 1;
    canvas.strokeCircle(pos, radius);

    if (active) {
      canvas.lineWidth = 2;
      canvas.strokeStyle = BLUE;
      canvas.strokeCircle(pos, radius.scale(2).plus(Distance(2, 'screen')));
      canvas.lineWidth = 2;
      canvas.strokeStyle = PINK;
      canvas.strokeCircle(pos, radius.scale(2));
    }
  }
};

const RoomRenderer = (ecs: EntityComponentSystem) => {
  ecs.getComponents(Room).forEach(room => {
    App.canvas.text({
      text: room.isInverted ? 'interior wall' : room.name,
      point: room.centroid,
      fill: 'black',
      align: 'center',
      baseline: 'middle',
    });
  });
};

const AngleRenderer = (ecs: EntityComponentSystem) => {
  if (!App.settings.showAngles.get()) return;

  const constraints = ecs.getComponents(AngleConstraint);

  const canvas = App.canvas;

  for (const constraint of constraints) {
    const corner = constraint.getCorner();
    const center = corner.center.pos;
    const leftVec = Vectors.between(center, corner.left.pos);
    const rightVec = Vectors.between(center, corner.right.pos);

    if (leftVec.get('model').mag2() === 0 || rightVec.get('model').mag2() === 0) {
      continue;
    }

    const leftAngle = leftVec.angle(); 
    const rightAngle = rightVec.angle();

    const arcRadius = Distance(15, 'screen');
    const textDistance = arcRadius.map(r => r + 20);

    const angle = Degrees(Math.round(unwrap(toDegrees(constraint.currentAngle.get('model')))));
    const error = Spaces.getCalc('model', (current: Radians, target: Radians) => {
      if (!constraint.enabled) return Degrees(0);
      const delta = Radians(unwrap(current) - unwrap(target));
      return Degrees(Math.round(unwrap(toDegrees(delta))));
    }, constraint.currentAngle, constraint.targetAngle);
    
    const middle = rightVec.rotate(constraint.currentAngle.scale(0.5)).to('model').unit();

    let label = formatDegrees(angle);
    if (unwrap(error) > 0) {
      label = `${label} (+${formatDegrees(error)})`;
    } else if (unwrap(error) < 0) {
      label = `${label} (${formatDegrees(error)})`;
    }

    const color = constraint.enabled ? 'black' : 'hsl(0, 0%, 50%)';
    const highlight = error === Degrees(0) ? undefined
        : error > Degrees(0) ? PINK
        : BLUE;

    canvas.text({
      text: label,
      align: 'center',
      baseline: 'middle',
      point: center.splus(textDistance, middle),
      fill: color,
      shadow: highlight,
    });

    canvas.beginPath();
    canvas.moveTo(center.splus(arcRadius, rightVec.unit()));
    canvas.arc(
      center,
      arcRadius,
      rightAngle,
      leftAngle,
      true,
    );
    canvas.strokeStyle = color;
    canvas.setLineDash(constraint.enabled ? [] : [2, 2]);
    canvas.lineWidth = 1;
    canvas.stroke();
    canvas.setLineDash([]);
  }
};

const ConstraintEnforcer = (ecs: EntityComponentSystem) => {
  const constraints = ecs.getComponents(Constraint);
  // sort ascending so that higher priority constraints
  // have the last say in the next frame's configuration.
  constraints.sort((a, b) => a.priority - b.priority);
  for (const c of constraints) {
    if (!c.enabled) continue;
    c.enforce();
  }
};

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


