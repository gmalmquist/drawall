type Eid = Newtype<number, { readonly _: unique symbol; }>;
const Eid = newtype<Eid>();

const SOLO: unique symbol = Symbol();
// a component which always
// exists at most once on an 
// entity, and may be automatically
// instantiated.
interface Solo {
  readonly [SOLO]: true;
}

abstract class Component {
  private static readonly counter = new Counter<string>();
  private readonly kinds = new Set<ComponentType<Component>>();
  private _name: string = `${this.constructor.name} ${Component.counter.inc(this.constructor.name)}`;

  constructor(public readonly entity: Entity) {
  }

  get name(): string {
    return this._name;
  }

  addKind<C extends Component>(c: ComponentType<C>) {
    this.kinds.add(c);
  }

  getKinds(): ComponentType<Component>[] {
    const result = new Set(this.kinds);
    result.add(this.constructor as ComponentType<Component>);
    return Array.from(result);
  }

  tearDown() {
  }

  ref() {
    return this.entity.ref((_) => this);
  }
}

class TestComponent extends Component implements Solo {
  readonly [SOLO] = true;
}

type ComponentType<C extends Component> = new (entity: Entity, ...args: any[]) => C;

class ComponentMap {
  // map of component class constructors to component instances
  private readonly map = new Map<ComponentType<Component>, Set<Component>>();

  constructor(private readonly enforceSolo: boolean = true) {}

  public add<C extends Component>(c: C): boolean {
    if (this.enforceSolo
        && SOLO in c
        && this.has(c.constructor as ComponentType<Component>)) {
      // NB: only applies solo constraint on the subclass type
      return false;
    }
    for (const key of c.getKinds()) {
      this._add(key, c);
    }
    return true;
  }

  private _add<C extends Component>(key: ComponentType<C>, c: C): void {
    if (!this.map.has(key)) {
      this.map.set(key, new Set<Component>([c]));
    } else {
      const set = this.map.get(key)!;
      set.add(c);
      this.map.get(key)!.add(c);
    }
  }

  public get<C extends Component>(kind: ComponentType<C>): C[] {
    const set = this.map.get(kind);
    if (typeof set === 'undefined') {
      return [];
    }
    return Array.from(set).map(c => c as C);
  }

  public getOrCreate<C extends Component>(
    kind: new (e: Entity) => C,
    entity: Entity): C {
    const set = this.map.get(kind);
    if (typeof set === 'undefined' || set.size === 0) {
      const c = new kind(entity);
      this.map.set(kind, new Set([c]));
      return c;
    }
    return Array.from(set)[0] as C;
  }

  public has<C extends Component>(kind: ComponentType<C>): boolean {
    return this.map.has(kind) && this.map.get(kind)!.size > 0;
  }

  public hasInstance<C extends Component>(c: C): boolean {
    const kind = c.constructor as ComponentType<Component>;
    return this.map.has(kind) && this.map.get(kind)!.has(c);
  }

  public remove<C extends Component>(c: C): boolean {
    let removedAny: boolean = false;
    for (const key of c.getKinds()) {
      const set = this.map.get(key);
      if (typeof set === 'undefined' || !set.has(c)) {
        continue;
      }
      set.delete(c);
      removedAny = true;
    }
    return removedAny;
  }

  public removeAll<C extends Component>(kind: ComponentType<C>): C[] {
    const set = this.get(kind);
    if (set === null) return [];
    const arr = Array.from(set).map(c => c as C);
    arr.forEach(c => this.remove(c));
    return arr;
  }

  public keys(): Set<ComponentType<Component>> {
    return new Set(this.map.keys());
  }
}

class Entity {
  private readonly components = new ComponentMap(true);
  private destroyed = false;
  public name: string = '';

  constructor(
    public readonly ecs: EntityComponentSystem,
    public readonly id: Eid) {
  }

