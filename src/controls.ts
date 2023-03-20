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

