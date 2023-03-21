// ui controls like buttons n stuff

class ElementWrap<E extends HTMLElement> {
  constructor(readonly element: E) {
  }

  get classes(): Set<string> {
    const name = this.element.getAttribute('class');
    if (!name) return new Set();
    return new Set(name.trim().split(/[ ]+/));
  }

  set classes(names: Set<string>) {
    this.element.setAttribute('class', Array.from(names).join(' '));
  }

  addClass(name: string) {
    const set = this.classes;
    if (set.has(name)) return;
    set.add(name);
    this.classes = set;
  }

  removeClass(name: string) {
    const set = this.classes;
    if (!set.has(name)) return;
    set.delete(name);
    this.classes = set;
  }

  set tooltip(text: string) {
    this.element.setAttribute('title', text);
  }

  set disabled(disabled: boolean) {
    if (disabled) {
      this.addClass('disabled');
    } else {
      this.removeClass('disabled');
    }
  }

  onClick(listener: () => void) {
    this.element.addEventListener('click', () => {
      if (this.classes.has('disabled')) return;
      listener();
    });
  }
}

class IconButton extends ElementWrap<HTMLElement> {
  constructor(private readonly name: string, icon?: URL | null) {
    super(document.createElement('a'));
    this.element.setAttribute('href', '#');
    this.tooltip = name;
    this.classes = new Set(['tool-button', 'icon-button']);

    if (icon) {
      this.icon = icon;
    } else {
      this.element.innerHTML = name.substring(0, 1).toLocaleUpperCase();
    }
  }

  onClick(listener: () => void) {
    this.element.addEventListener('click', () => listener());
  }

  set selected(selected: boolean) {
    if (selected) {
      this.addClass('selected');
    } else {
      this.removeClass('selected');
    }
  }

  set icon(url: URL) {
    this.element.style.backgroundImage = `url('${url}')`;
    this.element.innerHTML = '';
  }
}

type FlowOrientation = 'row' | 'column';
type FlexAlign = 'flex-start' | 'center' | 'flex-end' | 'stretch';

interface Resetable {
  reset: () => void;
}

class MiniForm extends ElementWrap<HTMLElement> implements Resetable {
  private _layout: FlowOrientation = 'row';
  private readonly children = new Set<Resetable>();

  constructor(element?: HTMLElement) {
    super(element || document.createElement('div'));
    this.addClass('mini-form');
    this.layout = 'row';
    this.horizontalAlign = 'flex-start';
    this.verticalAlign = 'center';
  }

  set layout(direction: FlowOrientation) {
    if (direction === this._layout) return;
    this._layout = direction;
    this.element.style.flexDirection = direction;
  }

  get layout(): FlowOrientation {
    return this._layout;
  }

  set horizontalAlign(align: FlexAlign) {
    if (this.layout === 'row') {
      this.element.style.justifyContent = align;
    } else {
      this.element.style.alignItems = align;
    }
  }

  set verticalAlign(align: FlexAlign) {
    if (this.layout === 'column') {
      this.element.style.justifyContent = align;
    } else {
      this.element.style.alignItems = align;
    }
  }

  reset() {
    this.children.forEach(c => c.reset());
  }

  clear() {
    this.element.innerHTML = '';
    this.children.clear();
  }

  append<E extends HTMLElement>(e: ElementWrap<E> | Resetable) {
    if ('reset' in e && typeof e.reset === 'function') {
      this.children.add(e as unknown as Resetable);
    }
    if ('element' in e) {
      this.element.appendChild(e.element);
    }
  }
  
  appendSpacer() {
    const spacer = document.createElement('div');
    spacer.setAttribute('class', 'spacer');
    this.element.appendChild(spacer);
  }

  appendRuler() {
    const ruler = document.createElement('div');
    ruler.setAttribute('class', this.layout === 'row' ? 'h-ruler' : 'v-ruler');
    this.element.appendChild(ruler);
  }

  appendLabeled(text: string, e: MiniFormInput<any, any>) {
    const label = new MiniLabel(text.toLocaleUpperCase());
    label.addClass('over-label');

    const column = new MiniForm();
    column.layout = 'column';

    column.append(label);
    column.append(e);

    this.append(column);
  }
}

class MiniLabel extends ElementWrap<HTMLElement> {
  constructor(text: string) {
    super(document.createElement('label'));
    this.text = text;
  }

  set text(text: string) {
    this.element.innerHTML = text;
  }
}

interface InputParseValue<V> { value: V; };
interface InputParseError { error: string; };
type InputParse<V> = InputParseValue<V> | InputParseError;

abstract class MiniFormInput<V, E extends HTMLElement> extends ElementWrap<E> implements Resetable {
  private readonly changeListeners = new Set<(value: V) => void>();

  constructor(
    element: E, 
    private readonly getDefaultValue: () => V) {
    super(element);
    this.addClass('mini-form-input');
    this.setRawValue(this.format(this.defaultValue));
    this.bindChangeListener(() => {
      const value = this.getValue();
      for (const item of this.changeListeners) {
        item(value);
      }
      const formatted = this.format(value);
      if (formatted !== this.getRawValue()) {
        this.setRawValue(formatted);
      }
    });
  }

  get defaultValue(): V {
    return this.getDefaultValue();
  }

