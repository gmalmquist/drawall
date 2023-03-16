const WHITESPACE_PATTERN = /\s+/img;

class Amount {
  constructor(
    public value: number,
    public readonly unit: string,
  ) {}

  toString() {
    return `${this.value} ${this.unit}`;
  }
}

const prettyNum = (num: number): string => {
  if (num === 0) return '0';
  const negative = num < 0;
  const integer = Math.floor(Math.abs(num)).toString();
  const parts = [];
  if (negative) {
    parts.push('-');
  }
  for (let i = 0; i < integer.length; i++) {
    parts.push(integer.charAt(i));
    if (i < integer.length - 1 && (integer.length - i - 1) % 3 === 0) {
      parts.push(',');
    }
  }
  const fractional = Math.abs(num) - Math.floor(Math.abs(num));
  if (Math.abs(num) < 0.01) {
    parts.push(fractional.toString().substring(1));
  } else if (Math.abs(num) < 1000) {
    parts.push((Math.floor(fractional * 100)/100).toString().substring(1));
  }
  return parts.join('');
};

type FormatUnit = (amount: Amount) => string;
type ParseUnit = (...arr: number[]) => Amount | null;

type UnitPatternNumeric = Newtype<string, { readonly _: unique symbol; }>;
const UnitPatternNumeric = newtype<UnitPatternNumeric>();

type UnitPatternLiteral = Newtype<string, { readonly _: unique symbol; }>;
const UnitPatternLiteral = newtype<UnitPatternLiteral>();

type UnitPatternElement = UnitPatternNumeric | UnitPatternLiteral;

class UnitParser {
  constructor(
    private readonly pattern: UnitPattern,
    private readonly parseFunc: ParseUnit) {}

  parse(text: string): Amount | null {
    const arr = this.pattern.match(text);
    if (arr === null) return null;
    return this.parseFunc(...arr);
  }

  toString() {
    return `${this.pattern}`;
  }
}

class UnitPattern {
  private static readonly UPPER = /[A-Z]+/img;
  private static readonly DIGIT = /[0-9]/img;
  private readonly regex: RegExp;

  constructor(private readonly pattern: UnitPatternElement[]) {
    const parts: string[] = ['^'];
    let index = 0;
    for (const item of pattern) {
      if (unwrap(item).match(UnitPattern.DIGIT)) {
        parts.push(`(?<i${index++}>([0-9]+([.][0-9]*)?)|([.][0-9]+))`);
      } else {
        parts.push(unwrap(item as UnitPatternLiteral));
      }
    }
    parts.push('$');
    this.regex = new RegExp(parts.join(''), 'i');
  }

  match(text: string): number[] | null {
    const sanitized = text.replace(/[ ,\t\n]+/img, ''); 
    const match = this.regex.exec(sanitized);
    if (!match || typeof match.groups === 'undefined') return null;
    const map = new Map<string, number>();
    const results: number[] = [];
    for (const el of this.pattern) {
      if (unwrap(el).match(UnitPattern.DIGIT)) {
        const name = unwrap(el as UnitPatternNumeric);
        const value = match.groups[`i${results.length}`];
        results.push(parseFloat(value));
      }
    }
    return results;
  }

  static parse(text: string): UnitPattern {
    const sanitized = text.replace(WHITESPACE_PATTERN, '');
    const pattern: UnitPatternElement[] = [];

    let inNumeric = false;
    let inLiteral = false;
    let start = 0;
    for (let i = 0; i < sanitized.length; i++) {
      const c = sanitized.charAt(i);
      if (UnitPattern.DIGIT.test(c)) {
        if (inLiteral) {
          pattern.push(UnitPatternLiteral(sanitized.substring(start, i)));
          inLiteral = false;
        }
        if (!inNumeric) {
          inNumeric = true;
          start = i;
        }
      } else {
        if (inNumeric) {
          pattern.push(UnitPatternNumeric(sanitized.substring(start, i)));
          inNumeric = false;
        }
        if (!inLiteral) {
          start = i;
          inLiteral = true;
        }
      }
    }
    if (inLiteral) pattern.push(UnitPatternLiteral(sanitized.substring(start)));
    if (inNumeric) pattern.push(UnitPatternNumeric(sanitized.substring(start)));

    return new UnitPattern(pattern);
  }

  toString() {
    return this.pattern.map(x => x.toString()).join('');
  }
}

class Unit {
  private readonly parsers: UnitParser[] = [];
  private _format: FormatUnit | null = null;

  constructor(
    public readonly name: string,
    public readonly abbrev: string,
  ) {
    for (const suffix of [this.abbrev, this.name, `${this.name}s`]) {
      this.parsers.push(new UnitParser(
        UnitPattern.parse(`0${suffix}`),
        (x: number) => new Amount(x, this.name),
      ));
    }
  }

