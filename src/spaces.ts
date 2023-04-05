// call me by my space name https://xkcd.com/578/
type SpaceName = 'screen' | 'model' | 'identity';

interface Space {
  name: SpaceName;
  project: Transform2;
  unproject: Transform2;
}

class Spaces {
  private static readonly map = new Map<SpaceName, Space>();

  public static get(name: SpaceName): Space {
    if (!Spaces.map.has(name)) {
      return Spaces.identity;
    }
    return Spaces.map.get(name)!;
  }

  public static put(space: Space) {
    Spaces.map.set(space.name, space);
  }

  public static get identity(): Space {
    const frame = Frame.identity;
    return {
      name: 'identity',
      project: frame.project,
      unproject: frame.unproject,
    };
  }

  public static calc<First, Args extends readonly unknown[], R, W extends Spaced<R>>(
    wrapResult: (value: R, space: SpaceName) => W,
    func: (f: First, ...args: Args) => R,
    first: Spaced<First>,
    ...args: SpaceValues<Args>
  ): W {
    return wrapResult(Spaces.getCalc(first.space, func, first, ...args), first.space);
  }

  public static calcN<First, Args extends readonly unknown[], R, W extends Spaced<R>>(
    wrapResult: (value: R, space: SpaceName) => W,
    func: (f: First, ...args: Args) => R[],
    first: Spaced<First>,
    ...args: SpaceValues<Args>
  ): Array<W> {
    const result = Spaces.getCalc(first.space, func, first, ...args);
    return result.map(r => wrapResult(r, first.space));
  }

  public static getCalc<First, Rest extends readonly unknown[], R>(
    space: SpaceName,
    func: (first: First, ...args: Rest) => R,
    first: Spaced<First>,
    ...args: SpaceValues<Rest>
  ): R {
    const unwrap = <T>(a: SpaceValue<T>) => a.get(space);
    const unwrapped = args.map(unwrap) as any as Rest;
    return func(first.get(space), ...unwrapped);
  }
}

type CoordinateTransform<V> = (cs: Space, v: V) => V;

// thx to kanwren for help w typing witchcraft 💓
type SpaceValues<T extends readonly unknown[]> = T extends readonly []
  ? readonly []
  : T extends readonly [infer Start, ...infer End]
    ? readonly [Spaced<Start>, ...SpaceValues<End>]
    : never;

interface Spaced<V> {
  get: (space: SpaceName) => V;
  space: SpaceName;
}

abstract class BaseSpaceValue<V> implements Spaced<V> {
  constructor(public readonly space: SpaceName) {}

  map<Args extends readonly unknown[]>(
    func: (v: V, ...args: Args) => V,
    ...args: SpaceValues<Args> 
  ): typeof this {
    return Spaces.calc(this.create, func, this, ...args) as typeof this;
  }

  abstract get(space: SpaceName): V;

  abstract get create(): (v: V, space: SpaceName) => BaseSpaceValue<V>;

  to(space: SpaceName): typeof this {
    return this.create(this.get(space), space) as typeof this;
  }

  as<W extends Spaced<V>>(wrap: new (s: Spaced<V>) => W) {
    if (wrap === this.constructor) {
      return this as unknown as W;
    }
    return new wrap(this);
  }

  toString(): string {
    return `${this.constructor.name}(${this.get(this.space)}, ${this.space})`;
  }
}

class SpaceValue<V> implements Spaced<V> {
  constructor(
    public readonly val: V,
    public readonly space: SpaceName,
    private readonly project: CoordinateTransform<V>,
    private readonly unproject: CoordinateTransform<V>,
  ) {
  }

  get(space: SpaceName): V {
    if (space === this.space) return this.val;
    const src = Spaces.get(this.space);
    const dst = Spaces.get(space);
    return this.project(dst, this.unproject(src, this.val));
  }

  to(space: SpaceName): SpaceValue<V> {
    if (space === this.space) return this;
    return this.create(this.get(space), space);
  }

  get value() {
    return this;
  }

  apply<Args extends readonly unknown[]>(
    func: (v: V, ...args: Args) => V,
    ...args: SpaceValues<Args> 
  ): SpaceValue<V> {
    return this.applyInto((v,s) => this.create(v,s), func, ...args);
  }

  applyInto<Args extends readonly unknown[], R, W extends Spaced<R>>(
    wrapResult: (value: R, space: SpaceName) => W,
    func: (v: V, ...args: Args) => R,
    ...args: SpaceValues<Args> 
  ): W {
    return Spaces.calc(wrapResult, func, this, ...args);
  }

  private get create() {
   return (v: V, space: SpaceName): SpaceValue<V> => {
      return new SpaceValue<V>(
        v,
        space,
        this.project,
        this.unproject,
      );
    }
  }
}

