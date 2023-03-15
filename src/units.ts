const WHITESPACE_PATTERN = /\s+/img;

interface Amount {
  nominal: number;
  unit: string;
}

type FormatUnit = (amount: Amount) => string;
type ParseUnit = (...arr: number[]) => Amount | null;

type UnitPatternNumeric = Newtype<string, { readonly _: unique symbol; }>;
const UnitPatternNumeric = newtype<UnitPatternNumeric>();

type UnitPatternLiteral = Newtype<string, { readonly _: unique symbol; }>;
const UnitPatternLiteral = newtype<UnitPatternLiteral>();

type UnitPatternElement = UnitPatternNumeric | UnitPatternLiteral;

class UnitPattern {
  private static readonly UPPER = /[A-Z]+/img;
  private static readonly DIGIT = /[0-9]/img;
  private readonly regex: RegExp;

  constructor(private readonly pattern: UnitPatternElement[]) {
    let index = 0;
    this.regex = new RegExp(pattern.map(item => {
      if (unwrap(item).match(UnitPattern.DIGIT)) {
        return `(?<i${index++}>([0-9]+([.][0-9]*)?)|([.][0-9]+))`;
      }
      return unwrap(item as UnitPatternLiteral);
    }).join(''), 'i');
  }

  match(text: string): number[] | null {
    const sanitized = text.replace(WHITESPACE_PATTERN, ''); 
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
    return this.regex.toString();
  }
}

class Unit {
  private readonly pattern: UnitPattern;

  constructor(
    public readonly name: string,
    public readonly abbrev: string,
    pattern: string,
    private readonly _format: FormatUnit | null = null,
    private readonly _parse: ParseUnit | null = null,
  ) {
    this.pattern = UnitPattern.parse(pattern);
  }

  matches(text: string) {
    return this.pattern.match(text) !== null;  
  }

  parse(text: string): Amount | null {
    const arr = this.pattern.match(text);
    if (arr === null) return null;
    if (this._parse !== null) {
      return this._parse(...arr);
    }
    return {
      nominal: arr[0]!,
      unit: this.name,
    };
  }

  format(amount: Amount): string {
    if (amount.unit !== this.name) {
      throw new Error(`Cannot format ${JSON.stringify(amount)} with ${this.name}`);
    }
    if (this._format !== null) {
      return this._format(amount);
    }
    return `${amount.nominal} ${this.abbrev}`;
  }

  toString() {
    return `${this.name} (${this.abbrev}): ${this.pattern}`;
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

  // for conversion between units that are equal when the nominal
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
    const s = 1.0 * (amount.nominal - c.srcLo) / (c.srcHi - c.srcLo);
    return {
      nominal: lerp(s, c.dstLo, c.dstHi),
      unit: c.dstUnit,
    };
  }
}

class Units {
  public static readonly distance = new Units();

  private readonly conversions: Map<string, UnitConversion[]> = new Map();
  private readonly units: Map<string, Unit> = new Map();

  constructor() {}

  add(x: Unit | UnitConversion) {
    if (x instanceof Unit) {
      this.addUnit(x as Unit);
    } else {
      this.addConversion(x as UnitConversion);
    }
  }

  get(unit: string): Unit | undefined {
    return this.units.get(unit);
  }

  private addUnit(u: Unit) {
    this.units.set(u.name, u);
  }

  private addConversion(c: UnitConversion) {
    if (!this.units.has(c.srcUnit)) throw new Error(`Unknown unit ${c.srcUnit}`);
    if (!this.units.has(c.dstUnit)) throw new Error(`Unknown unit ${c.dstUnit}`);
    if (!this.conversions.has(c.srcUnit)) {
      this.conversions.set(c.srcUnit, []);
    }
    if (!this.conversions.has(c.dstUnit)) {
      this.conversions.set(c.dstUnit, []);
    }
    this.conversions.get(c.srcUnit)!.push(c);
    this.conversions.get(c.dstUnit)!.push(UnitConversions.invert(c));
  }

  convert(amount: Amount, unit: string) {
  }

}

Units.distance.add(new Unit('meter', 'm', '0m'));

[
  'meter',
].map(u => Units.distance.get(u)).forEach(u => {
  console.log(`${u}`, u);
});
