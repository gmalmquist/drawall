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
  constructor(private readonly name: string, icon: URL | null = null) {
    super(document.createElement('a'));
    this.element.setAttribute('href', '#');
    this.tooltip = name;
    this.classes = new Set(['tool-button', 'icon-button']);
    this.icon = icon;
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

  set icon(url: URL | null) {
    if (url === null) {
      this.element.style.backgroundImage = '';
      this.element.innerHTML = this.name.substring(0, 1).toLocaleUpperCase();
      return;
    }
    this.element.style.backgroundImage = `url('${url}')`;
    this.element.innerHTML = '';
  }
}

type AutoFieldListener = (field: AutoField) => void;

interface AutoFieldUi<T> {
  element: ElementWrap<HTMLElement>,
  setValue: (value: T) => void;
}

interface AutoFieldHandle<V> {
  getValue: () => V;
  setValue: (v: V) => void;
}

type AutoFieldValue<A extends AutoField> = [A] extends [{ value: infer V }] ? V : never;

class AutoForm {
  private static rulerCount: number = 0;
  private readonly listeners = new Set<AutoFieldListener>();
  private readonly fields = new Array<AutoField>();
  private readonly byId = new Map<string, AutoField>();
  private readonly uiMap = new Map<string, AutoFieldUi<any>>();
  private parent: AutoForm | null = null;

  constructor() {
  }

  addFieldListener(listener: AutoFieldListener) {
    this.listeners.add(listener);
  }

  has(field: { name: string, kind: Kinds<AutoField> }): boolean {
    return this.byId.has(AutoForm.fieldId(field));
  }

  addSeparator() {
    this.add({ name: `${AutoForm.rulerCount++}`, kind: 'separator', value: 'separator' });
  }

  add<A extends AutoField>(field: A): AutoFieldHandle<AutoFieldValue<A>> {
    if (field.kind === 'separator'
      && this.fields.length > 0
      && this.fields[this.fields.length - 1].kind === 'separator') {
      return { getValue: () => 'separator', setValue: (_) => {} } as AutoFieldHandle<AutoFieldValue<A>>;
    }
    const id = AutoForm.fieldId(field);
    const handle: AutoFieldHandle<AutoFieldValue<A>> = {
      setValue: (value: AutoFieldValue<A>) => this.setField({ ...field, value } as A),
      getValue: () => this.byId.get(id)!.value as AutoFieldValue<A>,
    };
    if (this.byId.has(id)) {
      return handle; 
    }
    this.byId.set(id, field);
    this.fields.push(field);
    return handle;
  }

  setField(field: AutoField): boolean {
    if (!this.has(field)) {
      return false;
    }
    if (!this.updateField(field)) {
      return false;
    }
    const input = this.uiMap.get(AutoForm.fieldId(field));
    if (typeof input !== 'undefined') {
      input.setValue(field.value);
    }
    if (this.parent !== null) {
      this.parent.setField(field);
    }
    return true;
  }

  public inflate(into?: MiniForm): MiniForm {
    const form = into || new MiniForm();
    form.verticalAlign = 'stretch';
    for (const field of this.fields) {
      const inflated = this.inflateField(field);
      this.uiMap.set(AutoForm.fieldId(field), inflated);
      if (field.label) {
        form.appendLabeled(field.label, inflated.element);
      } else {
        form.append(inflated.element);
      }
    }
    return form;
  }

  private updateField(field: AutoField): boolean {
    const id = AutoForm.fieldId(field);
    if (!this.byId.has(id)) return false;
    const previous = this.byId.get(id)!;
    if (AutoForm.compareValues(field, previous)) {
      return false;
    }
    this.byId.set(id, field);
    for (let i = 0; i < this.fields.length; i++) {
      if (AutoForm.fieldId(this.fields[i]) === id) {
        this.fields[i] = field;
        break;
      }
    }
    this.fireValueChange(field);
    return true;
  }

  private fireValueChange(field: AutoField) {
    this.listeners.forEach(listener => listener(field));
  }

  private forward(other: AutoForm) {
    this.addFieldListener(f => other.setField(f));
    other.parent = this;
  }