// division does this funny thing where it kinda inverts the input type.
// if u divide a Distance / Distance, you get a flat scalar back out.
// but if u instead divide a Distance / scalar, you still have a Distance.
// this isn't perfectly accurate, bc it's not taking into account actual units
// like Distance squared versus inverse distance etc, but there's a limit to what
// I can sanely represent in the type system!
type DistanceDivisor = number | Spaced<number>;

type DivReturnType<Divisor extends DistanceDivisor> = [Divisor] extends [number]
  ? SpaceDistance : number;

class SpaceDistance extends BaseSpaceValue<number> {
  constructor(private readonly pos: Spaced<number>) {
    super(pos.space);
  }

  get sign(): Sign {
    return signum(this.get(this.space));
  }

  get nonzero(): boolean {
    return this.get(this.space) !== 0;
  }

  plus(d: Spaced<number>): Distance {
    return this.map((a: number, b: number) => a + b, d);
  }

  splus(s: number | Spaced<number>, d: Spaced<number>): Distance {
    if (typeof s === 'number') {
      return this.map((a: number, b: number) => a + s * b, d);
    }
    return this.map((a: number, s: number, b: number) => a + s * b, s, d);
  }

  minus(d: Spaced<number>): Distance {
    return this.map((a: number, b: number) => a - b, d);
  }

  scale(f: number | Spaced<number>): Distance {
    if (typeof f === 'number') return this.map(d => d * f);
    return this.map((a: number, b: number) => a * b, f);
  }

  inverse(): Distance {
    return this.map(x => 1.0 / x);
  }

  neg(): Distance {
    return this.scale(-1);
  }

  div<D extends DistanceDivisor>(divisor: D): DivReturnType<D> {
    if (typeof divisor === 'number') {
      return this.map(d => d / divisor) as Distance as DivReturnType<D>;
    }
    const scalar = this.map((a: number, b: number) => a / b, divisor).get(this.space);
    return scalar as DivReturnType<D>;
  }

  lt(other: Distance): boolean {
    return this.get(this.space) < other.get(this.space);
  }

  le(other: Distance): boolean {
    return this.get(this.space) <= other.get(this.space);
  }

  gt(other: Distance): boolean {
    return this.get(this.space) > other.get(this.space);
  }

  ge(other: Distance): boolean {
    return this.get(this.space) >= other.get(this.space);
  }

  eq(other: Distance): boolean {
    return this.get(this.space) === other.get(this.space);
  }

  ne(other: Distance): boolean {
    return this.get(this.space) === other.get(this.space);
  }

  max(other: Distance): Distance {
    return this.ge(other) ? this : other;
  }

  min(other: Distance): Distance {
    return this.le(other) ? this : other;
  }

  abs(): Distance {
    return this.map(a => Math.abs(a));
  }

  get(space: SpaceName): number {
    return this.pos.get(space);
  }

  get create() { return SpaceDistance.of; }

  public static between(a: Spaced<Point>, b: Spaced<Point>): Distance {
    return Spaces.calc(Distance, (a: Point, b: Point) => Vec.between(a, b).mag(), a, b);
  }

  public static of(distance: number, space: SpaceName): SpaceDistance {
    return new SpaceDistance(new SpaceValue(
      distance,
      space,
      (s, d) => s.project.distance(d),
      (s, d) => s.unproject.distance(d),
    ));
  }
}
type Distance = SpaceDistance;
const Distance = SpaceDistance.of;
const Distances = {
  between: SpaceDistance.between,
  zero: (space: SpaceName) => Distance(0, space),
};

class SpaceAngle extends BaseSpaceValue<Radians> {
  constructor(private readonly pos: Spaced<Radians>) {
    super(pos.space);
  }

  get(space: SpaceName): Radians {
    return this.pos.get(space);
  }

  getDegrees(space: SpaceName): Degrees {
    return toDegrees(this.get(space));
  }

  scale(factor: number): SpaceAngle {
    return this.map(a => mapAngle(a, a => a * factor));
  }

  plus(angle: Spaced<Radians>): SpaceAngle {
    return Spaces.calc(Angle, (a: Radians, b: Radians) => (
      normalizeRadians(Radians(unwrap(a) + unwrap(b)))
    ), this, angle);
  }

  minus(angle: Spaced<Radians>): SpaceAngle {
    return Spaces.calc(Angle, (a: Radians, b: Radians) => (
      Radians(unwrap(a) - unwrap(b))
    ), this, angle);
  }

  normalize(): SpaceAngle {
    return this.map(a => normalizeRadians(a));
  }

  lt(other: Angle): boolean {
    return unwrap(this.get(this.space)) < unwrap(other.get(this.space));
  }

  le(other: Angle): boolean {
    return unwrap(this.get(this.space)) <= unwrap(other.get(this.space));
  }

  gt(other: Angle): boolean {
    return unwrap(this.get(this.space)) > unwrap(other.get(this.space));
  }

  ge(other: Angle): boolean {
    return unwrap(this.get(this.space)) >= unwrap(other.get(this.space));
  }

  eq(other: Angle): boolean {
    return unwrap(this.get(this.space)) === unwrap(other.get(this.space));
  }

