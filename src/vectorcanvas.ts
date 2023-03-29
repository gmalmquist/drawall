interface CanvasApi {
  rect(rect: Rect, style: PathStyle): void;
}

interface PathStyle {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  lineDash?: number[];
  opacity?: number;
  fillOpacity?: number;
  strokeOpacity?: number;
}

type SvgAttribute = string | number | Array<string | number>;

interface SvgAttributes {
  [key: string]: SvgAttribute;
}

type CoallesceElement = string | number | undefined | SvgAttribute;

const coallesce = <V>(...items: V[]): V | undefined => {
  for (const item of items) {
    if (typeof item !== 'undefined' && item !== null) {
      return item;
    }
  }
  return undefined;
};

class VectorCanvas implements CanvasApi {
  private static readonly NS = 'http://www.w3.org/2000/svg'; 
  private static defaultPathStyle: PathStyle = {
    fill: 'transparent',
    stroke: 'transparent',
  };

  private readonly root: SvgElementWrap;
  private readonly cache = new Map<string, SvgElementWrap>();
  private readonly tagCount = new Counter<string>();
  private readonly freshIds = new Set<string>();
  private readonly dirtyIds = new Set<string>();
  private currentPath = new Array<string | number>();

  constructor(svg: Element) { 
    this.root = new SvgElementWrap(svg);
  }

  setup() {
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  update() {
    this.tagCount.clear();
    this.dirtyIds.forEach(id => {
      if (this.freshIds.has(id)) {
        return;
      }
      const item = this.cache.get(id)!;
      item.element.parentNode?.removeChild(item.element);
    });
    this.dirtyIds.clear();
    this.freshIds.forEach(id => this.dirtyIds.add(id));
    this.freshIds.clear();
  }

  rect(rect: Rect, style: PathStyle) {
    this.beginPath();
    const [first, ...more] = rect.corners;
    this.moveTo(first);
    for (const c of more) {
      this.lineTo(c);
    }
    this.closePath();
    this.drawPath(style);
  }

  line(a: Position, b: Position, style: PathStyle) {
    this.beginPath();
    this.moveTo(a);
    this.lineTo(b);
    this.drawPath(style);
  }

  beginPath() {
    this.currentPath = [];
  }

  moveTo(p: Position) {
    this.currentPath.push('M');
    this.currentPath.push(this.fmtp(p));
  }

  lineTo(p: Position) {
    this.currentPath.push('L');
    this.currentPath.push(this.fmtp(p));
  }

  closePath() {
    this.currentPath.push('Z');
  }

  drawPath(style: PathStyle) {
    const s = {
      ...VectorCanvas.defaultPathStyle,
      ...style,
    };
    const path = this.element('path');
    path.set('d', this.currentPath);
    path.set('fill', s.fill);
    path.set('stroke', s.stroke);
    path.set('stroke-opacity', coallesce(s.strokeOpacity, s.opacity));
    path.set('fill-opacity', coallesce(s.fillOpacity, s.opacity));
    this.render(path);
  }

  text(text: TextDrawProps) {
    const element = this.element('text');
    element.innerHTML = text.text;
    element.setXY(text.point);
    element.set('stroke', `${text.stroke}`);
    element.set('fill', `${text.fill}`);
    element.set('font-size', App.settings.fontSize); 
    const cssStyles = {
      'text-align': text.align,
      'text-baseline': text.baseline,
    };

    element.set('style', Object.entries(cssStyles)
      .filter(([_, v]) => typeof v !== 'undefined')
      .map(([k, v]) => `${k}: ${v};`).join(' '));
    this.render(element);
  }

  private fmtp(point: Position): string {
    const p = point.get('screen').trunc();
    return `${p.x} ${p.y}`;
  }

  private fmtv(vector: Vector): string {
    const v = vector.get('screen');
    return `${v.x} ${v.y}`;
  }

  private fmtd(distance: Distance): string {
    const s = distance.get('screen');
    return `${s}`;
  }

  private fmta(angle: Angle): string {
    const a = angle.get('screen');
    return `${a}`;
  }

  private render(svg: SvgElementWrap) {
    svg.clean();
    this.root.appendChild(svg);
  }

  private element(tag: string): SvgElementWrap {
    const id = `${tag}:${this.tagCount.inc(tag)}`;
    this.freshIds.add(id);
    if (this.cache.has(id)) {
      const e = this.cache.get(id)!;
      e.recycle();
      return e;
    }
    const element = new SvgElementWrap(document.createElementNS(VectorCanvas.NS, tag));
    this.cache.set(id, element);
    return element;
  }

  private handleResize() {
    const width = this.root.element.clientWidth;
    const height = this.root.element.clientHeight;
    this.root.set('viewBox', [0, 0, width, height]);
    this.root.set('width', width);
    this.root.set('height', height);
  }
}

class SvgElementWrap {
  private readonly attributes = new Map<string, string>();
  private readonly dirty = new Set<string>();

  constructor(public readonly element: Element) {
  }

  get innerHTML(): string {
    return this.attributes.get('') || '';
  }

  set innerHTML(v: string) {
    this.attributes.set('', v);
  }

  public recycle() {
    this.dirty.clear();
    for (const key of this.attributes.keys()) {
      this.dirty.add(key);
    }
    if (this.element.innerHTML.length > 0) {
      this.element.innerHTML = '';
    }
  }

  public clean() {
    for (const key of this.dirty) {
      this.clear(key);
    }
  }

  public setAll(attrs: SvgAttributes) {
    Object.keys(attrs).forEach(a => this.set(a, attrs[a]));
  }

  public set(name: string, value?: SvgAttribute) {
    if (typeof value === 'undefined') {
      this.clear(name);
      return;
    }
    this.dirty.delete(name);
    const v = this.format(value);
    if (this.attributes.get(name) === v) {
      return;
    }
    this.attributes.set(name, v);
    if (name === '') {
      // inner html marker
      this.element.innerHTML = v;
    } else {
      this.element.setAttribute(name, v);
    }
  }

  public setXY(pos: Position) {
    const p = pos.get('screen').trunc();
    this.set('x', p.x);
    this.set('y', p.y);
  }

  public clear(name: string) {
    this.dirty.delete(name);
    if (this.attributes.has(name) && this.attributes.get(name)!.length > 0) {
      this.attributes.delete(name);
      if (name === '') {
        this.element.innerHTML = '';
      } else {
        this.element.removeAttribute(name);
      }
    }
  }

  public format(value: SvgAttribute) {
    if (typeof value === 'string' || typeof value === 'number') {
      return value.toString();
    }
    return value.map(v => v.toString()).join(' ');
  }

  public appendChild(svg: SvgElementWrap) {
    this.element.appendChild(svg.element);
  }
}