  private inflateField(field: AutoField): AutoFieldUi<any> {
    if (field.kind === 'amount') {
      const input = new AmountInput(() => field.value);
      input.minValue = typeof field.min !== 'undefined' ? field.min : null;
      input.maxValue = typeof field.max !== 'undefined' ? field.max : null;
      input.onChange(value => {
        const f = { ...field, value };
        this.setField(f);
      });
      return {
        element: input,
        setValue: v => input.setValue(v),
      };
    }
    if (field.kind === 'toggle') {
      const input = new ToggleButton(field.name, field.icons);
      input.setToggled(field.value);
      input.onToggle(value => {
        const f = { ...field, value };
        this.setField(f);
      });
      return {
        element: input,
        setValue: v => input.setToggled(v),
      };
    }
    if (field.kind === 'slider') {
      const input = new SliderInput(() => field.value, field.min, field.max);
      input.onChange(value => {
        const f = { ...field, value };
        this.setField(f);
      });
      return {
        element: input,
        setValue: v => input.setValue(v),
      };
    }
    if (field.kind === 'angle') {
      const input = new AngleInput(() => field.value);
      input.onChange(value => {
        const f = { ...field, value };
        this.setField(f);
      });
      return {
        element: input,
        setValue: v => input.setValue(v),
      };
    }
    if (field.kind === 'separator') {
      return {
        element: new Separator(true),
        setValue: (_) => {},
      };
    }
    if (field.kind === 'number') {
      const input = new NumberInput(
        () => field.value,
        typeof field.min !== 'undefined' ? field.min : null,
        typeof field.max !== 'undefined' ? field.max : null,
      );
      input.onChange(value => {
        const f = { ...field, value };
        this.setField(f);
      });
      return {
        element: input,
        setValue: v => input.setValue(v),
      };
    }
    if (field.kind === 'button') {
      const input = new IconButton(field.name, field.icon);
      input.onClick(field.onClick);
      return {
        element: input,
        setValue: (_) => {},
      };
    }
    return impossible(field);
  }

  public static compareValues(one: AutoField, two: AutoField): boolean {
    if (one.kind !== two.kind) return false;
    const coerce = <A extends AutoField, B extends AutoField>(
      one: A, two: B): readonly [A, A] => {
      if (one.kind !== two.kind) throw new Error('unreachable');
      return [one, two as unknown as A];
    };

    if (one.kind === 'number' || one.kind === 'toggle' || one.kind === 'slider') {
      return one.value === two.value;
    }
    if (one.kind === 'amount') {
      const [a, b] = coerce(one, two);
      return a.value === b.value && a.unit === b.unit;
    }
    if (one.kind === 'angle') {
      const [a, b] = coerce(one, two);
      return a.value.get('model') === b.value.get('model');
    }
    if (one.kind === 'separator' || one.kind === 'button') {
      return true;
    }
    return impossible(one);
  }

  public static intersection(forms: AutoForm[]): AutoForm {
    if (forms.length === 0) return new AutoForm();
    if (forms.length === 1) return forms[0];
    const [first, ...remainder] = forms;
    const included = new Set<string>(first.fields.map(AutoForm.fieldId));
    for (const form of remainder) {
      const check = Array.from(included);
      for (const field of check) {
        if (!form.byId.has(field)) {
          included.delete(field);
        }
      }
      if (included.size === 0) break;
    }
    const result = new AutoForm();
    for (const field of first.fields) {
      if (included.has(AutoForm.fieldId(field))) {
        result.add(field);
      }
    }
    for (const form of forms) {
      result.forward(form);
    }
    return result;
  }

  public static union(forms: AutoForm[]): AutoForm {
    const result = new AutoForm();
    for (const form of forms) {
      if (result.fields.length > 0) {
        result.addSeparator();
      }
      for (const field of form.fields) {
        result.add(field);
      }
      result.forward(form);
    }
    return result;
  }

  public static fieldId(field: { name: string, kind: Kinds<AutoField> }): string {
    return `${field.kind}:${field.name}`;
  }
}

type AutoField = AutoFieldNumber 
  | AutoFieldAmount 
  | AutoFieldToggle
  | AutoFieldSlider
  | AutoFieldAngle
  | AutoFieldSeparator
  | AutoFieldButton
;

interface AutoFieldBase<V> {
  name: string;
  label?: string;
  value: V;
}

interface AutoFieldNumber extends AutoFieldBase<number> {
  kind: 'number';
  min?: number;
  max?: number;
}

interface AutoFieldSlider extends AutoFieldBase<number> {
  kind: 'slider';
  min: number;
  max: number;
}

