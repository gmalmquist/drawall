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

      const images = App.ecs.getComponents(Imaged).filter(
        img => img.getBounds().sdist(e.position).lt(resizeThreshold));
      const image = images.length > 0 ? images[images.length - 1] : null;

      if (image === null) {
        App.pane.style.cursor = this.cursor;
      } else {
        const bounds = image.getBounds();
        if (bounds.sdist(e.position).abs().lt(resizeThreshold)) {
          App.pane.style.cursor = getResizeCursor(Vectors.between(bounds.centroid, e.position));
        } else {
          App.pane.style.cursor = 'grab';
        }
      }
    });

    this.events.addDragListener<UiEventDispatcher>({
      onStart: e => {
        const handle = App.ui.getHandleAt(e.start, e => e.entity.has(Imaged));
        if (handle !== null) {
          const img = handle.entity.maybe(Imaged)!;
          const bounds = img.getBounds();
          if (bounds.sdist(e.start).abs().lt(resizeThreshold)) {
            const events = this.handleResize(img);
            events.handleDrag(e);
            return events;
          }
        }

        const events = App.ui.getDefaultDragHandler(h => h.entity.has(Imaged));
        events.handleDrag(e);
        return events;
      },
      onUpdate: (e, events) => events.handleDrag(e),
      onEnd: (e, events) => events.handleDrag(e),
    });
  }

  private handleResize(img: Imaged): UiEventDispatcher {
    const dispatcher = new UiEventDispatcher(ImagesTool, 'resize');
    type Context = {centroid: Position, direction: ResizeCursor };
    const X = Vector(Axis.X, 'screen');
    const Y = Vector(Axis.Y, 'screen');

    const startPos = img.position.get().get('screen');
    const startWidth = img.width.get().get('screen');
    const startHeight = img.height.get().get('screen');

    const aspect = img.getAspectRatio();

    const applyDelta = ({ left, right, top, bottom }: {
      left?: Distance,
      right?: Distance,
      top?: Distance,
      bottom?: Distance,
    }) => {
      let dx = 0;
      let dy = 0;
      let dw = 0;
      let dh = 0;
      if (left) {
        dx += left.get('screen');
        dw -= left.get('screen');
      }
      if (top) {
        dy += top.get('screen');
        dh -= top.get('screen');
      }
      if (right) {
        dw += right.get('screen');
      }
      if (bottom) {
        dh += bottom.get('screen');
      }

      const tw = Math.max(1, startWidth + dw);
      const th = Math.max(1, startHeight + dh);

      const cw = dw > dh ? tw : th * aspect;
      const ch = dw > dh ? tw / aspect : th;

      if (left) dx += tw - cw;
      if (top) dy += th - ch;

      img.position.set(Position(startPos.plus(new Vec(dx, dy)), 'screen'));
      img.width.set(Distance(cw, 'screen'));
      img.height.set(Distance(ch, 'screen'));
    };

    dispatcher.addDragListener<Context>({
      onStart: e => {
        const bounds = img.getBounds();
        const centroid = bounds.centroid;
        const delta = Vectors.between(centroid, e.start);
        App.pane.style.cursor = getResizeCursor(delta, true);
        return { centroid, direction: getResizeCursor(delta, false) };
      },
      onUpdate: (e, { centroid, direction }) => {
        const top = e.delta.dot(Y);
        const bottom = top;
        const left = e.delta.dot(X);
        const right = left;
        if (direction === 'n-resize') {
          applyDelta({ top });
        } else if (direction === 's-resize') {
          applyDelta({ bottom });
        } else if (direction === 'e-resize') {
          applyDelta({ right });
        } else if (direction === 'w-resize') {
          applyDelta({ left });
        } else if (direction === 'ne-resize') {
          applyDelta({ top, right });
        } else if (direction === 'se-resize') {
          applyDelta({ bottom, right });
        } else if (direction === 'nw-resize') {
          applyDelta({ top, left });
        } else if (direction === 'sw-resize') {
          applyDelta({ bottom, left });
        }
      },
      onEnd: (e, { centroid, direction }) => {
      },
    });
    return dispatcher;
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