  ne(other: Angle): boolean {
    return unwrap(this.get(this.space)) === unwrap(other.get(this.space));
  }

  toString(): string {
    return `Angle(${formatDegrees(toDegrees(this.get(this.space)))}, ${this.space})`;
  }

  get create() {
    return SpaceAngle.of;
  }

  public static counterClockwiseDelta(a: Spaced<Radians>, b: Spaced<Radians>): Angle {
    return Spaces.calc(Angle, (a: Radians, b: Radians) => {
      const src = unwrap(normalizeRadians(a));
      const dst = unwrap(normalizeRadians(b));
      return normalizeRadians(Radians(dst - src));
    }, a, b);
  }

  public static clockwiseDelta(a: Spaced<Radians>, b: Spaced<Radians>): Angle {
    return SpaceAngle.counterClockwiseDelta(a, b)
      .map((a: Radians) => mapAngle(a, a => TAU - a));
  }

  public static shortestDelta(a: Spaced<Radians>, b: Spaced<Radians>): Angle {
    return Spaces.calc(Angle, (a: Radians, b: Radians) => {
      const src = unwrap(normalizeRadians(a));
      const dst = unwrap(normalizeRadians(b));
      const forward = dst - src;
      const backward = (dst - TAU) - src;
      if (Math.abs(forward) < Math.abs(backward)) {
        return Radians(forward);
      }
      return Radians(backward);
    }, a, b);
  }

  public static fromVector(v: Spaced<Vec>): Angle {
    return Spaces.calc(Angle, (v: Vec) => v.angle(), v);
  }

  public static of(radians: Radians, space: SpaceName): SpaceAngle {
    return new SpaceAngle(new SpaceValue(
      radians,
      space,
      (s, angle) => s.project.vec(Axis.X.rotate(angle)).angle(),
      (s, angle) => s.unproject.vec(Axis.X.rotate(angle)).angle(),
    ));
  }
}

type Angle = SpaceAngle;
const Angle = SpaceAngle.of;
const Angles = {
  zero: (space: SpaceName) => Angle(Radians(0), space),
  fromVector: SpaceAngle.fromVector,
  fromDegrees: (deg: Degrees, space: SpaceName) => Angle(toRadians(deg), space),
  counterClockwiseDelta: SpaceAngle.counterClockwiseDelta,
  clockwiseDelta: SpaceAngle.clockwiseDelta,
  shortestDelta: SpaceAngle.shortestDelta,
};


class SpaceVec extends BaseSpaceValue<Vec> {
  constructor(private readonly pos: Spaced<Vec>) {
    super(pos.space);
  }

  get(space: SpaceName): Vec {
    return this.pos.get(space);
  }

  angle(): Angle {
    return Spaces.calc(Angle, (v: Vec) => v.angle(), this);
  }

  rotate(angle: Spaced<Radians>): Vector {
    return Spaces.calc(Vector, (a: Radians, v: Vec) => v.rotate(a), angle, this);
  }

  r90(): SpaceVec {
    return this.map(v => v.r90());
  }

  scale(factor: number | Spaced<number>): SpaceVec {
    if (typeof factor === 'number') {
      return this.map(v => v.scale(factor));
    }
    return this.map((v: Vec, factor: number) => v.scale(factor), factor);
  }

  div(factor: number | Spaced<number>): SpaceVec {
    if (typeof factor === 'number') {
      return this.map(v => v.scale(1.0 / factor));
    }
    return this.map((v: Vec, factor: number) => v.scale(1.0 / factor), factor);
  }

  neg(): SpaceVec {
    return this.scale(-1);
  }

  unit(): SpaceVec {
    return this.map(v => v.unit());
  }

  splus(scale: number | Spaced<number>, vec: Spaced<Vec>): Vector {
    if (typeof scale === 'number') {
      return Spaces.calc(Vector, (a: Vec, b: Vec) => a.splus(scale, b), this, vec);
    }
    return Spaces.calc(Vector, (a: Vec, s: number, b: Vec) => a.splus(s, b), this, scale, vec);
  }

  plus(vec: Spaced<Vec>): Vector {
    return this.splus(1.0, vec);
  }

  minus(vec: Spaced<Vec>): Vector {
    return this.splus(-1.0, vec);
  }

  onAxis(vec: Spaced<Vec>): Vector {
    return Spaces.calc(Vector, (a: Vec, b: Vec) => a.onAxis(b), this, vec);
  }

  offAxis(vec: Spaced<Vec>): Vector {
    return Spaces.calc(Vector, (a: Vec, b: Vec) => a.offAxis(b), this, vec);
  }

  toPosition(): Position {
    return Spaces.calc(Position, (a: Vec) => a.toPoint(), this);
  }

  dot(v: Spaced<Vec>): Distance {
    return Spaces.calc(Distance, (a: Vec, b: Vec) => a.dot(b), v, this);
  }

