const lerp = (s: number, a: number, b: number) => (1.0 - s) * a + s * b;

class Point {
  constructor(public readonly x: number, public readonly y: number) {}

  splus(scale: number, vec: Vec): Point {
    return new Point(
      this.x + scale * vec.x,
      this.y + scale * vec.y,
    );
  }

  plus(vec: Vec): Point {
    return this.splus(1.0, vec);
  }

  minus(vec: Vec): Point {
    return this.splus(-1.0, vec);
  }

  to(dst: Point): Vec {
    return Vec.between(this, dst);
  }

  lerp(s: number, pt: Point): Point {
    return new Point(lerp(s, this.x, pt.x), lerp(s, this.y, pt.y));
  }

  as_vec(): Vec {
    return new Vec(this.x, this.y);
  }

  toString(): string {
    return `(${this.x}, ${this.y})`;
  }

  static get ZERO() {
    return new Point(0., 0.);
  }
}

class Axis {
  static get X() {
    return new Vec(1., 0.);
  }

  static get Y() {
    return new Vec(0., 1.);
  }
}

class Vec {
  constructor(public readonly x: number, public readonly y: number) {}

  r90(): Vec {
    return new Vec(-this.y, this.x);
  }

  rotate(angle: number): Vec {
    return new Vec(
      Math.cos(angle * this.x) - Math.sin(angle * this.y),
      Math.sin(angle * this.x) + Math.cos(angle * this.y)
    );
  }

  unit(): Vec {
    const m = this.mag();
    if (m < 0.0001) return this;
    return this.scale(1.0 / m);
  }

  dot(vec: Vec): number {
    return this.x * vec.x + this.y * vec.y;
  }

  mag2(): number {
    return this.dot(this);
  }

  mag(): number {
    return Math.sqrt(this.mag2());
  }

  scale(factor: number): Vec {
    return new Vec(this.x * factor, this.y * factor);
  } 

  neg(): Vec {
    return new Vec(-this.x, -this.y);
  }

  splus(scale: number, vec: Vec): Vec {
    return new Vec(
      this.x + scale * vec.x,
      this.y + scale * vec.y,
    );
  }

  plus(vec: Vec): Vec {
    return this.splus(1.0, vec);
  }

  minus(vec: Vec): Vec {
    return this.splus(-1.0, vec);
  }

  on_axis(vec: Vec): Vec {
    return vec.scale(this.dot(vec) / vec.mag2());
  }

  off_axis(vec: Vec): Vec {
    return this.minus(this.on_axis(vec));
  }

  as_point(): Point {
    return new Point(this.x, this.y);
  }

  toString(): string {
    return `<${this.x}, ${this.y}>`;
  }

  static between(a: Point, b: Point): Vec {
    return new Vec(b.x - a.x, b.y - a.y);
  }

  static get ZERO() {
    return new Vec(0., 0.);
  }
}

class Edge {
  constructor(
    public readonly src: Point,
    public readonly dst: Point) {}

  vector(): Vec {
    return Vec.between(this.src, this.dst);
  }

  intersects(edge: Edge): boolean {
    const e1 = this.vector();
    const e2 = edge.vector();
    const t1 = e1.r90();
    const t2 = e2.r90();
    if (Vec.between(this.src, edge.src).dot(t1) > 0 === Vec.between(this.src, edge.dst).dot(t1) > 0) {
      return false;
    }
    if (Vec.between(edge.src, this.src).dot(t2) > 0 === Vec.between(edge.src, this.dst).dot(t2) > 0) {
      return false;
    }
    return true;
  }

  distance(point: Point): number {
    const tangent = this.vector();
    const delta = Vec.between(this.src, point);
    const s = delta.dot(tangent) / tangent.mag2();
    if (s <= 0) return Vec.between(this.src, point).mag();
    if (s >= 1) return Vec.between(this.dst, point).mag();
    return Vec.between(point, this.src.lerp(s, this.dst)).mag();
  }

  toString(): string {
    return `[${this.src}, ${this.dst}]`;
  }
}

interface Transform2 {
  point: (p: Point) => Point;
  vec: (v: Vec) => Vec;
  distance: (d: number) => number;
}

class Frame {
  constructor(
    public readonly origin: Point,
    public readonly axisI: Vec,
    public readonly axisJ: Vec) {}

  to_local_point(p: Point) {
    const delta = Vec.between(this.origin, p);
    return new Point(
      delta.dot(this.axisI) / this.axisI.mag2(),
      delta.dot(this.axisJ) / this.axisJ.mag2(),
    );
  }

  to_local_vec(v: Vec) {
    return new Vec(
      v.dot(this.axisI) / this.axisI.mag2(),
      v.dot(this.axisJ) / this.axisJ.mag2(),
    );
  }

  to_global_vec(v: Vec) {
    return new Vec(
      v.x * this.axisI.x + v.y * this.axisJ.x,
      v.x * this.axisI.y + v.y * this.axisJ.y,
    );
  }

  to_global_point(p: Point) {
    return this.origin.plus(this.to_global_vec(p.as_vec()));
  }

  get project(): Transform2 {
    return {
      vec: v => this.to_global_vec(v),
      point: p => this.to_global_point(p),
      distance: d => d * Math.sqrt(this.axisI.mag() * this.axisJ.mag()),
    };
  }

  get unproject(): Transform2 {
    return {
      vec: v => this.to_local_vec(v),
      point: p => this.to_local_point(p),
      distance: d => d / Math.sqrt(this.axisI.mag() * this.axisJ.mag()),
    };
  }

  toString(): string {
    return `{O=${this.origin}, I=${this.axisI}, J=${this.axisJ}}`;
  }

  static get IDENTITY() {
    return new Frame(Point.ZERO, Axis.X, Axis.Y);
  }
}













