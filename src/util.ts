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

const areEq = <V>(a: V, b: V) => a === b;

const Memo = <V>(f: () => V, fingerprint?: () => readonly any[]): (() => V)  => {
  const s: { value?: V, print?: readonly any[] } = {};
  return () => {
    if (typeof fingerprint !== 'undefined') {
      const print = fingerprint();
      if (typeof s.print === 'undefined' 
        || print.length !== s.print.length
        || print.some((e, i) => e !== s.print![i])) {
        s.print = print;
        s.value = f();
        return s.value;
      }
    }
    if (typeof s.value === 'undefined') {
      s.value = f();
    }
    return s.value;
  };
};

interface Eq<T> {
  eq: (other: T) => boolean;
}

type Comparable<T> = number | string | boolean | null | undefined | Eq<T>;

type RefCompareFunc<V> = [V] extends [Comparable<V>]
  ? PredicateN<readonly [V, V]> | undefined
  : PredicateN<readonly [V, V]>;

type CompareFuncVarg<V> = [V] extends [Comparable<V>]
  ? readonly [PredicateN<readonly [V, V]>] | readonly []
  : readonly [PredicateN<readonly [V, V]>];
;

type CompareFuncPartial<V> = [V] extends [Comparable<V>]
  ? { compareValues?: RefCompareFunc<V> }
  : { compareValues: RefCompareFunc<V> }
;

interface RefMapFBase<A, B> {
  from: MapF<B, A>;
  to: MapF<A, B>;
}

type RefMapF<A, B> = RefMapFBase<A, B> & CompareFuncPartial<B>;

type RefK = 'ro' | 'rw';

interface RefBase<V> {
  readonly get: () => V;
}

interface RefView<V, K extends RefK> extends RefBase<V> {
  readonly kind: K;
  readonly onChange: (listener: (value: V) => void) => void;
}

interface RoRef<V> extends RefView<V, 'ro'> {
  readonly map: <W>(f: (value: V) => W) => RoRef<W>;
  readonly toString: () => string;
}

interface RefDefBase<V> extends RefBase<V> {
  readonly set: (value: V) => void;
}

type RefDef<V> = RefDefBase<V> & CompareFuncPartial<V>;

type RefValue<R extends RefDefBase<unknown>> = R extends RefDefBase<infer T> ? T : never;

type UnwrapRefArray<A extends readonly unknown[]> = A extends readonly []
  ? readonly []
  : A extends readonly [RefBase<infer Start>, ...infer Rest]
    ? readonly [Start, ...UnwrapRefArray<Rest>]
    : never
;