  add<C extends Component, A extends Array<any>>(
    kind: new (e: Entity, ...args: A) => C,
    ...args: A): C {
    const c = new kind(this, ...args);
    return this._add(c);
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  get isAlive(): boolean {
    return !this.destroyed;
  }

  private _add<C extends Component>(c: C): C {
    if (c.entity.id !== this.id) {
      throw new Error(`Cannot add ${c.entity.id}'s component to entity ${this.id}!`);
    }
    if (!this.components.add(c)) {
      // is solo component, return previous instance.
      return this.components.get(c.constructor as ComponentType<C>)[0];
    }
    this.ecs.registerComponent(c);
    return c;
  }

  remove<C extends Component>(c: C): boolean {
    if (this.components.remove(c)) {
      c.tearDown();
      this.ecs.removeComponent(c);
      return true;
    }
    return false;
  }

  removeAll<C extends Component>(kind: ComponentType<C>): C[] {
    const arr = this.components.removeAll(kind);
    for (const c of arr) {
      c.tearDown();
      this.ecs.removeComponent(c);
    }
    return arr;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const kinds = this.components.keys();
    kinds.forEach(c => this.removeAll(c));
    this.ecs.deleteEntity(this.id);
  }

  has<C extends Component>(kind: ComponentType<C>): boolean {
    return this.components.get(kind).length > 0;
  }

  get<C extends Component>(kind: ComponentType<C>): C[] {
    return this.components.get(kind);
  }

  getRef<C extends Component>(kind: ComponentType<C>): EntityRef<C[]> {
    return this.ref(e => e.get(kind));
  }

  only<C extends Component, Solo>(kind: ComponentType<C>): C {
    const arr = this.get(kind);
    if (arr.length !== 1) {
      throw new Error(`Expected exactly one of ${kind} on ${this}!`);
    }
    return arr[0];
  }

  onlyRef<C extends Component, Solo>(kind: ComponentType<C>): EntityRef<C> {
    return this.ref(e => e.only(kind));
  }

  getOrCreate<C extends Component>(kind: ComponentType<C>): C {
    return this.components.getOrCreate(kind, this);
  }

  ref<T>(f: (e: Entity) => T): EntityRef<T> {
    return EntityRef(f, this);
  }

  toString() {
    return `Entity(id=${this.id}, name=${this.name})`;
  }
}

class EntityRefImpl<T> {
  constructor(
    private readonly getter: () => T,
    private readonly entities: readonly Entity[],
  ) {
  }

  get isAlive(): boolean {
    return this.entities.every(e => e.isAlive);
  }

  or<X>(x: X): T | X {
    if (this.isAlive) {
      return this.getter();
    }
    return x;
  }

  unwrap(): T | null {
    if (!this.isAlive) return null;
    return this.getter();
  }

  map<U>(f: (x: T) => U): EntityRefImpl<U> {
    return new EntityRefImpl(
      () => f(this.getter()),
      this.entities,
    );
  }

  and<U>(e: EntityRefImpl<U>): EntityRefImpl<readonly [T, U]> {
    return new EntityRefImpl(
      () => [this.getter(), e.getter()],
      [...this.entities, ...e.entities],
    );
  }

  with(f: (t: T) => void) {
    if (this.isAlive) {
      f(this.getter());
    }
  }
}

type EntityRef<T> = EntityRefImpl<T>;
const EntityRef = <T, E extends readonly Entity[]>(
  getter: (...entities: E) => T, ...entities: E): EntityRefImpl<T> => {
  return new EntityRefImpl(() => getter(...entities), entities);
};

class EntityComponentSystem {
  private readonly entities = new Map<Eid, Entity>();
  private readonly components = new ComponentMap(false);
  private readonly systems: System[] = [];
  private nextEid: number = 0;

  constructor() {}

  deleteEntity(e: Eid) {
    const entity = this.entities.get(e);
    if (typeof entity === 'undefined') {
      return;
    }
    this.entities.delete(e);
    entity.destroy();
  }

  createEntity(...components: (new (e: Entity) => Component)[]): Entity {
    const e = new Entity(this, Eid(this.nextEid++));
    this.entities.set(e.id, e);
    for (const c of components) {
      e.add(c);
    }
    return e;
  }

  getComponents<C extends Component>(kind: ComponentType<C>): C[] {
    return this.components.get(kind).filter(c => !c.entity.isDestroyed);
  }

  registerComponent<C extends Component>(c: C) {
    this.components.add(c);
  }

  removeComponent(c: Component) {
    if (!this.components.remove(c)) {
      return;
    }
    c.entity.remove(c);
  }

  registerSystem(s: System) {
    this.systems.push(s);
  }

  update() {
    for (const s of this.systems) {
      s(this);
    }
  }
}

type System = (ecs: EntityComponentSystem) => void;