interface AutoFieldAngle extends AutoFieldBase<Angle> {
  kind: 'angle';
  value: Angle;
}

interface AutoFieldAmount extends AutoFieldBase<Amount> {
  kind: 'amount';
  unit: Units;
  min?: Amount;
  max?: Amount;
}

interface AutoFieldToggle extends AutoFieldBase<boolean> {
  kind: 'toggle';
  icons?: ToggleIcons;
}

interface AutoFieldSeparator extends AutoFieldBase<'separator'> {
  kind: 'separator',
}

interface AutoFieldButton extends AutoFieldBase<'button'> {
  kind: 'button';
  icon?: URL | null;
  onClick: () => void;
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

  appendLabeled(text: string, e: ElementWrap<HTMLElement> | Resetable) {
    const label = new MiniLabel(text.toLocaleUpperCase());
    label.addClass('over-label');

    const column = new MiniForm();
    column.layout = 'column';

    column.append(label);
    column.append(e);

    this.append(column);
  }
}

class Separator extends ElementWrap<HTMLElement> {
  constructor(horizontal: boolean) {
    super(document.createElement('div'));
    this.addClass(horizontal ? 'h-ruler' : 'v-ruler');
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

class SliderInput extends MiniFormInput<number, HTMLInputElement> {
  private static readonly RESOLUTION = 10000;

  constructor(
    defaultValue: () => number,
    public minValue: number,
    public maxValue: number) {
    super(document.createElement('input') as HTMLInputElement, defaultValue);
    this.addClass('mini-slider');
    this.element.setAttribute('type', 'range');
    this.element.setAttribute('min', '0');
    this.element.setAttribute('max', `${SliderInput.RESOLUTION}`);
    this.setValue(defaultValue());
  }

  protected override getRawValue(): string {
    return this.element.value;
  }

  protected override setRawValue(value: string): void {
    this.element.value = value;
  }

  protected override format(value: number): string {
    const min = this.minValue;
    const max = this.maxValue;
    const v = lerp((1.0 * value - min) / (max - min), 0, SliderInput.RESOLUTION);
    return `${v}`;
  }

  protected override parse(input: string): InputParse<number> {
    const amount = parseFloat(input); 
    if (amount === null) {
      return { error: `Could not parse '${input}'` };
    }
    return { value: lerp(amount / SliderInput.RESOLUTION, this.minValue, this.maxValue) };
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
    this.element.setAttribute('type', 'text');
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
    return `${Math.round(unwrap(degrees)*10)/10.}°`;
  }

  protected override parse(input: string): InputParse<Angle> {
    const degrees = parseFloat(input.trim().replace(/°/g, ''));
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

class NumberInput extends MiniFormInput<number, HTMLInputElement> {
  constructor(
    defaultValue: () => number,
    private readonly minValue: number | null = null,
    private readonly maxValue: number | null = null,
  ) {
    super(document.createElement('input') as HTMLInputElement, defaultValue);
    this.element.setAttribute('type', 'number');
    this.element.setAttribute('size', '6');
    if (minValue !== null) {
      this.element.setAttribute('min', minValue.toString());
    }
    if (maxValue !== null) {
      this.element.setAttribute('max', maxValue.toString());
    }
  }

  protected override getRawValue(): string {
    return this.element.value;
  }

  protected override setRawValue(value: string): void {
    this.element.value = value;
  }

  protected override format(value: number): string {
    return `${value}`;
  }

  protected override parse(input: string): InputParse<number> {
    const value = parseFloat(input.trim());
    if (isNaN(value)) {
      return { 'error': `cannot parse '${input}' as a number.` };
    }
    const [min, max] = [this.minValue, this.maxValue];
    if (min !== null && value < min) return { value: min };
    if (max !== null && value > max) return { value: max };
    return { value };
  }
}

interface ToggleIcons {
  on: URL | null,
  off: URL | null,
}

class ToggleButton extends IconButton {
  private readonly listeners = new Array<(on: boolean) => void>();
  private _status: boolean = false;

  constructor(
    name: string,
    private readonly icons?: ToggleIcons,
  ) {
    super(name, icons?.off);
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
      this.icon = this.icons?.on || null;
    } else {
      this.removeClass('selected');
      this.icon = this.icons?.off || null;
    }
    this.listeners.forEach(listener => listener(on));
  }
}

