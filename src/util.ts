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

class Counter<K> {
  private readonly counts = new Map<K, number>();

  public get(name: K): number {
    if (!this.counts.has(name)) return 0;
    return this.counts.get(name)!;
  }

  public inc(name: K): number {
    return this.add(name, 1);
  }

  public add(name: K, amount: number): number {
    const count = this.get(name) + amount;
    this.counts.set(name, count);
    return count;
  }

  public clear(name: K) {
    this.counts.delete(name);
  }

  public clearAll() {
    this.counts.clear();
  }
}