  public onChange(listener: (value: V) => void) {
     this.changeListeners.add(listener);
  }

  public getValue(): V {
    const parse = this.parse(`${this.getRawValue()}`);
    if ('error' in parse) {
      this.tooltip = parse.error;
      this.addClass('error');
      return this.defaultValue;
    }
    this.tooltip = '';
    this.removeClass('error');
    return parse.value;
  }

  public reset() {
    this.setValue(this.defaultValue);
  }

  public setValue(value: V): void {
    this.setRawValue(this.format(value));
  }

  protected format(value: V): string {
    return `${value}`;
  }

  protected bindChangeListener(handle: () => void) {
    this.element.addEventListener('change', () => handle());
  }

  protected abstract getRawValue(): string | number;

  protected abstract setRawValue(value: string): void;

  protected abstract parse(input: string): InputParse<V>;
}

class DistanceInput extends MiniFormInput<Distance, HTMLInputElement> {
  public minValue: Distance | null = Distance(0, 'model');
  public maxValue: Distance | null = null;

  constructor(defaultValue: () => Distance = () => Distance(0, 'model')) {
    super(document.createElement('input') as HTMLInputElement, defaultValue);
    this.addClass('distance');
    this.element.setAttribute('type', 'text');
    this.element.setAttribute('size', '8');
  }

  protected override getRawValue(): string {
    return this.element.value;
  }

  protected override setRawValue(value: string): void {
    this.element.value = value;
  }

  protected override format(value: Distance): string {
    const mu = App.project.modelUnit;
    return mu.format(mu.newAmount(value.get('model')));
  }

  protected override parse(input: string): InputParse<Distance> {
    const amount = Units.distance.parse(input.trim());
    if (amount === null) {
      return { error: `Could not parse '${input}'` };
    }
    const distance = Distance(App.project.modelUnit.from(amount).value, 'model');
    const min = this.minValue;
    const max = this.maxValue;
    if (min !== null && distance.lt(min)) return { value: min };
    if (max !== null && distance.gt(max)) return { value: max };
    return { value: distance };
  }
}

class AmountInput extends MiniFormInput<Amount, HTMLInputElement> {
  public minValue: Amount | null = null;
  public maxValue: Amount | null = null;

  constructor(defaultValue: () => Amount) {
    super(document.createElement('input') as HTMLInputElement, defaultValue);
    this.addClass('amount');
    this.element.setAttribute('type', 'text');
    this.element.setAttribute('size', '8');
  }

  protected override getRawValue(): string {
    return this.element.value;
  }

  protected override setRawValue(value: string): void {
    this.element.value = value;
  }

  protected override format(value: Amount): string {
    return Units.distance.format(value);
  }

  protected override parse(input: string): InputParse<Amount> {
    const raw: Amount | null = Units.distance.parse(input.trim());
    if (raw === null) {
      return { error: `Could not parse '${input}'` };
    }

    const amount: Amount = raw.unit === UNITLESS
      ? App.project.modelUnit.newAmount(raw.value)
      : raw;
    const au = Units.distance.get(amount.unit)!;
    const min = this.minValue;
    const max = this.maxValue;
    if (min !== null && amount.value < au.from(min).value) return { value: min };
    if (max !== null && amount.value > au.from(max).value) return { value: max };
    return { value: amount };
  }
}

class AngleInput extends MiniFormInput<Angle, HTMLInputElement> {
  public minValue: Angle | null = null;
  public maxValue: Angle | null = null;

  constructor(defaultValue: () => Angle = () => Angle(Radians(0), 'model')) {
    super(document.createElement('input') as HTMLInputElement, defaultValue);
    this.element.setAttribute('type', 'number');
    this.element.setAttribute('size', '6');
  }

  protected override getRawValue(): string {
    return this.element.value;
  }

  protected override setRawValue(value: string): void {
    this.element.value = value;
  }

  protected override format(value: Angle): string {
    const radians = value.get('model');
    const degrees = toDegrees(radians);
    return `${unwrap(degrees)}`;
  }

  protected override parse(input: string): InputParse<Angle> {
    const degrees = parseFloat(input.trim());
    if (isNaN(degrees)) {
      return { 'error': `cannot parse '${input}' as a number.` };
    }
    const radians = toRadians(Degrees(degrees));
    const angle = Angle(radians, 'model');

    const min = this.minValue;
    const max = this.maxValue;
    if (min !== null && angle.lt(min)) return { value: min };
    if (max !== null && angle.gt(max)) return { value: max };

    return { value: angle };
  }
}

class ToggleButton extends IconButton {
  private readonly listeners = new Array<(on: boolean) => void>();
  private _status: boolean = false;

  constructor(name: string, icon?: URL | null) {
    super(name, icon);
    this.addClass('toggle-button');
    this.onClick(() => this.toggle());
  }

  onToggle(listener: (on: boolean) => void) {
    this.listeners.push(listener);
  }

  get toggled() {
    return this._status;
  }

  toggle() {
    this.setToggled(!this._status);
  }

  setToggled(on: boolean) {
    if (on === this._status) return;
    this._status = on;
    if (on) {
      this.addClass('selected');
    } else {
      this.removeClass('selected');
    }
    this.listeners.forEach(listener => listener(on));
  }
}

