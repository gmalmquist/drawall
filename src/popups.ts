interface Anchor {
  position: Position;
}

class Popup extends Component {
  readonly element: HTMLElement;
  private visible: boolean = false;
  private anchor: Anchor = { position: Position(Point.ZERO, 'screen') };
  public closeOnUnfocus: boolean = true;

  constructor(entity: Entity) {
    super(entity);

    this.element = document.createElement('div');
    this.element.setAttribute('class', 'popup');

    this.addKind(Popup);
  }

  get isVisible(): boolean {
   return this.visible;
  }

  setPosition(pos: Position) {
    this.anchor = {
      position: pos,
    };
    this.moveToAnchor();
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    document.body.appendChild(this.element);
    this.moveToAnchor();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    document.body.removeChild(this.element);
  }

  tearDown() {
    this.hide();
  }  

  private moveToAnchor() {
    const pos = this.anchor.position.get('screen');
    const bounds = this.element.getBoundingClientRect();
    const width = bounds.width;
    const height = bounds.height;

    const tx = pos.x - width / 2;
    const ty = pos.y - height / 2;

    this.element.style.left = `${tx}px`;
    this.element.style.top = `${ty}px`;
  }

  public static confirm(props: PopConfirmProps) {
    const confirm = App.ecs.createEntity().add(PopupWindow);
    confirm.title = props.title;
    confirm.getUiBuilder()
      .addText(props.body)
      .newRow()
      .addButton(props.cancelLabel || 'Cancel', _ => confirm.entity.destroy())
      .addButton(props.okLabel || '<b>Okay</b>', _ => {
        confirm.entity.destroy();
        props.action();
      });
    confirm.setPosition(props.position || Position(
      new Point(App.viewport.screen_width/2, App.viewport.screen_height/2),
      'screen',
    ));
    confirm.show();
  }
}

interface PopConfirmProps {
  title: string;
  body: string;
  action: () => void;
  okLabel?: string;
  cancelLabel?: string;
  position?: Position;
}

class PopupWindow extends Popup {
  private readonly headerEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly contentEl: HTMLElement;
  private readonly uiBuilder: UiBuilder;

  constructor(entity: Entity) {
    super(entity);
    this.element.setAttribute('class', 'popup window');

    const header = document.createElement('div');
    header.setAttribute('class', 'popup-header');
    this.element.appendChild(header);

    const title = document.createElement('div');
    title.setAttribute('class', 'popup-title');
    header.appendChild(title);

    const close = document.createElement('a');
    close.setAttribute('class', 'btn popup-close');
    close.setAttribute('href', '#');
    close.innerHTML = '×';
    header.appendChild(close);

    const content = document.createElement('div');
    content.setAttribute('class', 'popup-content');
    this.element.appendChild(content);

    this.headerEl = header;
    this.titleEl = title;
    this.contentEl = content;

    this.uiBuilder = new UiBuilder(this.contentEl);

    close.addEventListener('click', () => this.hide());

    this.makeDraggable(this.element, header);
  }

  set title(s: string) {
    this.titleEl.innerHTML = s;
  }

  getUiBuilder(): UiBuilder {
    return this.uiBuilder;
  }

  appendHTML(el: Element) {
    this.contentEl.appendChild(el);
  }

  show() {
    super.show();
    this.uiBuilder.focus();
  }

  private makeDraggable(element: HTMLElement, handle: HTMLElement) {
    const drag = {
      start: Point.ZERO,
      offset: Vec.ZERO,
      dragging: false,
    };
    handle.style.cursor = 'grab';
    handle.addEventListener('mousedown', (e: MouseEvent) => {
      const pos = new Point(e.clientX, e.clientY);
      drag.start = pos;
      const rect = element.getBoundingClientRect();
      drag.offset = Vec.between(pos, new Point(rect.left, rect.top));
      drag.dragging = true;
      handle.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e: MouseEvent) => {
      const pos = new Point(e.clientX, e.clientY);
      if (drag.dragging) {
        const tl = pos.plus(drag.offset);
        element.style.left = `${tl.x}px`;
        element.style.top = `${tl.y}px`;
      }
    });
    handle.addEventListener('mouseup', (e: MouseEvent) => {
      drag.dragging = false;
      handle.style.cursor = 'grab';
    });
  }
}

type AttrMap = { [key: string]: string | number };

interface InputState {
  value: () => string;
  reset: () => void;
  set: (value: string) => void;
}