  mag2(): Distance {
    return Spaces.calc(Distance, (v: Vec) => v.mag2(), this);
  }

  mag(): Distance {
    return Spaces.calc(Distance, (v: Vec) => v.mag(), this);
  }

  static between(a: Spaced<Point>, b: Spaced<Point>): Vector {
    return Spaces.calc(Vector, (a: Point, b: Point) => Vec.between(a, b), a, b);
  }

  static zero(space: SpaceName): SpaceVec {
    return SpaceVec.of(Vec.ZERO, space);
  }

  static fromAngle(a: Angle): Vector {
    return Spaces.calc(Vector, (a: Radians) => Axis.X.rotate(a), a);
  }

  get create() { return SpaceVec.of; }

  public static of(vec: Vec, space: SpaceName) {
    return new SpaceVec(new SpaceValue(
      vec,
      space,
      (s, v) => s.project.vec(v),
      (s, v) => s.unproject.vec(v),
    ));
  }
}
type Vector = SpaceVec;
const Vector = SpaceVec.of;
const Vectors = {
  between: SpaceVec.between,
  zero: SpaceVec.zero,
  fromAngle: SpaceVec.fromAngle,
};

class SpacePos extends BaseSpaceValue<Point> {
  constructor(private readonly pos: Spaced<Point>) {
    super(pos.space);
  }

  get(space: SpaceName): Point {
    return this.pos.get(space);
  }

  splus(scale: number | Spaced<number>, vec: Spaced<Vec>): SpacePos {
    if (typeof scale === 'number') {
      return this.map((p: Point, v: Vec) => p.splus(scale, v), vec);
    }
    return this.map((p: Point, scale: number, v: Vec) => p.splus(scale, v), scale, vec);
  }

  plus(vec: Spaced<Vec>): SpacePos {
    return this.splus(1.0, vec);
  }

  minus(vec: Spaced<Vec>): SpacePos {
    return this.splus(-1.0, vec);
  }

  trunc(f: Spaced<number>): SpacePos {
    return this.map((p: Point, f: number) => p.trunc(f), f);
  }

  onLine(origin: Position, tangent: Vector): SpacePos {
    return this.map((p: Point, o: Point, t: Vec) => p.onLine(o, t), origin, tangent);
  }

  lerp(s: number, p: Spaced<Point>): SpacePos {
    return this.map((a: Point, b: Point) => a.lerp(s, b), p);
  }

  toVector(): Vector {
    return Spaces.calc(Vector, (p: Point) => p.toVec(), this);
  }

  get create() { return SpacePos.of; }

  eq(other: SpacePos): boolean {
    return Vectors.between(this, other).mag().get(this.space) < 0.001;
  }

  scale(factor: number): SpacePos {
    return this.map(p => new Point(p.x * factor, p.y * factor));
  }

  public static zero(space: SpaceName): SpacePos {
    return SpacePos.of(Point.ZERO, space);
  }

  public static centroid(points: Array<Spaced<Point>>): SpacePos {
    if (points.length === 0) {
      throw new Error('cannot compute the centroid of an empty array.');
    }
    const space = points[0]!.space;
    if (points.length === 1) {
      return SpacePos.of(points[0]!.get(space), space);
    }
    const sum = { x: 0, y: 0 };
    points.map(p => p.get(space)).forEach(p => {
      sum.x += p.x;
      sum.y += p.y;
    });
    const n = 1.0 * points.length;
    return SpacePos.of(new Point(sum.x / n, sum.y / n), space);
  }

  public static of(point: Point, space: SpaceName): SpacePos {
    return new SpacePos(new SpaceValue(
      point,
      space,
      (s, p) => s.project.point(p),
      (s, p) => s.unproject.point(p),
    ));
  }
}
type Position = SpacePos;
const Position = SpacePos.of;
const Positions = {
  zero: SpacePos.zero,
  centroid: SpacePos.centroid,
};

interface EdgeLike {
  src: Position;
  dst: Position;
  vector?: Vector;
  tangent?: Vector;
  normal?: Vector;
}

class SpaceEdge {
  constructor(
    public readonly src: Position,
    public readonly dst: Position) {
  }

  get origin(): Position {
    return this.src;
  }

  get vector(): Vector {
    return SpaceVec.between(this.src, this.dst);
  }

  get length(): Distance {
    return SpaceDistance.between(this.src, this.dst);
  }

  get normal(): Vector {
    return this.tangent.r90();
  }

  get tangent(): Vector {
    return this.vector.unit();
  }

  get line(): Line {
    return new Line(this.origin, this.vector);
  }

  get midpoint(): Position {
    return this.lerp(0.5);
  }

  public scale(amount: number | Distance): SpaceEdge {
    const mid = this.midpoint;
    const half = Vectors.between(mid, this.dst).scale(amount);
    return new SpaceEdge(mid.minus(half), mid.plus(half));
  }

