const TAU = Math.PI * 2;

const lerp = (s: number, a: number, b: number) => (1.0 - s) * a + s * b;

const normalizeRadians = (a: number) => {
  let r = a;
  while (r < 0) r += TAU;
  return r % TAU;
};

const radianDelta = (a: number, b: number) => {
  const src = normalizeRadians(a);
  const dst = normalizeRadians(b);

  const forward = b - a;
  const backward = (b - TAU) - a;

  return Math.abs(forward) < Math.abs(backward) ? forward : backward;
};

const toDegrees = (r: number): number => r * 180 / Math.PI;
const toRadians = (d: number): number => d * Math.PI / 180;

const degreeDelta = (a: number, b: number): number => {
  return toDegrees(radianDelta(toRadians(a), toRadians(b)));
};

const uprightAngle = (a: number): number => {
  const angle = normalizeRadians(a);
  if (Math.abs(Math.PI - angle) < Math.PI/2) {
    return angle + Math.PI;
  }
  return angle;
};

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

  trunc(f: number = 1.0): Point {
    return new Point(
      f * Math.floor(this.x / f),
      f * Math.floor(this.y / f),
    );
  }

  onLine(a: Point, tan: Vec): Point {
    const s = Vec.between(a, this).dot(tan) / tan.mag2();
    return a.splus(s, tan);
  }

  to(dst: Point): Vec {
    return Vec.between(this, dst);
  }

  lerp(s: number, pt: Point): Point {
    return new Point(lerp(s, this.x, pt.x), lerp(s, this.y, pt.y));
  }

  toVec(): Vec {
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

  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  r90(): Vec {
    return new Vec(-this.y, this.x);
  }

  rotate(angle: number): Vec {
    return new Vec(
      Math.cos(angle) * this.x - Math.sin(angle) * this.y,
      Math.sin(angle) * this.x + Math.cos(angle) * this.y,
    );
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

  unit(): Vec {
    const mag2 = this.mag2();
    if (mag2 < 0.0001 || mag2 === 1.0) return this;
    return this.scale(1.0 / Math.sqrt(mag2));
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

  onAxis(vec: Vec): Vec {
    return vec.scale(this.dot(vec) / vec.mag2());
  }

  offAxis(vec: Vec): Vec {
    return this.minus(this.onAxis(vec));
  }

  toPoint(): Point {
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

interface RayHit {
  time: number;
  point: Point;
}

class Ray {
  constructor(
    public readonly origin: Point,
    public readonly direction: Vec) {}

  at(t: number): Point {
    return this.origin.splus(t, this.direction);
  }

  intersection(other: Ray): RayHit | null {
    // (o+d*t - Pq)*Nq =0
    // (O - Pq)*Nq + (Nq*d)*t = 0
    const normal = other.direction.r90();
    const denominator = this.direction.dot(normal);
    if (Math.abs(denominator) < 0.0001) return null;
    const time = Vec.between(this.origin, other.origin).dot(normal) / denominator;
    return {
      time,
      point: this.origin.splus(time, this.direction),
    };
  } 
}

class Edge {
  constructor(
    public readonly src: Point,
    public readonly dst: Point) {}

  ray(): Ray {
    return new Ray(this.src, this.vector());
  }

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

  toLocalPoint(p: Point) {
    const delta = Vec.between(this.origin, p);
    return new Point(
      delta.dot(this.axisI) / this.axisI.mag2(),
      delta.dot(this.axisJ) / this.axisJ.mag2(),
    );
  }

  toLocalVec(v: Vec) {
    return new Vec(
      v.dot(this.axisI) / this.axisI.mag2(),
      v.dot(this.axisJ) / this.axisJ.mag2(),
    );
  }

  toGlobalVec(v: Vec) {
    return new Vec(
      v.x * this.axisI.x + v.y * this.axisJ.x,
      v.x * this.axisI.y + v.y * this.axisJ.y,
    );
  }

  toGlobalPoint(p: Point) {
    return this.origin.plus(this.toGlobalVec(p.toVec()));
  }

  get project(): Transform2 {
    return {
      vec: v => this.toGlobalVec(v),
      point: p => this.toGlobalPoint(p),
      distance: d => d * Math.sqrt(this.axisI.mag() * this.axisJ.mag()),
    };
  }

  get unproject(): Transform2 {
    return {
      vec: v => this.toLocalVec(v),
      point: p => this.toLocalPoint(p),
      distance: d => d / Math.sqrt(this.axisI.mag() * this.axisJ.mag()),
    };
  }

  toString(): string {
    return `{O=${this.origin}, I=${this.axisI}, J=${this.axisJ}}`;
  }

  static get identity() {
    return new Frame(Point.ZERO, Axis.X, Axis.Y);
  }
}