interface RadioOption {
  name: string;
  label?: string;
  value?: string;
  isDefault?: boolean;
}

interface DropdownOption {
  name: string;
  label?: string;
}

class UiBuilder {
  private readonly changeListeners: ((name: string, value: string) => void)[] = [];
  private readonly inputs = new Map<string, InputState>();
  private initialFocus: HTMLInputElement | null = null;
  private static index: number = 0;
  private row: Element;
  private salt: string;

  constructor(private readonly pane: Element) {
    this.salt = `uib-${UiBuilder.index++}-`;
    this.row = UiBuilder.createRow();
    this.pane.appendChild(this.row);
  }

  focus() {
    if (this.initialFocus !== null) {
      this.initialFocus.focus();
    }
  }

  fireChange(field: string) {
    const value = this.getValue(field);
    this.changeListeners.forEach(listener => listener(field, value));
  }

  onChange(listener: (name: string, value: string) => void) {
    this.changeListeners.push(listener);
  }

  add(el: Element): UiBuilder {
    this.row.appendChild(el);
    return this;
  }

  getFields(): Set<string> {
    return new Set(this.inputs.keys());
  }

  getValue(name: string): string {
    return this.inputs.get(name)!.value();
  }

  setValue(name: string, value: any) {
    this.inputs.get(name)!.set(`${value}`);
  }

  resetField(name: string) {
    this.inputs.get(name)!.reset();
  }

  addLabel(label: string, forField: string): UiBuilder {
    return this.add(this.create('label', { 'for': forField }, label));
  }

  addText(text: string): UiBuilder {
    return this.add(this.create('div', {}, text));
  }

  addInput(name: string, inputType: string, attrs: AttrMap): UiBuilder {
    const e = this.create(
      'input',
      {
        name,
        id: name,
        'type': inputType,
        ...attrs,
      },
    );
    const input = e as HTMLInputElement;
    input.addEventListener('change', () => this.fireChange(name));
    this.inputs.set(name, {
      value: () => input.value,
      reset: () => {
        input.value = `${attrs.value || ''}`;
        this.fireChange(name);
      },
      set: (v: string) => {
        input.value = v;
        this.fireChange(name);
      },
    });
    return this.add(e);
  }

  addFormattedInput(
    name: string,
    reformat: (s: string) => string,
    attrs: AttrMap,
  ): UiBuilder {
    const input = this.create(
      'input',
      { name, id: name, 'type': 'text', ...attrs },
    ) as HTMLInputElement;
    input.addEventListener('change', () => {
      const formatted = reformat(input.value);
      if (input.value !== formatted) {
         input.value = formatted;
      }
      this.fireChange(name);
    });
    this.inputs.set(name, {
      value: () => reformat(input.value),
      reset: () => {
        reformat(`${attrs.value}` || '');
        this.fireChange(name);
      },
      set: (v: string) => {
        input.value = reformat(v);
        this.fireChange(name);
      },
    });
    return this.add(input);
  }

  addNumberInput(
    name: string,
    attrs: { min?: number, max?: number, size?: number, value?: number },
  ): UiBuilder {
    return this.addInput(name, 'number', attrs);
  }

  addDropdown(
    name: string,
    attrs: {
      options: DropdownOption[],
      placeholder?: string,
      selected?: string,
    },
  ): UiBuilder {
    const select = this.create('select', { name, id: name }) as HTMLSelectElement;
    if (attrs.placeholder) {
      const el = this.create('option', { value: '' }, attrs.placeholder);
      select.appendChild(el);
    }
    for (const option of attrs.options) {
      const el = this.create('option', { value: option.name }, option.label || option.name);
      select.appendChild(el);
    }
    if (typeof attrs.selected !== 'undefined') {
      select.value = attrs.selected;
    }
    select.addEventListener('change', () => this.fireChange(name));
    this.inputs.set(name, {
      value: () => select.value,
      reset: () => {
        select.value = attrs.placeholder ? '' : attrs.options[0].name;
        this.fireChange(name);
      },
      set: (v: string) => {
        select.value = attrs.placeholder ? '' : attrs.options[0].name;
        this.fireChange(name);
      },
    });
    return this.add(select);
  }