  addParser(pattern: string, parseFunc: ParseUnit): Unit {
    this.parsers.push(new UnitParser(UnitPattern.parse(pattern), parseFunc));
    return this;
  }

  setFormat(formatter: FormatUnit): Unit {
    this._format = formatter;
    return this;
  }

  matches(text: string) {
    return this.parsers.some(p => !!p.parse(text));
  }

  parse(text: string): Amount | null {
    for (const parser of this.parsers) {
      const a = parser.parse(text);
      if (a !== null) return a;
    }
    return null;
  }

  format(amount: Amount): string {
    if (amount.unit !== this.name) {
      throw new Error(`Cannot format ${JSON.stringify(amount)} with ${this.name}`);
    }
    if (this._format !== null) {
      return this._format(amount);
    }
    return `${prettyNum(amount.value)} ${this.abbrev}`;
  }

  toString() {
    return `${this.name} (${this.abbrev}): ${this.parsers.map(p => p.toString()).join(', ')}`;
  }
}

interface UnitConversion {
  srcUnit: string;
  dstUnit: string;
  srcLo: number;
  srcHi: number;
  dstLo: number;
  dstHi: number;
}

class UnitConversions {
  // for conversion between units that are equal when the value
  // amount is 0 (true for things like feet to meters, false for
  // things like kelvin to celsius).
  static scaling(srcUnit: string, dstUnit: string, scaleFactor: number): UnitConversion {
    return {
      srcUnit,
      dstUnit,
      srcLo: 0,
      srcHi: 1,
      dstLo: 0,
      dstHi: scaleFactor,
    };
  }

  static invert(c: UnitConversion): UnitConversion {
    return {
      srcUnit: c.dstUnit,
      dstUnit: c.srcUnit,
      srcLo: c.dstLo,
      srcHi: c.dstHi,
      dstLo: c.srcLo,
      dstHi: c.srcHi,
    };
  }

  static apply(amount: Amount, c: UnitConversion): Amount {
    if (c.srcUnit !== amount.unit) {
      throw new Error(`Cannot use unit conversion from ${c.srcUnit}->${c.dstUnit} for ${amount.unit}!`);
    }
    const s = 1.0 * (amount.value - c.srcLo) / (c.srcHi - c.srcLo);
    return new Amount(
      lerp(s, c.dstLo, c.dstHi),
      c.dstUnit,
    );
  }
}

class Units {
  public static readonly distance = new Units();

  private readonly conversions: Map<string, UnitConversion[]> = new Map();
  private readonly units: Map<string, Unit> = new Map();
  private readonly aliases: Map<string, string> = new Map();

  constructor() {
    this.add(new Unit('unitless', ''));
  }

  add(x: Unit | UnitConversion): Units {
    if (x instanceof Unit) {
      this.addUnit(x as Unit);
    } else {
      this.addConversion(x as UnitConversion);
    }
    return this; // for chaining
  }

  get(unit: string): Unit | undefined {
    return this.units.get(this.aliases.get(unit) || unit);
  }

  parse(text: string): Amount | null {
    for (const unit of this.units.values()) {
      const a = unit.parse(text);
      if (a !== null) return a;
    }
    return null;
  }

  getUnits(): Unit[] {
    return Array.from(this.units.values());
  }

  private addUnit(u: Unit) {
    this.units.set(u.name, u);
    this.aliases.set(u.abbrev, u.name);
    this.aliases.set(`${u.name}s`, u.name);
  }

  private addConversion(c: UnitConversion) {
    const srcUnit = this.get(c.srcUnit);
    const dstUnit = this.get(c.dstUnit);
    if (!srcUnit) throw new Error(`Unknown unit ${c.srcUnit}`);
    if (!dstUnit) throw new Error(`Unknown unit ${c.dstUnit}`);
    // normalize
    const src = srcUnit.name;
    const dst = dstUnit.name;
    if (src !== c.srcUnit || dst !== c.dstUnit) {
      this.addConversion({
        ...c,
        srcUnit: src,
        dstUnit: dst,
      });
      return;
    }
    if (!this.conversions.has(c.srcUnit)) {
      this.conversions.set(c.srcUnit, []);
    }
    if (!this.conversions.has(c.dstUnit)) {
      this.conversions.set(c.dstUnit, []);
    }
    this.conversions.get(c.srcUnit)!.push(c);
    this.conversions.get(c.dstUnit)!.push(UnitConversions.invert(c));
  }