  public rotate(angle: Angle) {
    const mid = this.midpoint;
    const half = Vectors.between(mid, this.dst).rotate(angle);
    return new SpaceEdge(mid.minus(half), mid.plus(half));
  }

  public lerp(s: number): Position {
    return Spaces.calc(Position, (a: Point, b: Point) => (
      a.lerp(s, b)
    ), this.src, this.dst);
  }

  public unlerp(p: Position): number {
    const displacement = Vectors.between(this.src, p);
    const vector = this.vector;
    return displacement.dot(vector).div(vector.mag2());
  }

  public closestPoint(p: Position) {
    const projected = p.minus(Vectors.between(this.origin, p).onAxis(this.normal));
    const s = Vectors.between(this.origin, p).dot(this.vector).div(this.vector.mag2());
    if (s < 0) return this.src;
    if (s > 1) return this.dst;
    return projected;
  }

  public distance(point: Position): Distance {
    return Spaces.calc(Distance, (a: Point, b: Point, p: Point) => {
      return new Edge(a, b).distance(p);
    }, this.src, this.dst, point);
  }

  public intersection(other: SpaceEdge): Position | null {
    const ray = new SpaceRay(this.origin, this.vector);
    const hit = ray.intersection(other);
    if (hit === null) return null;
    if (hit.time < 0 || hit.time > 1) return null;
    if (Vectors.between(other.src, hit.point).dot(other.vector).sign < 0) {
      return null;
    }
    if (Vectors.between(other.dst, hit.point).dot(other.vector.scale(-1)).sign < 0) {
      return null;
    }
    return hit.point;
  }
}

interface SpaceRayHit {
  time: number;
  point: Position;
  distance: Distance;
}

// pew pew
class SpaceRay {
  constructor(
    public readonly origin: Position,
    public readonly direction: Vector) {
  }

  get normal(): Vector {
    return this.direction.r90().unit();
  }

  at(t: number): Position {
    return this.origin.splus(t, this.direction);
  }

  intersection(line: Line | SpaceRay| SpaceEdge): SpaceRayHit | null {
    // (o + d * t - q) * N = 0
    // (o-q)N + t(d*N) = 0
    // t = (q-o)N / (d*N)
    const denominator = this.direction.dot(line.normal);
    if (denominator.sign === 0) return null;
    const time = Vectors.between(this.origin, line.origin)
      .dot(line.normal).div(denominator);
    return {
      time,
      point: this.at(time),
      // rate * time = distance
      distance: this.direction.mag().scale(time),
    };
  }

  get edge(): SpaceEdge {
    return new SpaceEdge(this.origin, this.origin.plus(this.direction));
  }

  get line(): Line {
    return new Line(this.origin, this.direction);
  }
}

abstract class SDF {
  /** signed distances are sexy */
  public abstract sdist(point: Position): Distance;

  public contains(point: Position): boolean {
    return this.sdist(point).sign <= 0;
  }

  public abstract get centroid(): Position;

  public raycast(ray: SpaceRay): SpaceRayHit | null {
    // in model space this will typically be ~1 mm, in screen space
    // it's a tenth of a pixel. ie, it's small enough.
    const eps = 0.1;

    const direction = ray.direction.unit();
    let point = ray.origin;
    let distance = this.sdist(point);
    let traveled = Distance(0, distance.space);
    while (distance.get(distance.space) > eps) {
      point = point.splus(distance, direction);
      const newDistance = this.sdist(point);
      if (newDistance.gt(distance)) {
        // we're getting farther away, treat this as a miss
        return null;
      }
      distance = newDistance;
    }
    if (distance.get(distance.space) > eps) {
      return null; // we never made it :/
    }
    return {
      point,
      time: traveled.div(ray.direction.mag()), // nb: v sci-fi
      distance: traveled,
    };
  }
}

interface Surface {
  intersects: (sdf: SDF) => boolean;
  containedBy: (sdf: SDF) => boolean;
}


class Circle extends SDF {
  constructor(
    public readonly center: Position,
    public readonly radius: Distance,
  ) {
    super();
  }

  public get centroid(): Position {
    return this.center;
  }

  public override sdist(point: Position): Distance {
    return Distances.between(this.center, point).minus(this.radius);
  }
}

class Line extends SDF {
  public readonly origin: Position;
  public readonly tangent: Vector;

  constructor(
    origin: Position,
    tangent: Vector,
  ) {
    super();
    this.origin = origin;
    this.tangent = tangent.unit();
  }

  get normal() {
    return this.tangent.r90();
  }

  project(point: Position): Position {
    return point.splus(this.sdist(point).neg(), this.normal);
  }

  distance(point: Position): Distance {
    return this.sdist(point).abs();
  }

  public override sdist(point: Position): Distance {
    return Vectors.between(this.origin, point).dot(this.normal);
  }

  public override get centroid(): Position {
    return this.origin;
  }
}

class HalfPlane extends SDF {
  constructor(
    private readonly origin: Position,
    private readonly normal: Vector) {
    super();
  }

