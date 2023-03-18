type CsName = 'screen' | 'model' | 'identity';

interface CoordinateSystem {
  name: CsName;
  project: Transform2;
  unproject: Transform2;
}

class CoordinateSystems {
  private static readonly map = new Map<CsName, CoordinateSystem>();

  public static get(name: CsName): CoordinateSystem {
    if (!CoordinateSystems.map.has(name)) {
      return CoordinateSystems.identity;
    }
    return CoordinateSystems.map.get(name)!;
  }

  public static put(system: CoordinateSystem) {
    CoordinateSystems.map.set(system.name, system);
  }

  public static get identity(): CoordinateSystem {
    const frame = Frame.identity;
    return {
      name: 'identity',
      project: frame.project,
      unproject: frame.unproject,
    };
  }
}

type CoordinateTransform<V> = (cs: CoordinateSystem, v: V) => V;

// thx to kanwren for help w typing witchcraft 💓
type CoordinateSystemValues<T extends readonly unknown[]> = T extends readonly []
  ? readonly []
  : T extends readonly [infer Start, ...infer End]
    ? readonly [CoordinateSystemValue<Start>, ...CoordinateSystemValues<End>]
    : never;

class CoordinateSystemValue<V> {
  constructor(
    public readonly val: V,
    public readonly system: CsName,
    private readonly project: CoordinateTransform<V>,
    private readonly unproject: CoordinateTransform<V>,
  ) {
  }

  get(system: CsName = this.system): V {
    if (system === this.system) return this.val;
    const src = CoordinateSystems.get(this.system);
    const dst = CoordinateSystems.get(system);
    return this.project(dst, this.unproject(src, this.val));
  }

  to(system: CsName): CoordinateSystemValue<V> {
    if (system === this.system) return this;
    return this.create(this.get(system), system);
  }

  apply<Args extends readonly unknown[]>(
    func: (v: V, ...args: Args) => V,
    ...args: CoordinateSystemValues<Args> 
  ): CoordinateSystemValue<V> {
    return this.applyInto(func, (v,s) => this.create(v,s), ...args);
  }

  applyInto<Args extends readonly unknown[], R>(
    func: (v: V, ...args: Args) => R,
    csValueType: (value: R, system: CsName) => CoordinateSystemValue<R>,
    ...args: CoordinateSystemValues<Args> 
  ): CoordinateSystemValue<R> {
    const unwrap = <T>(a: CoordinateSystemValue<T>) => a.get(this.system);
    const unwrapped = args.map(unwrap) as any as Args;
    const result = func(this.val, ...unwrapped);
    return csValueType(result, this.system);
  }

  private create(v: V, system: CsName): CoordinateSystemValue<V> {
    return new CoordinateSystemValue<V>(
      v,
      system,
      this.project,
      this.unproject,
    );
  }
}

type Distance = CoordinateSystemValue<number>;
const Distance = (val: number, system: CsName): Distance => new CoordinateSystemValue(
  val,
  system,
  (s, d) => s.project.distance(d),
  (s, d) => s.unproject.distance(d),
);

type Position = CoordinateSystemValue<Point>;
const Position = (val: Point, system: CsName): Position => new CoordinateSystemValue(
  val,
  system,
  (s, p) => s.project.point(p),
  (s, p) => s.unproject.point(p),
);

type Vector = CoordinateSystemValue<Vec>;
const Vector = (val: Vec, system: CsName): Vector => new CoordinateSystemValue(
  val,
  system,
  (s, v) => s.project.vec(v),
  (s, v) => s.unproject.vec(v),
);

type Radians = Newtype<number, { readonly _: unique symbol; }>;
const Radians = newtype<Radians>();

type Angle = CoordinateSystemValue<Radians>;
const Angle = (val: Radians, system: CsName): Angle => new CoordinateSystemValue(
  val,
  system,
  (s, angle) => Radians(s.project.vec(Axis.X.rotate(unwrap(angle))).angle()),
  (s, angle) => Radians(s.unproject.vec(Axis.X.rotate(unwrap(angle))).angle()),
);


