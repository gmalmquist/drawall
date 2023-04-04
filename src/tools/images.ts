class ImagesTool extends Tool {
  constructor() {
    super('images tool');
  }

  override get icon(): URL {
    return Icons.image;
  }

  override get cursor(): Cursor {
    return 'default';
  }

  override get description(): string {
    return 'add reference images';
  }

  override get allowSnap(): boolean {
    return true;
  }

  override createUi(ui: AutoForm) {
    ui.addButton({
      name: 'Upload Image',
      icon: Icons.imageUpload,
      onClick: () => {
        this.showImageUpload();
      },
    });
  }

  override onToolSelected() {
  }

  override setup() {
    App.viewport.onChange(() => App.ecs.getComponents(Imaged)
      .forEach(m => m.updateElement()));

    const resizeThreshold = Distance(20, 'screen');

    this.events.onMouse('click', e => {
      const images = App.ecs.getComponents(Imaged)
        .filter(img => img.entity.has(Handle))
        .filter(img => img.entity.only(Rectangular).contains(e.position))
        .sort((a, b) => b.zindex - a.zindex)
        .map(img => img.entity.only(Handle));
      const image = images.length > 0 ? images[0]! : null;
      if (image) {
        App.ui.select(image);
      } else {
        const handle = App.ui.getHandleAt(e.position, h => true, true);
        if (handle !== null) {
          handle.selectWithAppropriateTool();
          return;
        }
        App.ui.clearSelection();
      }
    });

    this.events.onMouse('move', e => {
      if (App.ecs.getComponents(Dragging).length > 0) return;

      const image = App.ui.getHandleAt(e.position, h => h.isSpecificallyFor(this.name));

      if (image === null) {
        App.pane.style.cursor = this.cursor;
      } else {
        App.pane.style.cursor = image.getContextualCursor();
      }
    });

    this.events.addDragListener<UiEventDispatcher>({
      onStart: e => {
        const events = App.ui.getDefaultDragHandler(h => h.isSpecificallyFor(this.name));
        events.handleDrag(e);
        return events;
      },
      onUpdate: (e, events) => events.handleDrag(e),
      onEnd: (e, events) => events.handleDrag(e),
    });
  }

  override update() {}

  showImageUpload() {
    const extensions = [
      '.gif',
      '.jpeg',
      '.jpg',
      '.png',
      '.svg',
      '.webm',
    ];
    const element = document.createElement('input') as HTMLInputElement;
    element.setAttribute('type', 'file');
    element.setAttribute('accept', extensions.join(', '));
    element.style.position = 'absolute';
    element.style.opacity = '0';
    document.body.appendChild(element);
    element.addEventListener('change', () => {
      if (element.files === null) return;
      const files = Array.from(element.files);
      for (const file of files) {
        this.createImageEntity(URL.createObjectURL(file));
      }
      element.parentNode?.removeChild(element);
    });
    element.click();
  }

  createImageEntity(url: string) {
    const entity = App.ecs.createEntity();
    const rect = entity.add(Rectangular);
    rect.createHandle({
      tools: ['images tool'],
    });
    const img = entity.add(Imaged);
    img.setSrc(url);
    rect.keepAspect = true;
  }
}

App.tools.register(ImagesTool);

class Imaged extends Component {
  public static readonly DEFAULT_OPACITY = 0.5;

  private static ZINDEX_ARRAY = Array<Imaged>();

  private readonly canvas: HTMLElement;
  private readonly element: HTMLImageElement;
  private readonly rect: Rectangular;
  private readonly zindexRef: Ref<number> = Refs.of(0);

  public readonly image: HTMLImageElement;
  public readonly opacity: Ref<number>;

  constructor(entity: Entity, rect?: Rectangular) {
    super(entity);
    this.image = new Image();

    this.zindexRef.set(Imaged.ZINDEX_ARRAY.length);
    Imaged.ZINDEX_ARRAY.push(this);

    this.rect = typeof rect !== 'undefined'
      ? rect : entity.getOrCreate(Rectangular);

    this.opacity = Refs.of(Imaged.DEFAULT_OPACITY);

    this.element = new Image();
    this.element.style.position = 'absolute';
    this.element.style.display = 'none';
    this.updateElement();

    this.canvas = App.imageCanvas;
    this.canvas.appendChild(this.element);

    this.rect.centerRef.onChange(_ => this.updateElement());
    this.rect.widthRef.onChange(_ => this.updateElement());
    this.rect.heightRef.onChange(_ => this.updateElement());
    this.rect.rotationRef.onChange(_ => this.updateElement());
    this.opacity.onChange(o => this.element.style.opacity = `${o}`);

    entity.add(Form, () => {
      const form = new AutoForm();
      form.add({
        kind: 'slider',
        name: 'opacity',
        label: 'opacity',
        value: this.opacity,
        min: 0,
        max: 1,
      });
      form.addButton({
        name: 'Send to Back',
        icon: Icons.toBack,
        onClick: () => this.toBack(),
      });
      form.addButton({
        name: 'Bring to Front',
        icon: Icons.toFront,
        onClick: () => this.toFront(),
      });
      form.addButton({
        name: 'Reset Aspect Ratio',
        icon: Icons.resetAspectRatio,
        onClick: () => this.resetAspectRatio(),
      });
      return form;
    });
  }