  public override sdist(point: Position): Distance {
    return Vectors.between(this.origin, point).dot(this.normal).neg();
  }

  get tangent(): Vector {
    return this.tangent.unit();
  }

  public override get centroid(): Position {
    return this.origin;
  }
}

class Rect extends SDF {
  public readonly corners: readonly [Position, Position, Position, Position];

  constructor(
    // these are private bc they're kinda a lie; which direction
    // is up/down/left/right varies depending on the coordinate system.
    // the important thing is that they are opposite corners.
    private readonly topLeft: Position,
    private readonly bottomRight: Position,
  ) {
    super();
    const diagonal = Vectors.between(topLeft, bottomRight);
    // again, these directions are massive air quotes
    const right = diagonal.onAxis(Vector(Axis.X, diagonal.space));
    const down = diagonal.onAxis(Vector(Axis.Y, diagonal.space));
    const bottomLeft = topLeft.plus(down);
    const topRight = topLeft.plus(right);
    
    this.corners = [ topLeft, topRight, bottomRight, bottomLeft ];
  }

  public override sdist(point: Position): Distance {
    const centroid = this.centroid;
    const [first, ...more] = this.edges.map(e => {
      const hp = new HalfPlane(e.src, e.normal)
      return hp.sdist(point).scale(-hp.sdist(centroid).sign);
    });
    return more.reduce((a, b) => a.max(b), first);
  }

  get top(): SpaceEdge {
    return new SpaceEdge(
      this.corners[0],
      this.corners[1],
    );
  }

  get bottom(): SpaceEdge {
    return new SpaceEdge(
      this.corners[3],
      this.corners[2],
    );
  }

  get edges(): readonly SpaceEdge[] {
    return this.corners.map((c, i) => 
      new SpaceEdge(c, this.corners[(i + 1) % this.corners.length]));
  }

  public override get centroid(): Position {
    return this.topLeft.lerp(0.5, this.bottomRight);
  }

  eq(rect: Rect) {
    return this.corners.every((c, i) => c.eq(rect.corners[i]));
  }
}

class Polygon extends SDF {
  private readonly _vertices: Position[];
  private readonly _centroid = Memo(() => Positions.centroid(this._vertices));
  private readonly _convex = Memo(() => {
    if (this._vertices.length < 3) return false;
    for (let i = 0; i < this._vertices.length; i++) {
      const a = this._vertices[i];
      const b = this._vertices[(i + 1) % this._vertices.length];
      const c = this._vertices[(i + 2) % this._vertices.length];
      const ab = Vectors.between(a, b);
      const bc = Vectors.between(b, c);
      if (ab.r90().dot(bc).sign > 0) {
        return false;
      }
    }
    return true;
  });
  private readonly _radius = Memo(() => {
    const centroid = this.centroid;
    return this._vertices.map(v => Distances.between(centroid, v))
      .reduce((a, b) => a.max(b), Distance(0, centroid.space))
  });
  private readonly _area = Memo(() => Polygon.computeArea(this._vertices));

  constructor(
    vertices: Position[],
  ) {
    super();
    this._vertices = [...vertices];
  }

  translate(delta: Vector): Polygon {
    return new Polygon(this.vertices.map(v => v.plus(delta)));
  }

  rotate(angle: Angle): Polygon {
    return new Polygon(this.vertices.map(
      v => v.toVector().rotate(angle).toPosition()
    ));
  }

  get radius(): Distance {
    return this._radius();
  }

  get vertices(): Position[] {
    return [...this._vertices];
  }

  get edges(): SpaceEdge[] {
    return this._vertices.map((v, i, arr) =>
      new SpaceEdge(v, arr[(i + 1) % arr.length]));
  }

  get centroid(): Position {
    return this._centroid();
  }

  get isDegenerate(): boolean {
    return this._vertices.length < 3;
  }

  get isConvex(): boolean {
    return this._convex();
  }

  get bounds(): Rect {
    const space = this._vertices.length > 0 ? this._vertices[0].space : 'model';
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    for (let i = 0; i < this._vertices.length; i++) {
      const v = this._vertices[i].get(space);
      if (i === 0) {
        minX = v.x;
        minY = v.y;
        maxX = v.x;
        maxY = v.y;
        continue;
      }
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }
    return new Rect(
      Position(new Point(minX, minY), space),
      Position(new Point(maxX, maxY), space),
    );
  }

  get area(): Distance {
    return this._area();
  }

  public override sdist(point: Position): Distance {
    const inside = this.contains(point);
    let closest = Distance(Number.POSITIVE_INFINITY, 'model');
    for (const edge of this.edges) {
      const d = edge.distance(point);
      if (d.lt(closest)) {
        closest = d;
      }
    }
    return inside ? closest.neg() : closest;
  }

  public override contains(point: Position): boolean {
    if (Vectors.between(this.centroid, point).mag2().gt(this.radius.scale(this.radius))) {
      return false;
    }
    if (this.isConvex) {
      return this.containsConvex(point);
    }
    return this.containsConcave(point);
  }

