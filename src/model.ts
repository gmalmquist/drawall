class Room extends Component implements Solo {
  public readonly [SOLO] = true;

  private static TRIANGULATION_FREQUENCY: number = 1.0;

  private _wallSet = new Set<Wall>();
  private _walls: Wall[] = [];
  private _triangulation: Array<Triangle> = [];
  private _triangulatedAt: number = 0;
  private _triangulatedWith: Array<Position> = [];
  private readonly _polygon: () => RoRef<Polygon> | null;
  private readonly relativeLabelPos = Refs.of(
    Vectors.zero('model'),
    (a, b) => Distances.between(a.toPosition(), b.toPosition()).get('model') < 0.001,
  );
  private readonly _inverted: () => boolean;

  constructor(entity: Entity) {
    super(entity);
    
    const handle = entity.add(Handle, {
      setPos: _ => {},
      getPos: () => this.labelPos,
      distance: p => Distances.between(this.labelPos, p)
        .minus(Distance(20, 'screen')),
      selectable: false,
      hoverable: false,
      clickable: true,
      draggable: true,
      drag: () => ({
        kind: 'point',
        get: () => this.labelPos,
        set: p => { this.labelPos = p; },
        name: this.name,
        disableWhenMultiple: true,
      }),
    });

    const popup = entity.ecs.createEntity().add(PopupWindow);
    const mini = new MiniForm();
    mini.layout = 'column';
    popup.appendHTML(mini.element);
    const labelInput = new TextInput();
    labelInput.setValue(this.name);
    labelInput.onChange((name: string) => {
      if (this.name !== name) {
        this.name = name;
      }
      popup.hide();
    });
    mini.append(labelInput);

    handle.events.onMouse('click', e => {
      popup.title = `Room '${this.name}'`;
      popup.setPosition(e.position);
      labelInput.setValue(this.name);
      popup.show();
    });

    this._polygon = Memo(() => {
      const loop = this.loop;
      if (loop.length < 3) return null;
      return Refs.memo(
        Refs.reduceRo(a => a, ...loop.map(w => Refs.flatMapRo(w.srcRef, s => s.position))),
        (points: Position[]) => {
          return new Polygon(points);
        },
      );
    }, () => this.loop);

    this._inverted = Memo(
      () => this.calcInverted(this.polygon),
      () => [this.polygon],
    );
  }

  get labelPos(): Position {
    return this.centroid.plus(this.labelOffset);
  }

  set labelPos(pos: Position) {
    const poly = this.polygon;
    const centroid = this.centroid;
    const radius = poly
      ? poly.vertices.map(v => Distances.between(centroid, v))
        .reduce((a, b) => a.max(b), Distance(0, 'model'))
      : Distance(0, 'model');
    const delta = Vectors.between(this.centroid, pos);
    this.labelOffset = delta.mag().gt(radius) ? delta.unit().scale(radius) : delta;
  }

  get labelOffset(): Vector {
    return this.relativeLabelPos.get();
  }

  set labelOffset(v: Vector) {
    this.relativeLabelPos.set(v);
  }

  get isInverted(): boolean {
    return this._inverted();
  }

  private calcInverted(poly: Polygon | null): boolean {
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

  get area(): Distance {
    const poly = this.polygon;
    if (!poly) return Distance(0, 'model');
    return poly.area;
  }

  get triangulation(): Triangle[] {
    this.checkTriangulation();
    return [...this._triangulation];
  }

  get polygon(): Polygon | null {
    const poly = this._polygon();
    if (poly === null) return null;
    return poly.get();
  }

  get loop(): Wall[] {
    const walls = this._walls;
    if (walls.length === 0) {
      return [];
    }
    return walls[0]!.getConnectedLoop();
  }

  get centroid(): Position {
    return this.polygon?.centroid || Position(Point.ZERO, 'model');
  }

  private checkTriangulation() {
    const poly = this.polygon;
    if (poly === null) {
      this._triangulation = [];
      return;
    }

    if (this._triangulatedAt + Room.TRIANGULATION_FREQUENCY > Time.now) {
      return;
    }
    this._triangulatedAt = Time.now;

    const eps = Distance(1, 'screen');
    const verts = poly.vertices;
    if (verts.length === this._triangulatedWith.length
      && verts.every((v, i) => Distances.between(v, this._triangulatedWith[i]).lt(eps))) {
      return; // nothing to do
    }

    this._triangulation = Triangle.triangulate(poly);
    this._triangulatedWith = verts;
  }

  toJson(): SavedComponent {
    return {
      factory: this.constructor.name,
      arguments: [
        {
          walls: this.walls.map(w => w.entity.id),
          labelOffset: MoreJson.vector.to(this.labelOffset),
        },
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
    labelOffset: JsonObject,
  },
) => {
  const walls = data.walls.map(w => entity.ecs.getEntity(w));
  if (walls.some(w => !w?.has(Wall))) {
    return 'not ready';
  }

  const room = entity.getOrCreate(Room);
  walls.forEach(w => room.addWall(w!.only(Wall)));

  if (data.labelOffset) {
    room.labelOffset = MoreJson.vector.from(data.labelOffset);
  }

  return room;
});

class Wall extends Component implements Solo {
  public readonly [SOLO] = true;
  public readonly srcRef: Ref<WallJoint>;
  public readonly dstRef: Ref<WallJoint>;
  public readonly vector: RoRef<Vector>;
  public readonly tangent: RoRef<Vector>;
  public readonly normal: RoRef<Vector>;
  public readonly midpoint: RoRef<Position>;
  private _room: Room | null = null;

  constructor(entity: Entity) {
    super(entity);
    this.srcRef = Refs.of(entity.ecs.createEntity().add(WallJoint), areEq);
    this.dstRef = Refs.of(entity.ecs.createEntity().add(WallJoint), areEq);
    this.src.attachOutgoing(this);
    this.dst.attachIncoming(this);

    entity.add(
      PhysEdge,
      Refs.memo(this.srcRef, j => j.entity.only(PhysNode)),
      Refs.memo(this.dstRef, j => j.entity.only(PhysNode)),
    );

    entity.add(Surfaced, () => entity.ref(e => e.only(PhysEdge)));

    this.vector = Refs.memo(
      Refs.reduceRo(
        a => a,
        Refs.flatMapRo(this.srcRef, j => j.position),
        Refs.flatMapRo(this.dstRef, j => j.position),
      ),
      ([src, dst]) => Vectors.between(src, dst),
    );
    this.tangent = Refs.memo(this.vector, v => v.unit());
    this.normal = Refs.memo(this.tangent, v => v.r90());
    this.midpoint = Refs.memo(
      Refs.reduceRo(
        a => a,
        Refs.flatMapRo(this.srcRef, j => j.position),
        Refs.flatMapRo(this.dstRef, j => j.position),
      ),
      ([src, dst]) => src.lerp(0.5, dst),
    );

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

    const forceFixed = (p: WallJoint) => {
      const f = p.entity.only(FixedConstraint);
      f.updateTargets([p.pos]);
    };

    const lollipopBase = Polygon.lollipop(
      Position(new Point(10, 0), 'screen'),
      Position(new Point(40, 0), 'screen'),
      Distance(10, 'screen'),
    );

    // NB: i don't like that we have to add the fake dependency on the viewport
    // here. the issue is that the conversion between screen and model space is
    // only valid until the view changes, so it doesn't hold for cached values
    // like this.
    const lollipopRef = Refs.memo(
      Refs.reduceRo(x => x, this.midpoint, this.normal, App.viewport.changedRef),
      ([midpoint, normal, _]) => {
        return lollipopBase
          .rotate(this.normal.get().angle())
          .translate(this.midpoint.get().toVector());
      },
    );

    handle.createKnob({
      poly: () => lollipopRef.get(),
      fill: BLUE,
    }, {
      clickable: false,
      selectable: false,
      draggable: true,
      drag: () => {
        const srcpos = this.src.pos;
        const dstpos = this.dst.pos;
        const srctan = this.src.incoming?.tangent.get();
        const dsttan = this.dst.outgoing?.tangent.get();
        return {
          kind: 'point',
          name: 'edge',
          get: this.midpoint.get,
          set: (midpoint) => {
            if (typeof srctan !== 'undefined' && typeof dsttan !== 'undefined') {
              const tangent = this.tangent.get();
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
            forceFixed(this.src);
            forceFixed(this.dst);
          },
          disableWhenMultiple: true,
          snapCategories: ['grid', 'guide'],
        };
      },
    });

    entity.add(LengthConstraint);
    entity.add(MinLengthConstraint);
    entity.add(AxisConstraint);
  }

  get srcRo(): RoRef<WallJoint> {
    return Refs.ro(this.srcRef);
  }

  get dstRo(): RoRef<WallJoint> {
    return Refs.ro(this.dstRef);
  }

  getEdge(): SpaceEdge {
    return new SpaceEdge(this.src.pos, this.dst.pos);
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

  get src() { return this.srcRef.get(); }
  get dst() { return this.dstRef.get(); }

  set src(j: WallJoint) {
    if (j === this.srcRef.get()) return;
    const old = this.srcRef.get();
    this.srcRef.set(j);
    if (old.outgoing === this) {
      old.detachOutgoing();
    }
    j.attachOutgoing(this);
  }

  set dst(j: WallJoint) {
    if (j === this.dstRef.get()) return;
    const old = this.dstRef.get();
    this.dstRef.set(j);
    if (old.incoming === this) {
      old.detachIncoming();
    }
    j.attachIncoming(this);
  }

  get outsideNormal(): Vector {
    return this.normal.get();
  }

  get insideNormal(): Vector {
    return this.outsideNormal.scale(-1);
  }

  get length(): Distance {
    return this.vector.get().mag();
  }

  // split this wall into two walls, creating a new
  // wall joint between them.
  splitWall(at: Position): readonly [Wall, Wall] | null {
    const edge = new SpaceEdge(this.src.pos, this.dst.pos);
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

    if (this.room !== null) {
      this.room.addWall(rest);
    }

    return [this, rest];
  }

  toJson(): SavedComponent {
    const lc = this.entity.only(LengthConstraint);
    const ac = this.entity.only(AxisConstraint);
    return {
      factory: this.constructor.name,
      arguments: [
        false,
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
  ignore: false,
  axis: boolean | 0,
) => {
  const wall = entity.add(Wall);
  const ac = wall.entity.only(AxisConstraint);

  if (axis !== 0) {
    ac.enabled = true;
    ac.axisToggle.set(axis);
  }

  return wall;
});

class WallJoint extends Component {
  private readonly outRef = Refs.of<Wall | null>(null, areEq);
  private readonly incRef = Refs.of<Wall | null>(null, areEq);
  private readonly node: PhysNode;

  constructor(entity: Entity) {
    super(entity);

    this.node = entity.getOrCreate(PhysNode);

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

    const leftRef = Refs.of(this.node, areEq);
    const rightRef = Refs.of(this.node, areEq);
    this.outRef.onChange(out => {
      if (out === null) {
        leftRef.set(this.node);
        return;
      }
      leftRef.set(out.dst.node);
      out.dstRef.onChange(dst => {
        if (out === this.outRef.get()) {
          leftRef.set(dst.node);
        }
      });
    });
    this.incRef.onChange(inc => {
      if (inc === null) {
        rightRef.set(this.node);
        return;
      }
      rightRef.set(inc.src.node);
      inc.srcRef.onChange(src => {
        if (inc === this.incRef.get()) {
          rightRef.set(src.node);
        }
      });
    });
    entity.add(AngleConstraint, this.node, Refs.ro(leftRef), Refs.ro(rightRef));

    entity.add(FixedConstraint,
      () => [ this.pos ],
      ([p]: Position[]) => { this.pos = p; },
    );
  }

  get incRo(): RoRef<Wall | null> {
    return Refs.ro(this.incRef);
  }

  get outRo(): RoRef<Wall | null> {
    return Refs.ro(this.outRef);
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
    this.incRef.set(null);
    this.outRef.set(null);

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
    return this.node.pos;
  }

  set pos(p: Position) {
    this.node.pos = p;
  }

  get position(): Ref<Position> {
    return this.node.position;
  }

  get isCorner(): boolean {
    return this.incoming !== null && this.outgoing !== null;
  }

  get incoming(): Wall | null {
    return this.incRef.get();
  }

  get outgoing(): Wall | null {
    return this.outRef.get();
  }

  attachIncoming(wall: Wall) {
    this.incRef.set(wall);
  }

  attachOutgoing(wall: Wall) {
    this.outRef.set(wall);
  }

  detachIncoming() {
    const incoming = this.incoming;
    const outgoing = this.outgoing;
    if (incoming?.dst === this) {
      incoming.entity.destroy();
    }
    this.incRef.set(null);
    if (outgoing === null || outgoing.entity.isDestroyed) {
      this.entity.destroy();
    }
  }

  detachOutgoing() {
    const incoming = this.incoming;
    const outgoing = this.outgoing;
    if (outgoing?.src === this) {
      outgoing.entity.destroy();
    }
    this.outRef.set(null);
    if (incoming === null || incoming.entity.isDestroyed) {
      this.entity.destroy();
    }
  }

  override toJson(): SavedComponent {
    const angleConstraint = this.entity.only(AngleConstraint);
    const fixedConstraint = this.entity.only(FixedConstraint);
    const position = this.pos;
    const incoming = this.incoming;
    const outgoing = this.outgoing;
    return {
      factory: this.constructor.name,
      arguments: [
        incoming === null ? -1 : unwrap(incoming.entity.id),
        outgoing === null ? -1 : unwrap(outgoing.entity.id),
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
    const out = this.outgoing;
    const inc = this.incoming;
    if (out !== null && out.src === this) out.entity.destroy();
    if (inc !== null && inc.dst === this) inc.entity.destroy();
    this.outRef.set(null);
    this.incRef.set(null);
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
      continue;
    }
    if (!wall.src.incoming || !wall.src.outgoing) {
      wall.entity.destroy();
      continue;
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

    const edge = constraint.entity.maybe(PhysEdge)?.edge;
    if (!edge) {
      continue;
    }

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

const WallRendererState = {
  cache: new Map<string, () => unknown>(),
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

    const cached = <V>(f: () => V, name: string, ...id: readonly any[]): V => {
      const key = `${wall.id}.${name}.${id.map(e => `${e}`).join(':')}`;
      if (WallRendererState.cache.has(key)) {
        const cf = WallRendererState.cache.get(key) as (() => V);
        return cf();
      }
      WallRendererState.cache.set(key, f);
      return f();
    };

    const active = wall.entity.get(Handle).some(h => h.isActive);
  
    const normal = wall.normal.get();
    const tangent = wall.tangent.get();
    const length = wall.length;
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
      const { src, dst } = cached(
        Memo(() => {
          const srcpad = getEndPad(wall.src, offset);
          const dstpad = getEndPad(wall.dst, offset);
          const normal = wall.normal.get();
          const tangent = wall.tangent.get();
          const src = wall.src.pos
            .splus(offset, normal)
            .splus(srcpad, tangent);
          const dst = wall.dst.pos
            .splus(offset, normal)
            .splus(dstpad, tangent.neg());
          return { src, dst };
        },
        () => [ wall.src.pos.toString(), wall.dst.pos.toString() ]),
        'strokeWall', width, offset
      );
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
    const error = constraint?.enabled ? length.get('model') - constraint.length : 0;
    const decimals = App.project.displayDecimals;
    const dispLength = App.project.displayUnit.from(
      App.project.modelUnit.newAmount(length.get('model'))
    );
    const dispError = App.project.modelUnit.newAmount(error);
    dispError.value = Math.round(dispError.value);
    const hasError = Math.abs(dispError.value) > 0;
    const lengthText = App.project.displayUnit.format(dispLength, decimals);
    const errorTextU = App.project.displayUnit.format(dispError, decimals);
    const errorText = dispError.value >= 0 ? `+${errorTextU}` : errorTextU;
    const label = hasError ? `${lengthText} (${errorText})` : lengthText;
    const textOffset = Distance(App.settings.fontSize/2 + 10, 'screen');
    const textPosition = wall.midpoint.get().splus(textOffset.neg(), normal);

    if (constraint.enabled) {
      const offCenter = Distance(App.settings.fontSize * 3, 'screen');
      const maxAccentWidth = length.scale(0.5).minus(offCenter.scale(1.5));
      const accentWidth = Distance(50, 'screen').min(maxAccentWidth);
      if (accentWidth.sign > 0) {
        canvas.strokeStyle = 'black';
        canvas.lineWidth = 1;

        canvas.strokeLine(
          textPosition.splus(offCenter, tangent),
          textPosition.splus(offCenter.plus(accentWidth), tangent),
        );
        canvas.strokeLine(
          textPosition.splus(offCenter, tangent.neg()),
          textPosition.splus(offCenter.plus(accentWidth), tangent.neg()),
        );
      }
    }

    canvas.text({
      point: textPosition,
      axis: tangent,
      keepUpright: true,
      text: label,
      fill: 'black',
      shadow: hasError ? (dispError.value > 0 ? PINK : BLUE) : undefined,
      align: 'center',
      baseline: 'middle',
    });

    if (App.debug) {
      canvas.text({
        point: textPosition.splus(Distance(-15, 'screen'), normal),
        axis: tangent,
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
  if (App.rendering.get()) return;

  const joints = ecs.getComponents(WallJoint);
  const canvas = App.canvas;
  for (const joint of joints) {
    const active = joint.entity.get(Handle).some(h => h.isActive);
    const locked = joint.entity.get(FixedConstraint).some(f => f.enabled);

    if (App.tools.current.name !== 'joint tool' 
      && !App.settings.showJoints.get() 
      && !active
    ) {
      continue;
    }

    canvas.fillStyle = 'black';
    canvas.strokeStyle = 'black';
    canvas.lineWidth = 1;

    const pos = joint.pos;
    const radius = Distance(5, 'screen');
    if (active) {
      canvas.fillStyle = BLUE;
      canvas.strokeStyle = PINK;
      canvas.lineWidth = 4;
    } else if (locked) {
      canvas.fillStyle = 'black';
    } else {
      canvas.fillStyle = 'white';
    }
    canvas.fillCircle(pos, radius);
    canvas.strokeCircle(pos, radius);
    canvas.lineWidth = 1;
  }
};

const RoomRenderer = (ecs: EntityComponentSystem) => {
  ecs.getComponents(Room).forEach(room => {
    if (!room.isInverted) {
      const labelPos = room.labelPos;
      App.canvas.text({
        text: room.isInverted ? 'interior wall' : room.name,
        point: labelPos,
        fill: 'black',
        align: 'center',
        baseline: 'middle',
      });

      const area = room.area;
      if (area.nonzero) {
        const sqrtModel = App.project.modelUnit.newAmount(Math.sqrt(area.get('model')));
        const sqrtDisplay = App.project.displayUnit.from(sqrtModel);
        const amount = App.project.displayUnit.newAmount(Math.pow(sqrtDisplay.value, 2));
        const num = prettyNum(roundBy(amount.value, App.project.displayDecimals));
        const label = `${num} ${amount.unit}²`;
        App.canvas.text({
          text: label,
          point: labelPos.splus(
            App.settings.fontSize * 2,
            Vector(Axis.Y, 'screen'),
          ),
          fill: 'darkgray',
          align: 'center',
          baseline: 'middle',
        });
      }
    }

    if (App.debug) {
      const triangles = room.triangulation;
      let count = 0;
      for (const tri of triangles) {
        const smol = tri.scale(0.9);
        App.canvas.polygon(smol);

        App.canvas.strokeStyle = `hsl(${Math.round(330 * count / triangles.length)}, 100%, 50%)`;
        App.canvas.lineWidth = 1;
        App.canvas.setLineDash([]);
        App.canvas.stroke();

        App.canvas.strokeCircle(smol.b, Distance(5, 'screen'));

        count++;
      }
    }
  });
};

const AngleRenderer = (ecs: EntityComponentSystem) => {
  if (!App.settings.showAngles.get()) return;

  const constraints = ecs.getComponents(AngleConstraint);

  const canvas = App.canvas;

  for (const constraint of constraints) {
    const { center, left, right } = constraint.getCorner();

    if (!left.mag2().nonzero || !right.mag2().nonzero) {
      continue;
    }

    const leftAngle = left.angle(); 
    const rightAngle = right.angle();

    const arcRadius = Distance(15, 'screen');
    const textDistance = arcRadius.map(r => r + 20);

    const angle = Degrees(Math.round(unwrap(toDegrees(constraint.currentAngle.get('model')))));
    const error = Spaces.getCalc('model', (current: Radians, target: Radians) => {
      if (!constraint.enabled) return Degrees(0);
      const delta = Radians(unwrap(current) - unwrap(target));
      return Degrees(Math.round(unwrap(toDegrees(delta))));
    }, constraint.currentAngle, constraint.targetAngle);
    
    const middle = right.rotate(constraint.currentAngle.scale(0.5)).to('model').unit();

    if (constraint.entity.maybe(FixedConstraint)?.enabled) {
      const icon = IconImages.lockSmall;
      const size = Distance(8, 'screen');
      canvas.image(
        icon,
        center
          .splus(Distance(-15, 'screen'), middle)
          .splus(size.div(-1.25), Vector(Axis.X, 'screen'))
          .splus(size.div(-1.25), Vector(Axis.Y, 'screen')),
        size,
        size,
      );
    }

    let label = formatDegrees(angle);
    if (unwrap(error) > 0) {
      label = `${label} (+${formatDegrees(error)})`;
    } else if (unwrap(error) < 0) {
      label = `${label} (${formatDegrees(error)})`;
    }

    const color = (opaque: boolean) => {
      if (constraint.enabled) {
        return `hsla(0, 0%, 0%, ${opaque ? 1 : 0.75})`;
      }
      return `hsla(0, 0%, 50%, ${opaque ? 1 : 0.25})`;
    };
    const highlight = error === Degrees(0) ? undefined
        : error > Degrees(0) ? PINK
        : BLUE;

    canvas.text({
      text: label,
      align: 'center',
      baseline: 'middle',
      point: center.splus(textDistance, middle),
      fill: color(true),
      shadow: highlight,
    });

    const arc = (arcRadius: Distance, fill: string | null, stroke: string | null) => {
      canvas.beginPath();
      canvas.moveTo(center.splus(arcRadius, right.unit()));
      canvas.arc(
        center,
        arcRadius,
        rightAngle,
        leftAngle,
        true,
      );

      if (stroke) {
        canvas.strokeStyle = stroke;
        canvas.stroke();
      }

      if (fill) {
        canvas.lineTo(center);
        canvas.closePath();
        canvas.fillStyle = fill;
        canvas.fill();
      }
    };

    const active = constraint.entity.has(Selected) || constraint.entity.has(Hovered)
      || constraint.entity.has(Dragging);

    if (!active) {
      canvas.lineWidth = 1;
      arc(
        arcRadius,
        color(false),
        color(false),
      );
    } else {
      const thickness = 4;
      canvas.lineWidth = thickness;
      arc(arcRadius, 'white', null);
      arc(arcRadius.minus(Distance(thickness/2, 'screen')), null, PINK);
      arc(arcRadius.plus(Distance(thickness/2, 'screen')), null, BLUE);
    }
  }
};