  convert(amount: Amount, targetUnit: string): Amount | null {
    if (!this.units.has(amount.unit)) {
      throw new Error(`Amount is in an unknown unit: ${JSON.stringify(amount)}.`);
    }
    if (!this.units.has(targetUnit)) {
      throw new Error(`Cannot convert ${JSON.stringify(amount)} to unknown unit ${targetUnit}`);
    }
    const canonicalTarget = this.aliases.get(targetUnit) || targetUnit;
    // do a cute lil' BFS to try to convert the given amount
    // to the target unit.
    interface Node {
      unit: string,
      conversions: UnitConversion[],
    };
    const frontier: Node[] = [
      { unit: amount.unit, conversions: [] }
    ];
    const visited = new Set<string>();
    while (frontier.length > 0) {
      const [ node ] = frontier.splice(0, 1);

      if (visited.has(node.unit)) {
        continue;
      }
      visited.add(node.unit);

      if (node.unit === canonicalTarget) {
        let a = amount;
        for (const c of node.conversions) {
          a = UnitConversions.apply(a, c);
        }
        return a;
      }

      const neighbors = this.conversions.get(node.unit);
      if (typeof neighbors === 'undefined') {
        continue;
      }

      for (const c of neighbors) {
        if (visited.has(c.dstUnit)) {
          continue;
        }
        frontier.push({
          unit: c.dstUnit,
          conversions: [...node.conversions, c],
        });
      }
    }
    return null; 
  }

  format(amount: Amount) {
    if (!this.units.has(amount.unit)) {
      return `${amount.value} ${amount.unit}`;
    }
    return this.units.get(amount.unit)!.format(amount);
  }
}

Units.distance
  .add(new Unit('meter', 'm'))
  .add(new Unit('centimeter', 'cm'))
  .add(new Unit('millimeter', 'mm'))
  .add(new Unit('micrometer', 'μm'))
  .add(new Unit('nanometer', 'nm'))
  .add(new Unit('kilometer', 'km'))
  .add(new Unit('feet', 'ft')
    .addParser('1 foot', x => new Amount(x, 'feet'))
    .addParser('0\'', x => new Amount(x, 'feet'))
    .addParser('0\'0\"', (feet, inches) => new Amount(feet + inches / 12.0, 'feet'))
    .setFormat(amount => {
      const feet = Math.floor(amount.value);
      const inches = 12.0 * (amount.value - feet);
      if (inches < 0.001) {
        return `${prettyNum(feet)}'`;
      }
      return `${prettyNum(feet)}'${prettyNum(inches)}"`;
    }))
  .add(new Unit('inch', 'in')
    .addParser('0\"', x => new Amount(x, 'inch'))
    .setFormat(amount => `${prettyNum(amount.value)}"`))
  .add(new Unit('yard', 'y'))
  .add(new Unit('mile', 'mi'))
  .add(new Unit('light-year', 'ly'))
  .add(new Unit('furlong', 'fur'))
  .add(new Unit('pixel', 'px'))
  .add(UnitConversions.scaling('km', 'm', 1e3))
  .add(UnitConversions.scaling('m', 'cm', 1e2))
  .add(UnitConversions.scaling('m', 'mm', 1e3))
  .add(UnitConversions.scaling('m', 'μm', 1e6))
  .add(UnitConversions.scaling('m', 'nm', 1e9))
  .add(UnitConversions.scaling('ft', 'in', 12))
  .add(UnitConversions.scaling('yard', 'ft', 3))
  .add(UnitConversions.scaling('mile', 'feet', 5280))
  .add(UnitConversions.scaling('mile', 'furlong', 8))
  .add(UnitConversions.scaling('in', 'mm', 25.4))
  .add(UnitConversions.scaling('ly', 'km', 9.46e+12))
  .add(UnitConversions.scaling('in', 'px', 96))
;

for (const u of Units.distance.getUnits()) {
  console.log(`${u}`, u);
}

[
  '12.2m',
  '0.3',
  '6cm',
  '7 meters',
  '1 centimeter',
  '9 km',
  "2'",
  '10ft',
  '3"',
  `5'6"`,
  '2 yards',
  '1 foot',
  '0.1 miles',
  '0.5 light-years',
  '0.1 furlong',
  '100000 furlong',
  '1,000 micrometers',
  '100,000,000 nanometers',
  '100 px',
].forEach(a => {
  const amount = Units.distance.parse(a);
  const meters = amount ? Units.distance.convert(amount, 'meter') : null; 
  console.log(`
    text: ${a}
    amount: ${amount ? Units.distance.format(amount) : '?'}
    meters: ${meters ? Units.distance.format(meters) : '?'}
  `.split('\n').map(s => s.trim()).filter(x=>x).join('\n'));
});