  public containsConvex(point: Position): boolean {
    for (const edge of this.edges) {
      const vec = Vectors.between(edge.midpoint, point);
      if (vec.dot(edge.vector.r90()).sign > 0) {
        return false;
      }
    }
    return true;
  }

  public containsConcave(point: Position): boolean {
    // first do a cheap OOB test to avoid raycasting where possible
    const bounds: Rect = this.bounds;
    if (!bounds.contains(point)) {
      return false;
    }

    const edges = this.edges;
    for (let attempt = 0; attempt < 10; attempt++) {
      const ray = attempt === 0
        ? new SpaceRay(point, Vector(Axis.X, point.space))
        : new SpaceRay(point, Vector(new Vec(
          0.5, Math.random() * 2 - 1), point.space).unit())
      ;
      const check = this.raycastCheck(ray, edges);
      if (check === 'inside') return true;
      if (check === 'outside') return false;
    }
    // oh no, rngesus has failed us
    return false;
  }

  public scale(factor: number | Distance): Polygon {
    const centroid = this.centroid;
    return new Polygon(this.vertices
      .map(v => Vectors.between(centroid, v))
      .map(v => v.scale(factor))
      .map(v => centroid.plus(v)));
  }

  public pad(amount: Distance, ...axes: Vector[]): Polygon {
    const centroid = this.centroid;
    return new Polygon(this.vertices.map(v => {
      const offset = Vectors.between(centroid, v);
      let result: Vector = offset;
      for (const axis of axes) {
        const current = offset.dot(axis);
        result = result.splus(amount.scale(current.sign), axis.div(axis.mag()));
      }
      return centroid.plus(result);
    }));
  }

  private raycastCheck(
    ray: SpaceRay,
    edges: SpaceEdge[],
  ): 'inside' | 'outside' | 'indeterminate' {
    const eps = 0.001;
    let hits = 0;
    for (const edge of edges) {
      const hit = ray.intersection(edge);
      if (hit === null) continue;
      const s = edge.unlerp(hit.point);
      if (Math.abs(s) < eps || Math.abs(1 - s) < eps) {
        return 'indeterminate';
      }
      if (s < 0 || s > 1) {
        continue;
      }
      if (Math.abs(hit.time) < eps) {
        return 'indeterminate';
      }
      if (hit.time > 0) {
        hits += 1;
      }
    }
    return hits % 2 === 0 ? 'outside' : 'inside';
  }

  private static computeArea(verts: Position[]): Distance {
    if (verts.length === 0) {
      return Distance(0, 'model');
    }
    const space = verts[0]!.space;
    let area = 0;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i].toVector().get(space);
      const b = verts[(i + 1) % verts.length].toVector().get(space);
      area += a.x * b.y - a.y * b.x;
    }
    return Distance(Math.abs(area / 2), space);
  }

  public static regular(
    center: Position,
    radius: Distance,
    sides: number,
  ): Polygon {
    return new Polygon(
      new Array(sides).fill(center).map((c, i) => 
        c.splus(
          radius,
          Vectors.fromAngle(Angle(Radians(2 * Math.PI * i / sides), center.space))
      )),
    );
  }
  
  public static arrow(src: Position, dst: Position, width: Distance): Polygon {
    const headWidth = width.scale(5);
    const headHeight = width.scale(10);
    const vector = Vectors.between(src, dst);
    const tangent = vector.unit();
    const shaftLength = vector.mag().minus(headHeight)
      .max(Distances.zero(src.space));
    const normal = tangent.r90();
    return new Polygon([
      src.splus(width.scale(0.5), normal),
      src.splus(width.scale(0.5), normal).splus(shaftLength, tangent),
      src.splus(headWidth.scale(0.5), normal).splus(shaftLength, tangent),
      dst,
      src.splus(headWidth.scale(-0.5), normal).splus(shaftLength, tangent),
      src.splus(width.scale(-0.5), normal).splus(shaftLength, tangent),
      src.splus(width.scale(-0.5), normal),
    ]);
  }

  public static lollipop(src: Position, dst: Position, width: Distance): Polygon {
    const vector = Vectors.between(src, dst);
    const length = vector.mag();
    const headWidth = width.scale(3).min(length.scale(0.9));
    const headHeight = headWidth.scale(1);
    const tangent = vector.unit();
    const shaftLength = vector.mag().minus(headHeight)
      .max(Distances.zero(src.space));
    const normal = tangent.r90();
    const start = [
      src.splus(width.scale(0.5), normal),
      src.splus(width.scale(0.5), normal).splus(shaftLength, tangent),
    ];
    const end = [ 
      src.splus(width.scale(-0.5), normal).splus(shaftLength, tangent),
      src.splus(width.scale(-0.5), normal),
    ];
    const n = 16;
    const middle = new Array(n).fill(0).map((_, i) => i/(n-1.0)).map(s => {
      // arc from start[2] to dst to end[0]
      const a = start[1];
      const b = end[0];
      const mid = a.lerp(0.5, b).splus(headWidth.scale(0.5), tangent);
      const ma = Vectors.between(mid, a)
        .unit()
        .scale(headWidth)
        .scale(0.5);
      const angle = Angle(Radians(-s * Math.PI * 1.9 + Math.PI/3), src.space);
      return mid.plus(ma.rotate(angle));
    });
    return new Polygon([
      ...start,
      ...middle,
      ...end,
    ]);
  }
}

