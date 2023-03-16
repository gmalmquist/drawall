type Eid = Newtype<number, { readonly _: unique symbol; }>;
const Eid = newtype<Eid>();

type Cid = Newtype<number, { readonly _: unique symbol; }>;
const Cid = newtype<Cid>();
const Cids = {
  _count: 0,
};
const nextCid = () => {
  return Cid(Cids._count++);
};

abstract class Component {
  public entity: Entity | null = null;

  abstract id(): Cid;

  attach(entity: Entity) {
    this.entity = entity;
  }
}

class Entity {
  private readonly componentMap = new Map<Cid, Component>();

  constructor(
    public readonly ecs: EntityComponentSystem,
    public readonly id: Eid) {
  }

  add(c: Component) {
    if (c.entity !== null && c.entity.id !== this.id) {
      c.entity.remove(c.id());
    }
    this.componentMap.set(c.id(), c);
    this.ecs.registerComponent(c);
    c.attach(this);
  }

  remove(c: Cid): Component | null {
    const component = this.componentMap.get(c);
    if (typeof component === 'undefined') {
      return null;
    }
    this.componentMap.delete(c);
    component.entity = null;
    this.ecs.removeComponent(component);
    return component;
  }

  delete() {
    const cids = Array.from(this.componentMap.keys());
    cids.forEach(c => this.remove(c));
    this.ecs.deleteEntity(this.id);
  }

  get<T extends Component>(id: Cid): T | null {
    const result = this.componentMap.get(id);
    if (typeof result === 'undefined') {
      return null;
    }
    return result as T;
  }
}

class EntityComponentSystem {
  private readonly entities = new Map<Eid, Entity>();
  private readonly components = new Map<Cid, Component[]>();
  private readonly systems: System[] = [];
  private nextEid: number = 0;

  constructor() {}

  deleteEntity(e: Eid) {
    const entity = this.entities.get(e);
    if (typeof entity === 'undefined') {
      return;
    }
    this.entities.delete(e);
    entity.delete();
  }

  createEntity(...components: Component[]): Entity {
    const e = new Entity(this, Eid(this.nextEid++));
    this.entities.set(e.id, e);
    for (const c of components) {
      e.add(c);
    }
    return e;
  }

  getComponents<T extends Component>(cid: Cid): T[] {
    const list = this.components.get(cid);
    if (typeof list === 'undefined') {
      return [];
    }
    return list.map(c => c as T);
  }

  registerSystem(s: System) {
    this.systems.push(s);
  }

  registerComponent(c: Component) {
    if (!this.components.has(c.id())) {
      this.components.set(c.id(), [c]);
    } else {
      const list = this.components.get(c.id())!;
      list.push(c);
    }
  }

  removeComponent(c: Component) {
    if (c.entity !== null) {
      c.entity.remove(c.id());
      return; // entity will re-delecate
    }
    const list = this.components.get(c.id());
    if (typeof list === 'undefined') {
      return;
    }
    this.components.set(c.id(), list.filter(x => x !== c));
  }

  update() {
    for (const s of this.systems) {
      s(this);
    }
  }
}

type System = (ecs: EntityComponentSystem) => void;

