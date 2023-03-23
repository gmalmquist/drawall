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

  setEnabled(enabled: boolean) {
    if (enabled) {
      this.removeClass('disabled');
    } else {
      this.addClass('disabled');
    }
  }

  set tooltip(text: string) {
    this.element.setAttribute('title', text);
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
    this.classes = new Set(['icon-button']);
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
      this.element.innerHTML = this.name.charAt(0).toLocaleUpperCase()
        + this.name.charAt(1).toLocaleLowerCase();
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
  clear: () => void;
  setEnabled: (enabled: boolean) => void;
}

interface AutoFieldHandle<V> {
  readonly value: Ref<V>;
  readonly enabled: Ref<boolean>;
}

type AutoFieldId = Pick<AutoField, 'name' | 'kind'>;

type AutoFieldValue<A extends AutoField> = [A] extends [{ value: infer V }] ? V : never;

// type puns type puns
type Amoral<V> = Exclude<V, 'value'>;


class AutoForm {
  private static rulerCount: number = 0;
  private readonly fields = new Array<AutoField>();
  private readonly fieldDefs = new Map<string, Amoral<AutoField>>();
  private readonly uiMap = new Map<string, AutoFieldUi<any>>();
  private readonly handles = new DefaultMap<string, Set<AutoFieldHandle<any>>>(() => new Set());
  private readonly downstream = new Set<AutoForm>();

  constructor() {
  }

  has(field: AutoFieldId): boolean {
    return this.fieldDefs.has(AutoForm.fieldId(field));
  }

  addSeparator() {
    this.add<'separator'>({
      name: `${AutoForm.rulerCount++}`,
      kind: 'separator',
      value: Refs.of('separator'),
    });
  }

  add<Value>(field: AutoField & { value: Ref<Value> }): AutoFieldHandle<Value> {
    type HandleType = AutoFieldHandle<Value>;

    this.addFieldDef(field);

    const id = AutoForm.fieldId(field);
    const handle: AutoFieldHandle<Value> = {
      value: field.value,
      enabled: field.enabled || Refs.of(true),
    };

    handle.value.onChange(_ => this.updateUi(field));
    handle.enabled.onChange(_ => this.updateUi(field));
    this.handles.get(id).add(handle);

    return handle;
  }

  public inflate(into?: MiniForm): MiniForm {
    const form = into || new MiniForm();
    form.verticalAlign = 'stretch';
    for (const field of this.fields) {
      const inflated = this.inflateField(field);
      this.uiMap.set(AutoForm.fieldId(field), inflated);
      this.updateUi(field);
      if (field.label) {
        form.appendLabeled(field.label, inflated.element);
      } else {
        form.append(inflated.element);
      }
    }
    return form;
  }

  private addFieldDef(field: Amoral<AutoField>): void {
    if (field.kind === 'separator'
      && this.fields.length > 0
      && this.fields[this.fields.length - 1].kind === 'separator') {
      // elide repeatedly added separators
      return;
    }
    const id = AutoForm.fieldId(field);
    if (!this.fieldDefs.has(id)) {
      this.fieldDefs.set(id, field);
      this.fields.push(field);
    }
  }

  private updateUi<A extends AutoField>(field: A) {
    type Value = AutoFieldValue<A>;

    for (const down of this.downstream) {
      down.updateUi(field);
    }

    const id = AutoForm.fieldId(field);
    if (!this.uiMap.has(id)) return;
    
    const ui = this.uiMap.get(id) as AutoFieldUi<Value>;

    const values = new Set<Value>();
    const enables = new Set<boolean>();
    for (const handle of this.handles.get(id)) {
      values.add((handle as AutoFieldHandle<Value>).value.get());
      enables.add(handle.enabled.get());
    }

    if (values.size === 1) {
      ui.setValue(Array.from(values)[0]!);
    } else {
      ui.clear();
    }

    ui.setEnabled(Array.from(enables).some(e => e));
  }

  private updateHandle<V, R extends Ref<V>>(
    field: AutoField & { value: Ref<V> }, 
    value: V) {
    for (const handle of this.handles.get(AutoForm.fieldId(field))) {
      (handle as AutoFieldHandle<V>).value.set(value);
    }
  }