class Triangle extends Polygon {
  constructor(
    a: Position,
    b: Position,
    c: Position,
  ) {
    super([a, b, c]);
  }

  get a(): Position { return this.vertices[0]!; }
  get b(): Position { return this.vertices[1]!; }
  get c(): Position { return this.vertices[2]!; }

  get area(): Distance {
    const ab = Vectors.between(this.a, this.b).get(this.a.space);
    const ac = Vectors.between(this.a, this.c).get(this.a.space);
    // ortho comp of cross product. since these are 2d vectors,
    // the absolute value of this is equal to the magnitude of
    // the cross product
    const det = (ab.x * ac.y) - (ab.y * ac.x); 
    // the magnitude of a cross product is equal to the area
    // of the parallogram formed by the two vectors, so half
    // that is the area of this triangle.
    return Distance(Math.abs(det)/2.0, this.a.space);
  }

  override contains(p: Position): boolean {
    return super.containsConvex(p);
  }

  override sdist(p: Position): Distance {
    const [first, ...more] = this.edges.map(e => e.distance(p));
    return more.reduce((a, b) => a.min(b), first)
      .scale(this.contains(p) ? -1 : 1);
  }

  override scale(s: number | Distance): Triangle {
    const v = super.scale(s).vertices;
    return new Triangle(v[0]!, v[1]!, v[2]!);
  }

  public static triangulate(poly: Polygon): Array<Triangle> {
    if (poly.isConvex) return Triangle.triangulateConvex(poly);
    // ear clipping method, O(n^2)
    const vertices = poly.vertices;
    let indices = vertices.map((_, i) => i);
    const results: Array<readonly [number, number, number]> = [];


    const checkTriangle = (v0: number, v1: number, v2: number): boolean => {
      const a = vertices[v0];
      const b = vertices[v1];
      const c = vertices[v2];

      const ab = new SpaceEdge(a, b);
      const bc = new SpaceEdge(b, c);
      const ca = new SpaceEdge(c, a);

      if (ab.vector.r90().dot(bc.vector).sign >= 0) { // .dot -h-a-c-k- sign
        // angle is >= 180 deg, would make an OOB triangle
        return false;
      }

      const verts = new Set([v0, v1, v2]);

      // now check for self intersections ....
      for (let i = 0; i < indices.length; i++) {
        const middle = indices[i];
        if (verts.has(middle)) continue;
        const left = indices[(i - 1 + indices.length) % indices.length];
        const right = indices[(i + 1) % indices.length];

        const el = new SpaceEdge(vertices[middle], vertices[left]);
        const er = new SpaceEdge(vertices[middle], vertices[right]);

        const leftTests: SpaceEdge[] = [];
        const rightTests: SpaceEdge[] = [];

        if (left !== v0 && left !== v1) leftTests.push(ab);
        if (left !== v0 && left !== v2) leftTests.push(ca);
        if (left !== v1 && left !== v2) leftTests.push(bc);

        if (right !== v0 && right !== v1) rightTests.push(ab);
        if (right !== v0 && right !== v2) rightTests.push(ca);
        if (right !== v1 && right !== v2) rightTests.push(bc);

        if (leftTests.some(e => e.intersection(el))) return false;
        if (rightTests.some(e => e.intersection(er))) return false;
      }
      return true;
    };

    while (indices.length >= 3) {
      let progressed = false;
      for (let i = 0; i < indices.length; i++) {
        const v0 = indices[i];
        const v1 = indices[(i+1) % indices.length];
        const v2 = indices[(i+2) % indices.length];
        if (!checkTriangle(v0, v1, v2)) continue;
        // woo we found one
        results.push([v0, v1, v2]);
        // cut off the ear >:3
        indices = indices.filter(k => k !== v1);
        progressed = true;
        break;
      }
      if (!progressed) {
        // give up, this parrot watches too much anime
        // (this poly[gon] is degenerate)
        break; 
      }
    }
    return results.map(([a, b, c]) => new Triangle(
      vertices[a], vertices[b], vertices[c],
    ));
  }

  public static triangulateConvex(poly: Polygon): Array<Triangle> {
    if (poly.isDegenerate) return [];
    const [first, ...more] = poly.vertices;
    const results: Array<Triangle> = [];
    for (let i = 0; i < more.length - 1; i++) {
      results.push(new Triangle(first, more[i], more[i+1]));
    }
    return results;
  }
}

