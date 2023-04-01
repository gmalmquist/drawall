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

    this.events.onMouse('move', e => {
      if (App.ecs.getComponents(Dragging).length > 0) return;

      const images = App.ecs.getComponents(Imaged).filter(
        img => img.getBounds().contains(e.position));
      const image = images.length > 0 ? images[images.length - 1] : null;

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
    const img = entity.add(Imaged);
    img.setSrc(url);
    entity.add(Handle, {
      getPos: () => img.position.get(),
      setPos: () => {},
      distance: p => img.getBounds().sdist(p),
      selectable: false,
      clickable: false,
      hoverable: false,
      draggable: true,
      drag: () => {
        if (App.tools.current !== this) return Drags.empty();
        const X = Vector(Axis.X, 'screen');
        const Y = Vector(Axis.Y, 'screen');

        const left = Vectors.zero('screen');
        const top = Vectors.zero('screen');
        const right = X.scale(img.width.get());
        const bottom = Y.scale(img.height.get());

        const map = new Map<string, Vector>();
        map.set('left', left);
        map.set('right', right);
        map.set('top', top);
        map.set('bottom', bottom);
        map.set('middle', right.scale(0.5));
        map.set('center', bottom.scale(0.5));

        const items: DragPoint[] = [];
        for (const h of ['left', 'right', 'middle']) {
          const horizontal = map.get(h)!;
          for (const v of ['top', 'bottom', 'center']) {
            const vertical = map.get(v)!;
            items.push({
              kind: 'point',
              name: h === 'middle' && v === 'center' ? 'center' : `${v} ${h}`,
              get: () => img.position.get().plus(horizontal).plus(vertical),
              set: p => img.position.set(p.minus(horizontal).minus(vertical)),
            });
          }
        }

        return {
          kind: 'group',
          name: 'image',
          aggregate: 'all',
          items,
        };
      },
    });
  }
}

App.tools.register(ImagesTool);

class Imaged extends Component {
  private readonly element: HTMLElement;
  public readonly image: HTMLImageElement;
  public readonly position: Ref<Position> = Refs.of(
    Positions.zero('model'),
    (a, b) => Distances.between(a, b).lt(Distance(1, 'screen')),
  );
  public readonly width: Ref<Distance> = Refs.of(Distance(0, 'screen'));
  public readonly height: Ref<Distance> = Refs.of(Distance(0, 'screen'));
 
  constructor(entity: Entity) {
    super(entity);
    this.image = new Image();

    this.element = document.createElement('div');
    this.element.style.position = 'absolute';
    this.element.style.backgroundSize = 'cover';
    this.updateElement();
    App.imageCanvas.appendChild(this.element);

    this.position.onChange(_ => this.updateElement());
    this.width.onChange(_ => this.updateElement());
    this.height.onChange(_ => this.updateElement());
  }

  public getAspectRatio(): number {
    return this.width.get().get('screen') / this.height.get().get('screen');
  }

  public getBounds(): Rect {
    const pos = this.position.get();
    const diagonal = Vector(new Vec(
      this.width.get().get('screen'),
      this.height.get().get('screen'),
    ), 'screen');
    return new Rect(pos, pos.plus(diagonal));
  }

  public setSrc(url: string) {
    this.image.onload = () => {
      this.width.set(Distance(this.image.width, 'screen').to('model'));
      this.height.set(Distance(this.image.height, 'screen').to('model'));
      this.updateElement();
    };
    this.image.src = url;
    this.element.style.backgroundImage = `url(${JSON.stringify(url)})`;
    this.width.set(Distance(this.image.width, 'screen').to('model'));
    this.height.set(Distance(this.image.height, 'screen').to('model'));
    this.updateElement();
  }

  public updateElement() {
    const pos = this.position.get().get('screen');
    const width = this.width.get().get('screen');
    const height = this.height.get().get('screen');
    this.element.style.left = `${pos.x}px`;
    this.element.style.top = `${pos.y}px`;
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
  }

  tearDown() {
    this.image.parentNode?.removeChild(this.image);
  }
}