  private inflateField(field: AutoField): AutoFieldUi<any> {
    if (field.kind === 'amount') {
      const input = new AmountInput();
      input.minValue = typeof field.min !== 'undefined' ? field.min : null;
      input.maxValue = typeof field.max !== 'undefined' ? field.max : null;
      input.onChange(value => this.updateHandle(field, value));
      return {
        element: input,
        setValue: v => input.setValue(v),
        clear: () => input.clear(),
        setEnabled: e => input.setEnabled(e),
      };
    }
    if (field.kind === 'slider') {
      const input = new SliderInput(field.min, field.max);
      input.onChange(value => this.updateHandle(field, value));
      return {
        element: input,
        setValue: v => input.setValue(v),
        clear: () => input.clear(),
        setEnabled: e => input.setEnabled(e),
      };
    }
    if (field.kind === 'angle') {
      const input = new AngleInput();
      input.onChange(value => this.updateHandle(field, value));
      return {
        element: input,
        setValue: v => input.setValue(v),
        clear: () => input.clear(),
        setEnabled: e => input.setEnabled(e),
      };
    }
    if (field.kind === 'number') {
      const input = new NumberInput(
        typeof field.min !== 'undefined' ? field.min : null,
        typeof field.max !== 'undefined' ? field.max : null,
      );
      input.onChange(value => this.updateHandle(field, value));
      return {
        element: input,
        setValue: v => input.setValue(v),
        clear: () => input.clear(),
        setEnabled: e => input.setEnabled(e),
      };
    }
    if (field.kind === 'toggle') {
      const input = new ToggleButton(field.name, field.icons);
      input.onToggle(value => this.updateHandle(field, value));
      return {
        element: input,
        setValue: v => input.setToggled(v),
        clear: () => input.clear(),
        setEnabled: e => input.setEnabled(e),
      };
    }
    if (field.kind === 'button') {
      const input = new IconButton(field.name, field.icon);
      input.onClick(field.onClick);
      return {
        element: input,
        setValue: (_) => {},
        clear: () => {},
        setEnabled: e => input.setEnabled(e),
      };
    }
    if (field.kind === 'separator') {
      return {
        element: new Separator(true),
        setValue: (_) => {},
        clear: () => {},
        setEnabled: (_) => {},
      };
    }
    return impossible(field);
  }

  public static intersection(forms: AutoForm[]): AutoForm {
    if (forms.length === 0) return new AutoForm();
    if (forms.length === 1) return forms[0];
    const [first, ...remainder] = forms;
    const included = new Set<string>(first.fields.map(AutoForm.fieldId));
    for (const form of remainder) {
      const check = Array.from(included);
      for (const field of check) {
        if (!form.fieldDefs.has(field)) {
          included.delete(field);
        }
      }
      if (included.size === 0) break;
    }
    const result = new AutoForm();
    for (const field of first.fields) {
      const id = AutoForm.fieldId(field);
      if (included.has(id)) {
        result.addFieldDef(field);

        for (const form of forms) {
          for (const handle of form.handles.get(id)) {
            result.handles.get(id).add(handle);
          }
        }
      }
    }
    for (const form of forms) {
      form.downstream.add(result);
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
        result.addFieldDef(field);
        const id = AutoForm.fieldId(field);
        for (const handle of form.handles.get(id)) {
          result.handles.get(id).add(handle);
        }
      }
      form.downstream.add(result);
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
  value: Ref<V>;
  enabled?: Ref<boolean>;
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

  constructor(element: E) {
    super(element);
    this.addClass('mini-form-input');
    this.bindChangeListener(() => {
      if (this.getRawValue() === '') {
        return;
      }
      const value = this.getValue();
      if (value === null) {
        return;
      }
      for (const item of this.changeListeners) {
        item(value);
      }
      const formatted = this.format(value);
      if (formatted !== this.getRawValue()) {
        this.setRawValue(formatted);
      }
    });
  }

  public onChange(listener: (value: V) => void) {
     this.changeListeners.add(listener);
  }

  public getValue(): V | null {
    const parse = this.parse(`${this.getRawValue()}`);
    if ('error' in parse) {
      this.tooltip = parse.error;
      this.addClass('error');
      return null;
    }
    this.tooltip = '';
    this.removeClass('error');
    return parse.value;
  }

  public clear() {
    this.setRawValue('');
  }

  public reset() {
    this.clear();
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
    public minValue: number,
    public maxValue: number) {
    super(document.createElement('input') as HTMLInputElement);
    this.addClass('mini-slider');
    this.element.setAttribute('type', 'range');
    this.element.setAttribute('min', '0');
    this.element.setAttribute('max', `${SliderInput.RESOLUTION}`);
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

  constructor() {
    super(document.createElement('input') as HTMLInputElement);
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

  constructor() {
    super(document.createElement('input') as HTMLInputElement);
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
    private readonly minValue: number | null = null,
    private readonly maxValue: number | null = null,
  ) {
    super(document.createElement('input') as HTMLInputElement);
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

  clear() {
    // specifically avoiding firing events.
    this._status = false;
    this.removeClass('selected');
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

