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

    this.events.onMouse('move', e => {
      if (App.ecs.getComponents(Dragging).length > 0) return;

      const image = App.ui.getHandleAt(e.position, e => e.entity.has(Imaged));

      if (image === null) {
        App.pane.style.cursor = this.cursor;
      } else {
        App.pane.style.cursor = 'grab';
      }
    });

    this.events.addDragListener<UiEventDispatcher>({
      onStart: e => {
        const events = App.ui.getDefaultDragHandler(h => h.entity.has(Imaged));
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
    entity.add(Rectangular).createHandle({});
    const img = entity.add(Imaged);
    img.setSrc(url);
  }
}

App.tools.register(ImagesTool);

class Imaged extends Component {
  private readonly element: HTMLImageElement;
  private readonly rect: Rectangular;

  public readonly image: HTMLImageElement;

  constructor(entity: Entity, rect?: Rectangular) {
    super(entity);
    this.image = new Image();

    this.rect = typeof rect !== 'undefined'
      ? rect : entity.getOrCreate(Rectangular);
    this.rect.keepAspect = true;

    this.element = new Image();
    this.element.style.position = 'absolute';
    this.updateElement();
    App.imageCanvas.appendChild(this.element);

    this.rect.centerRef.onChange(_ => this.updateElement());
    this.rect.widthRef.onChange(_ => this.updateElement());
    this.rect.heightRef.onChange(_ => this.updateElement());
    this.rect.rotationRef.onChange(_ => this.updateElement());
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
      this.width = Distance(this.image.width, 'screen');
      this.height = Distance(this.image.height, 'screen');
      this.updateElement();
    };
    this.image.src = url;
    this.element.src = url;
    this.width = Distance(this.image.width, 'screen');
    this.height = Distance(this.image.height, 'screen');
    this.updateElement();
  }

  public updateElement() {
    const pos = this.center.get('screen');
    const width = this.width.get('screen');
    const height = this.height.get('screen');
    const angle = toDegrees(this.rect.rotation.get('screen'));
    this.element.style.left = `${pos.x}px`;
    this.element.style.top = `${pos.y}px`;
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    this.element.style.transform = `translate(-${width/2}px, -${height/2}px) rotate(${angle}deg)`;
  }

  tearDown() {
    this.element.parentNode?.removeChild(this.element);
  }
}

