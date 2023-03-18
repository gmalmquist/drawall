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
    return this.applyInto(func, (v,s) => this.create(v,s), ...args);
  }

  applyInto<Args extends readonly unknown[], R>(
    func: (v: V, ...args: Args) => R,
    csValueType: (value: R, space: SpaceName) => SpaceValue<R>,
    ...args: SpaceValues<Args> 
  ): SpaceValue<R> {
    const unwrap = <T>(a: SpaceValue<T>) => a.get(this.space);
    const unwrapped = args.map(unwrap) as any as Args;
    const result = func(this.val, ...unwrapped);
    return csValueType(result, this.space);
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


