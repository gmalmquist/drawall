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
  if (integer.indexOf('e') >= 0) {
    return num.toString(); // its so big we're using scientific notation
  }
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
        parts.push(`(?<i${index++}>([-]?)([0-9]+([.][0-9]*)?)|([.][0-9]+))`);
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
  private readonly aliases = new Set<string>();
  private readonly parsers: UnitParser[] = [];
  private _format: FormatUnit | null = null;

  constructor(
    public readonly name: string,
    public readonly abbrev: string,
  ) {
    for (const alias of [this.abbrev, this.name, `${this.name}s`]) {
      this.addAlias(alias);
    }
  }

  addAlias(alias: string): Unit {
    if (this.aliases.has(alias)) {
      return this;
    }
    this.aliases.add(alias);
    this.parsers.push(new UnitParser(
      UnitPattern.parse(`0${alias}`),
      (x: number) => new Amount(x, this.name),
    ));
    return this;
  }

  addParser(pattern: string, parseFunc: ParseUnit): Unit {
    this.parsers.push(new UnitParser(UnitPattern.parse(pattern), parseFunc));
    return this;
  }

  getAliases(): string[] {
    return Array.from(this.aliases);
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
    for (const alias of u.getAliases()) {
      if (this.aliases.has(alias)) {
        throw new Error(
          `Cannot add alias ${alias}->${u.name}, as it would collid with ${this.aliases.get(alias)}`
        );
      }
      this.aliases.set(alias, u.name);
    }
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
    const canonicalTarget = this.aliases.get(targetUnit) || targetUnit;
    if (!this.units.has(amount.unit)) {
      throw new Error(`Amount is in an unknown unit: ${JSON.stringify(amount)}.`);
    }
    if (!this.units.has(canonicalTarget)) {
      throw new Error(`Cannot convert ${JSON.stringify(amount)} to unknown unit ${canonicalTarget}`);
    }
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
  .add(new Unit('kilometer', 'km'))
  .add(new Unit('hectometer', 'hm'))
  .add(new Unit('dekameter', 'dam'))
  .add(new Unit('meter', 'm'))
  .add(new Unit('decimeter', 'dm'))
  .add(new Unit('centimeter', 'cm'))
  .add(new Unit('millimeter', 'mm'))
  .add(new Unit('micrometer', 'μm')
    .addAlias('micron')
    .addAlias('microns'))
  .add(new Unit('nanometer', 'nm'))
  .add(new Unit('femtometer', 'fm'))
  .add(new Unit('zeptometer', 'zm'))
  .add(new Unit('thou', 'mil'))
  .add(new Unit('feet', 'ft')
    .addAlias('foot')
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
  .add(new Unit('light-hour', 'lh'))
  .add(new Unit('light-minute', 'lm'))
  .add(new Unit('light-second', 'ls'))
  .add(new Unit('light-millisecond', 'lms'))
  .add(new Unit('light-microsecond', 'lμs'))
  .add(new Unit('light-nanosecond', 'lns'))
  .add(new Unit('light-femtosecond', 'lfs'))
  .add(new Unit('furlong', 'fur'))
  .add(new Unit('pixel', 'px'))
  .add(new Unit('league', 'lg'))
  .add(new Unit('fathom', 'ftm'))
  .add(new Unit('nautical mile', 'nmi'))
  .add(new Unit('chain', 'chains'))
  .add(new Unit('rod', 'rods'))
  .add(new Unit('parsec', 'pc'))
  .add(new Unit('astronomical unit', 'au'))
  .add(new Unit('smoot', 'smoot')
     .setFormat(a => a.value === 1 ? '1 smoot' : `${prettyNum(a.value)} smoots`))
  .add(new Unit('gwen', 'gwen')
     .setFormat(a => a.value === 1 ? '1 gwen' : `${prettyNum(a.value)} gwens`))
  .add(UnitConversions.scaling('km', 'm', 1e3))
  .add(UnitConversions.scaling('hm', 'm', 1e2))
  .add(UnitConversions.scaling('dam', 'm', 10))
  .add(UnitConversions.scaling('m', 'dm', 10))
  .add(UnitConversions.scaling('m', 'cm', 1e2))
  .add(UnitConversions.scaling('m', 'mm', 1e3))
  .add(UnitConversions.scaling('mm', 'μm', 1e3))
  .add(UnitConversions.scaling('μm', 'nm', 1e3))
  .add(UnitConversions.scaling('nm', 'fm', 1e6))
  .add(UnitConversions.scaling('fm', 'zm', 1e6))
  .add(UnitConversions.scaling('ft', 'in', 12))
  .add(UnitConversions.scaling('yard', 'ft', 3))
  .add(UnitConversions.scaling('mile', 'feet', 5280))
  .add(UnitConversions.scaling('mile', 'furlong', 8))
  .add(UnitConversions.scaling('in', 'mil', 1000))
  .add(UnitConversions.scaling('league', 'mi', 3))
  .add(UnitConversions.scaling('fathom', 'ft', 6))
  .add(UnitConversions.scaling('nautical mile', 'm', 1852))
  .add(UnitConversions.scaling('in', 'mm', 25.4))
  .add(UnitConversions.scaling('chain', 'yard', 22))
  .add(UnitConversions.scaling('chain', 'rod', 4))
  .add(UnitConversions.scaling('ly', 'km', 9.46e+12))
  .add(UnitConversions.scaling('parsec', 'light-year', 3.26156))
  .add(UnitConversions.scaling('in', 'px', 96))
  .add(UnitConversions.scaling('au', 'km', 1.496e8))
  .add(UnitConversions.scaling('light-year', 'light-hour', 8766))
  .add(UnitConversions.scaling('light-hour', 'light-minute', 60))
  .add(UnitConversions.scaling('light-minute', 'light-second', 60))
  .add(UnitConversions.scaling('light-second', 'light-millisecond', 1000))
  .add(UnitConversions.scaling('light-millisecond', 'light-microsecond', 1e3))
  .add(UnitConversions.scaling('light-millisecond', 'light-nanosecond', 1e6))
  .add(UnitConversions.scaling('light-nanosecond', 'light-femtosecond', 1e6))
  .add(UnitConversions.scaling('smoot', 'in', 67))
  .add(UnitConversions.scaling('gwen', 'in', 66))
;