const Refs = {
  of: <V extends Not<unknown, RefDef<any>>>(
    value: V,
    ...compareValues: CompareFuncVarg<V>
  ): Ref<V> => {
    const state = { value };
    const compare = compareValues.length === 1 ? compareValues[0] : undefined;
    return new RefImpl({
      get: (): V => state.value,
      set: (value: V): void => {
        state.value = value;
      },
      compareValues: compare,
    } as RefDef<V>);
  },
  mapDef: <A, B>(ref: RefDef<A>, f: RefMapF<A, B>): RefDef<B> => ({
    get: (): B => f.to(ref.get()),
    set: (value: B): void => ref.set(f.from(value)),
    compareValues: f.compareValues as RefCompareFunc<B>,
  }),
  reduce: <A extends readonly Ref<any>[], B>(
    map: RefMapF<UnwrapRefArray<A>, B>,
    ...refs: A
  ): Ref<B> => {
    const reduced = new RefImpl({
      get: (): B => map.to(refs.map(r => r.get()) as unknown as UnwrapRefArray<A>),
      set: (value: B): void => {
        const values = map.from(value);
        for (let i = 0; i < refs.length; i++) {
          const ref = refs[i];
          const val = values[i];
          (ref as Ref<any>).set(val as any);
        }
      },
      compareValues: map.compareValues,
    } as RefDef<B>);
    for (const ref of refs) {
      reduced.upstream.add(ref);
      ref.downstream.add(reduced);
    }
    return reduced;
  },
  polling: <V extends Not<unknown, RefDef<any>>>(
    props: PollingRefProps<V>,
    ...compareValues: CompareFuncVarg<V>
  ): Ref<V> => {
    const ref = Refs.of(props.poll(), ...compareValues);
    const state = { interval: 0 };
    state.interval = setInterval(() => {
      if (props.stopWhen()) {
        clearInterval(state.interval);
        return;
      }
      ref.set(props.poll());
    }, props.delayMillis);
    return ref;
  },
  negate: (ref: Ref<boolean>): Ref<boolean> => ref.map({
    to: (v: boolean) => !v,
    from: (v: boolean) => !v,
  }),
  mapRo: <V, W>(ref: RefView<V, RefK>, f: (value: V) => W): RoRef<W> => ({
    kind: 'ro',
    get: () => f(ref.get()),
    onChange: (l: (w: W) => void) => ref.onChange(v => l(f(v))),
    toString: () => `Ro(${f(ref.get())})`,
    map: <X>(g: (w: W) => X): RoRef<X> => Refs.mapRo(ref, (v: V): X => g(f(v))),
  }),
  ro: <V>(ref: RefView<V, RefK>): RoRef<V> => {
    if (ref.kind === 'ro') {
      return ref as RoRef<V>;
    }
    const r: { self?: RoRef<V> } = {};
    r.self = {
      kind: 'ro',
      get: () => ref.get(),
      onChange: l => ref.onChange(l),
      toString: () => `Ro(${ref.get()})`,
      map: f => Refs.mapRo(r.self!, f),
    };
    return r.self;
  },
  memo: <V>(ref: RefView<V, RefK>): RoRef<V> => {
    return Refs.memoMap(ref, x => x);
  },
  memoMap: <V, W>(ref: RefView<V, RefK>, f: (v: V) => W): RoRef<W> => {
    const initial = ref.get();
    const state: {
      value: V,
      mapped: W,
      valid: boolean,
      self?: RoRef<W>,
    } = {
      value: initial,
      mapped: f(initial),
      valid: true,
    };
    ref.onChange(v => {
      state.value = v;
      state.valid = false;
    });
    state.self = {
      kind: 'ro',
      get: () => {
        if (!state.valid) {
          state.mapped = f(state.value);
          state.valid = true;
        }
        return state.mapped;
      },
      onChange: listen => ref.onChange(v => listen(
        state.valid ? state.mapped : state.self!.get()
      )),
      toString: () => `MemoRoRef(${state.self!.get()})`,
      map: f => Refs.mapRo(state.self!, f),
    };
    return state.self;
  },
  reduceRo: <A extends readonly RefView<any, RefK>[], B>(
    map: (arr: UnwrapRefArray<A>) => B,
    ...refs: A
  ): RoRef<B> => {
    const get = (): UnwrapRefArray<A> => {
      const u = <V>(r: RefView<V, RefK>): V => r.get();
      return refs.map(u) as UnwrapRefArray<A>;
    };
    const r: { self?: RoRef<B> } = {};
    r.self = {
      kind: 'ro',
      get: () => map(get()),
      onChange: (l: (value: B) => void) => {
        refs.forEach(r => r.onChange(_ =>
          l(map(get()))
        ));
      },
      toString: () => `Ro(${map(get())})`,
      map: <X>(g: (value: B) => X): RoRef<X> => Refs.mapRo(r.self!, g),
    };
    return r.self!;
  },
  flatMapRo: <V, W>(
    ref: RefView<V, RefK>,
    f: (value: V) => RefView<W, RefK>,
  ): RoRef<W> => {
    const egg = Refs.mapRo(ref, f);
    const r: { self?: RoRef<W> } = {};
    const yolkListener = (
      expectedYolk: RefView<W, RefK>,
      listen: (value: W) => void): ((value: W) => void) => {
      return value => {
        if (egg.get() === expectedYolk) {
          listen(value);
        }
      };
    };
    r.self = {
      kind: 'ro',
      get: () => egg.get().get(),
      onChange: listen => {
        const yolk = egg.get();
        yolk.onChange(yolkListener(yolk, listen));
        egg.onChange(yolk => { 
          yolk.onChange(yolkListener(yolk, listen));
          listen(yolk.get());
        });
      },
      toString: () => egg.get().toString(),
      map: g => Refs.mapRo(r.self!, g),
    };
    return r.self;
  }
};

interface PollingRefProps<V> {
  poll: () => V;
  stopWhen: () => boolean;
  delayMillis: number;
}

class RefImpl<V> implements RefDefBase<V>, RefView<V, 'rw'> {
  readonly upstream = new Set<RefImpl<any>>();
  readonly downstream = new Set<RefImpl<any>>();
  public readonly kind = 'rw';
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
    if (this.eq(value)) {
      return;
    }
    this._set(value);
    this.fireUpdate({ value, kind: 'internal' });
  }

  public map<W>(f: RefMapF<V, W>): Ref<W> {
    const mapped = new RefImpl(Refs.mapDef(this, f));
    mapped.upstream.add(this);
    this.downstream.add(mapped);
    return mapped;
  }

  public eq(other: V): boolean {
    const value = this.get();
    const cmp = this.compareValues;
    if (typeof cmp !== 'undefined') {
      return cmp(value, other);
    }
    if (typeof (value as any).eq === 'function') {
      return (value as unknown as Eq<V>).eq(other);
    }
    return value === other;
  }

  public onChange(listener: (value: V) => void) {
    this.listeners.add(listener);
  }

  public toString(): string {
    const value = this.get();
    return `Ref(${typeof value}: ${value})`;
  }

  private getUpdateValue(update: RefUpdate<V>): V {
    if (update.kind === 'external') {
      return this.get();
    }
    return update.value;
  }

  private fireUpdate(update: RefUpdate<V>) {
    if (update.kind === 'external' && update.source === this) {
      // This shouldn't be possible.
      return;
    }

    const value = this.getUpdateValue(update);
    for (const listener of this.listeners) {
      listener(value);
    }

    const event: Pick<RefExternalUpdate, 'kind' | 'source'> = {
      kind: 'external',
      source: this,
    };

    if (update.kind === 'internal' || update.direction === 'up') {
      for (const ref of this.upstream) {
        ref.fireUpdate({ direction: 'up', ...event }); 
      }
    }
    if (update.kind === 'internal' || update.direction === 'down') {
      for (const ref of this.downstream) {
        ref.fireUpdate({ direction: 'down', ...event }); 
      }
    }
  }
}

type RefUpdate<V> = RefInternalUpdate<V> | RefExternalUpdate;

interface RefInternalUpdate<V> {
  readonly kind: 'internal';
  readonly value: V;
}

interface RefExternalUpdate {
  readonly kind: 'external';
  readonly source: Ref<any>;
  readonly direction: 'up' | 'down';
}

type Ref<V> = RefImpl<V>;

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