  get zindex(): number {
    return this.zindexRef.get();
  }

  get width() {
    return this.rect.width;
  }

  set width(d: Distance) {
    this.rect.width = d;
  }

  get height() {
    return this.rect.height;
  }

  set height(d: Distance) {
    this.rect.height = d;
  }

  get center() {
    return this.rect.center;
  }

  set center(p: Position) {
    this.rect.center = p;
  }

  get rotation() {
    return this.rect.rotation;
  }

  public setSrc(url: string) {
    this.image.onload = () => {
      if (!this.rectHasSize()) {
        this.rectToImageDimensions();
      }
      this.updateElement();
    };
    this.image.src = url;
    this.element.src = url;
    if (!this.rectHasSize()) {
      this.rectToImageDimensions();
    }
    this.updateElement();
  }

  public toBack() {
    this.canvas.removeChild(this.element);
    this.canvas.prepend(this.element);
    Imaged.ZINDEX_ARRAY.splice(this.zindexRef.get(), 1);
    Imaged.ZINDEX_ARRAY.unshift(this);
    this.zindexRef.set(0);
  }

  public toFront() {
    this.canvas.removeChild(this.element);
    this.canvas.appendChild(this.element);
    Imaged.ZINDEX_ARRAY.splice(this.zindexRef.get(), 1);
    Imaged.ZINDEX_ARRAY.push(this);
    this.zindexRef.set(Imaged.ZINDEX_ARRAY.length - 1);
  }

  public updateElement() {
    const pos = this.center.get('screen');
    const width = this.width.get('screen');
    const height = this.height.get('screen');
    const angle = toDegrees(this.rect.rotation.get('screen'));
    this.element.style.opacity = `${this.opacity.get()}`;
    this.element.style.left = `${pos.x}px`;
    this.element.style.top = `${pos.y}px`;
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    this.element.style.transform = `translate(-${width/2}px, -${height/2}px) rotate(${angle}deg)`;
    this.element.style.display = width > 0 && height > 0 ? 'block' : 'none';
  }

  private resetAspectRatio() {
    this.rect.keepAspect = false;
    const ratio = this.image.width / this.image.height;
    this.rect.width = this.rect.height.scale(ratio);
    this.rect.keepAspect = true;
  }

  private rectToImageDimensions() {
    const keepAspect = this.rect.keepAspect;
    this.rect.keepAspect = false;
    this.width = Distance(this.image.width, 'screen');
    this.height = Distance(this.image.height, 'screen');
    this.rect.keepAspect = keepAspect;
  }

  private rectHasSize() {
    const w = this.width.get('screen');
    const h = this.height.get('screen');
    return w > 1 && h > 1;
  }

  private getDataUrl() {
    const canvas = document.createElement('canvas');
    canvas.width = this.image.width;
    canvas.height = this.image.height;
    const g = canvas.getContext('2d')!;
    g.drawImage(this.image, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
  }

  private getStableUrl() {
    const src = this.image.src;
    if (src.startsWith('blob:')) {
      return this.getDataUrl();
    }
    return src;
  }

  tearDown() {
    if (Imaged.ZINDEX_ARRAY[this.zindexRef.get()] === this) {
      Imaged.ZINDEX_ARRAY.splice(this.zindexRef.get(), 1);
    }
    this.element.parentNode?.removeChild(this.element);
  }

  toJson(): SavedComponent {
    return {
      factory: this.constructor.name,
      arguments: [ this.getStableUrl(), this.opacity.get() ],
    };
  }
}

ComponentFactories.register(Imaged, (entity: Entity, url: string, opacity: number) => {
  const imaged = entity.getOrCreate(Imaged);
  imaged.setSrc(url);
  imaged.opacity.set(opacity || Imaged.DEFAULT_OPACITY);
  return imaged;
});

