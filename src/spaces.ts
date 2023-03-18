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

  public static calc<First, Args extends readonly unknown[], R>(
    wrapResult: (value: R, space: SpaceName) => SpaceValue<R>,
    func: (f: First, ...args: Args) => R,
    first: SpaceValue<First>,
    ...args: SpaceValues<Args>
  ): SpaceValue<R> {
    return wrapResult(Spaces.getCalc(first.space, func, first, ...args), first.space);
  }

  public static getCalc<First, Rest extends readonly unknown[], R>(
    space: SpaceName,
    func: (first: First, ...args: Rest) => R,
    first: SpaceValue<First>,
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
    ? readonly [SpaceValue<Start>, ...SpaceValues<End>]
    : never;

class SpaceValue<V> {
  constructor(
    public readonly val: V,
    public readonly space: SpaceName,
    private readonly project: CoordinateTransform<V>,
    private readonly unproject: CoordinateTransform<V>,
  ) {
  }

  get(space: SpaceName = this.space): V {
    if (space === this.space) return this.val;
    const src = Spaces.get(this.space);
    const dst = Spaces.get(space);
    return this.project(dst, this.unproject(src, this.val));
  }

  to(space: SpaceName): SpaceValue<V> {
    if (space === this.space) return this;
    return this.create(this.get(space), space);
  }

  apply<Args extends readonly unknown[]>(
    func: (v: V, ...args: Args) => V,
    ...args: SpaceValues<Args> 
  ): SpaceValue<V> {
    return this.applyInto((v,s) => this.create(v,s), func, ...args);
  }

  applyInto<Args extends readonly unknown[], R>(
    wrapResult: (value: R, space: SpaceName) => SpaceValue<R>,
    func: (v: V, ...args: Args) => R,
    ...args: SpaceValues<Args> 
  ): SpaceValue<R> {
    return Spaces.calc(wrapResult, func, this, ...args);
  }

  private create(v: V, space: SpaceName): SpaceValue<V> {
    return new SpaceValue<V>(
      v,
      space,
      this.project,
      this.unproject,
    );
  }
}

type Distance = SpaceValue<number>;
const Distance = (val: number, space: SpaceName): Distance => new SpaceValue(
  val,
  space,
  (s, d) => s.project.distance(d),
  (s, d) => s.unproject.distance(d),
);

type Position = SpaceValue<Point>;
const Position = (val: Point, space: SpaceName): Position => new SpaceValue(
  val,
  space,
  (s, p) => s.project.point(p),
  (s, p) => s.unproject.point(p),
);

type Vector = SpaceValue<Vec>;
const Vector = (val: Vec, space: SpaceName): Vector => new SpaceValue(
  val,
  space,
  (s, v) => s.project.vec(v),
  (s, v) => s.unproject.vec(v),
);
type Radians = Newtype<number, { readonly _: unique symbol; }>;
const Radians = newtype<Radians>();

type Angle = SpaceValue<Radians>;
const Angle = (val: Radians, space: SpaceName): Angle => new SpaceValue(
  val,
  space,
  (s, angle) => Radians(s.project.vec(Axis.X.rotate(unwrap(angle))).angle()),
  (s, angle) => Radians(s.unproject.vec(Axis.X.rotate(unwrap(angle))).angle()),
);

type Line = SpaceValue<Ray>;
const Line = (val: Ray, space: SpaceName): Line => new SpaceValue(
  val,
  space,
  (s, ray) => new Ray(s.project.point(ray.origin), s.project.vec(ray.direction)),
  (s, ray) => new Ray(s.unproject.point(ray.origin), s.unproject.vec(ray.direction)),
);

Distance.between = (a: Position, b: Position): Distance => 
  Spaces.calc(Distance, (a: Point, b: Point) => Vec.between(a, b).mag(), a, b);

Vector.fromAngle = (a: Angle): Vector =>
  Spaces.calc(Vector, (a: Radians) => Axis.X.rotate(unwrap(a)), a);

Vector.between = (a: Position, b: Position): Vector => 
  Spaces.calc(Vector, (a: Point, b: Point) => Vec.between(a, b), a, b);

Angle.fromVector = (v: Vector): Angle =>
  v.applyInto(Angle, (v: Vec) => Radians(v.angle()));

Angle.fromVec = (v: Vec, space: SpaceName): Angle => Angle.fromVector(Vector(v, space));

Line.from = (origin: Position, direction: Vector): Line => Spaces.calc(
  Line,
  (o: Point, d: Vec) => new Ray(o, d),
  origin, direction
);

