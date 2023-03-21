type Transform<T> = (t: T) => T;
type Consume<T> = (t: T) => void;
type Kinds<T> = T extends { kind: infer K } ? K : never;
type KindOf<T> = [T] extends [{ kind: infer K }] ? K : never;
type OfKind<A, K> = [A] extends [{ kind: K }] ? A : never;
type HomogenousKinds<A extends readonly unknown[]> = A extends readonly [{ kind: infer K }] ? A : never;
type Not<A, V> = [A] extends [V] ? never : A;
type MapF<A, B> = (a: A) => B;
type PredicateN<T extends readonly unknown[]> = (...args: T) => boolean;

const impossible = (x: never): never => {
  throw new Error('impossible');
}

const createUuid = () => {
  const letters: string[] = [];
  for (let i = 0; i < 20; i++) {
    const choice = Math.floor(Math.random() * 36);
    const letter = String.fromCharCode(
      choice < 10 ? (choice + '0'.charCodeAt(0)) : (choice - 10 + 'a'.charCodeAt(0))
    );
    letters.push(letter);
  }
  return letters.join('');
};

const reverseInPlace = <T>(arr: Array<T>): void => {
  for (let i = 0; i < Math.floor(arr.length / 2); i++) {
    const j = arr.length - i - 1;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
};

type ComparablePrimitive = number | string | boolean | null | undefined;

type RefCompareFunc<T> = [T] extends [ComparablePrimitive]
  ? PredicateN<readonly [T, T]> | undefined
  : PredicateN<readonly [T, T]>;


interface RefMapF<A, B> {
  from: MapF<B, A>;
  to: MapF<A, B>;
  compareValues: RefCompareFunc<B>;
}

interface RefDefBase<V> {
  readonly get: () => V;
  readonly set: (value: V) => void;
  readonly compareValues?: RefCompareFunc<V>;
}
type RefDef<V> = [V] extends [ComparablePrimitive]
  ? Pick<RefDefBase<V>, 'get' | 'set'> & Partial<Pick<RefDefBase<V>, 'compareValues'>>
  : Required<RefDefBase<V>>;

type RefCompareFuncArgs<T> = [T] extends [ComparablePrimitive]
  ? readonly [PredicateN<readonly [T, T]>] | readonly []
  : readonly [PredicateN<readonly [T, T]>];

const Refs = {
  mapDef: <A, B>(ref: RefDef<A>, f: RefMapF<A, B>): RefDef<B> => ({
    get: (): B => f.to(ref.get()),
    set: (value: B): void => ref.set(f.from(value)),
    compareValues: f.compareValues,
  }),
  of: <V extends Not<unknown, RefDef<any>>>(
    value: V,
    ...compareValues: RefCompareFuncArgs<V>
  ): Ref<V> => {
    const state = { value };
    const compare = compareValues.length === 1 ? compareValues[0] : undefined;
    return Ref({
      get: (): V => state.value,
      set: (value: V): void => {
        state.value = value;
      },
      compareValues: compare,
    } as RefDef<V>);
  },
};

class RefImpl<V> implements RefDefBase<V> {
  private readonly listeners = new Set<(value: V) => void>();
  private readonly _get: () => V;
  private readonly _set: (value: V) => void;
  public readonly compareValues: RefCompareFunc<V>;

  constructor(def: RefDef<V>) {
    this._get = def.get;
    this._set = def.set;
    this.compareValues = def.compareValues as RefCompareFunc<V>;
  }

  public get(): V {
    return this._get();
  }

  public set(value: V): void {
    if (this.eq(value)) return;
    this._set(value);
    for (const listener of this.listeners) {
      listener(value);
    }
  }

  public map<W>(f: RefMapF<V, W>): Ref<W> {
    return Ref(Refs.mapDef(this, f));
  }

  public eq(value: V): boolean {
    const cmp = this.compareValues;
    return typeof cmp !== 'undefined' ? cmp(this.get(), value) : this.get() === value; 
  }

  public onChange(listener: (value: V) => void) {
    this.listeners.add(listener);
  }

  public toString(): string {
    const value = this.get();
    return `Ref(${typeof value}: ${value})`;
  }
}

type Ref<V> = RefImpl<V>;
const Ref = <V>(def: RefDef<V>): Ref<V> => new RefImpl(def);

class DefaultMap<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly defaultValue: () => V) {
  }

  set(key: K, value: V) {
    this.map.set(key, value);
  }

  get(key: K): V {
    if (!this.map.has(key)) {
      this.map.set(key, this.defaultValue());
    }
    return this.map.get(key)!;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  keys(): Set<K> {
    return new Set(this.map.keys());
  }

  values(): V[] {
    return Array.from(this.map.values());
  }

  clear() {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

class Counter<K> extends DefaultMap<K, number> {
  constructor() {
    super(() => 0);
  }

  public inc(name: K): number {
    return this.add(name, 1);
  }

  public add(name: K, amount: number): number {
    const count = this.get(name) + amount;
    this.set(name, count);
    return count;
  }
}

class MultiMap<K, V> extends DefaultMap<K, Array<V>> {
  constructor() {
    super(() => []);
  }

  add(key: K, value: V) {
    this.get(key).push(value);
  }
}

