type Transform<T> = (t: T) => T;
type Consume<T> = (t: T) => void;

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