  addSlider(
    name: string,
    attrs: { min: number, max: number, initial: number },
  ): UiBuilder {
    const initial = 10000 * (attrs.initial - attrs.min) / (attrs.max - attrs.min);
    const slider = this.create(
      'input',
      {
        name,
        id: name,
        'type': 'range',
        min: 0,
        max: 10000,
        value: initial,
      },
    ) as HTMLInputElement;
    slider.addEventListener('change', () => this.fireChange(name));
    this.inputs.set(name, {
      value: () => {
        const s = parseFloat(slider.value) / 10000.;
        return `${lerp(s, attrs.min, attrs.max)}`;
      },
      reset: () => {
        slider.value = `${initial}`;
        this.fireChange(name);
      },
      set: (v: string) => {
        const f = 10000 * (parseFloat(v) - attrs.min) / (attrs.max - attrs.min);
        slider.value = `${f}`;
        this.fireChange(name);
      },
    });
    return this.add(slider);
  }

  addCheckbox(
    name: string,
    checked: boolean = false,
  ): UiBuilder {
    const checkbox = this.create(
      'input',
      {
        name,
        id: name,
        'type': 'checkbox',
      },
    ) as HTMLInputElement;
    checkbox.checked = checked;
    checkbox.addEventListener('change', () => this.fireChange(name));
    this.inputs.set(name, {
      value: () => checkbox.checked ? 'true' : 'false',
      reset: () => {
        checkbox.checked = checked;
        this.fireChange(name);
      },
      set: (v: string) => {
        checkbox.checked = v === 'true';
        this.fireChange(name);
      },
    });
    return this.add(checkbox);
  }

  addRadioGroup(
    name: string,
    options: RadioOption[],
  ): UiBuilder {
    const group = this.create('div', { 'class': 'radio-group' });
    const radios = new Map<string, HTMLInputElement>();
    for (const option of options) {
      const radio = this.create('input', {
        'type': 'radio',
        id: option.name,
        name: name,
        value: option.value || option.name,
      }) as HTMLInputElement;
      radios.set(option.name, radio);
      radio.checked = option.isDefault!!;
      radio.addEventListener('change', () => this.fireChange(name));
      group.appendChild(radio);
      const label = this.create('label', {
        'for': option.name,
      }, option.label || option.name);
      group.appendChild(label);
    }
    this.inputs.set(name, {
      value: () => {
        const checked = Array.from(radios.keys())
          .filter(r => radios.get(r)!.checked);
        if (checked.length > 0) return checked[0];
        return options[0].name;
      },
      reset: () => {
        options.forEach(o => {
          radios.get(o.name)!.checked = o.isDefault!!;
        });
      },
      set: (v: string) => {
        options.forEach(o => {
          const value = o.value || o.name;
          radios.get(o.name)!.checked = value === v;
        });
      },
    });
    return this.add(group);
  }

  addButton(label: string, action: (ui: UiBuilder) => void): UiBuilder {
    const button = this.create(
      'button',
      { value: label },
      label,
    );
    button.addEventListener('click', () => action(this));
    return this.add(button);
  }

  addResetButton(label: string = 'Reset'): UiBuilder {
    return this.addButton(label, ui => {
      Array.from(ui.getFields()).forEach(f => ui.resetField(f));
    });
  }

  newRow(): UiBuilder {
    this.row = UiBuilder.createRow();
    this.pane.appendChild(this.row);
    return this;
  }

  addSpacer(): UiBuilder {
    const e = document.createElement('div') as HTMLElement;
    e.setAttribute('style', 'flex-grow: 1;');
    return this.add(e);
  }

  private create(
    tagName: string,
    atts: AttrMap,
    innerHTML: string = '',
  ): Element {
    const element = UiBuilder.createSalted(this.salt, tagName, atts, innerHTML);
    const autofocusTypes = new Set(['text', 'number']);
    if (this.initialFocus === null
      && tagName === 'input'
      && autofocusTypes.has(`${atts['type']}` || '')) {
      this.initialFocus = element as HTMLInputElement;
    }
    return element;
  }

  private static createRow(): Element {
    return UiBuilder.createSalted('', 'div', { 'class': 'row' });
  }

  private static createSalted(
    salt: string,
    tagName: string,
    atts: AttrMap,
    innerHTML: string = '',
  ): Element {
    const salty = new Set(['id', 'name', 'for']);
    const e = document.createElement(tagName);
    if (tagName === 'input' && atts['type'] === 'text') {
      e.setAttribute('class', 'textbox');
    }
    for (const key of Object.keys(atts)) {
      let value = `${atts[key]}`;
      if (salty.has(key)) {
        value = `${salt}${value}`;
      }
      e.setAttribute(key, value);
    }
    e.innerHTML = innerHTML;
    return e;
  }
}



