// specifically, reference images
class ImagesTool extends Tool {
  constructor() {
    super('images tool');
  }

  override get icon(): URL {
    return Icons.image;
  }

  override get cursor(): Cursor {
    return 'cell';
  }

  override get description(): string {
    return 'add reference images';
  }

  override get allowSnap(): boolean {
    return true;
  }

  override createUi(ui: AutoForm) {
  }

  override onToolSelected() {
    App.ecs.getComponents(Imaged)
      .filter(img => img.layer === 'reference')
      .forEach(m => m.cleanup());
  }

  override setup() {
    App.viewport.onChange(() => App.ecs.getComponents(Imaged)
      .forEach(m => m.updateElement()));

    const resizeThreshold = Distance(20, 'screen');

    this.events.onMouse('click', e => {
      const images = App.ecs.getComponents(Imaged)
        .filter(img => img.layer === 'reference')
        .filter(img => img.entity.has(Handle))
        .filter(img => img.entity.only(Rectangular).contains(e.position))
        .sort((a, b) => b.zindex - a.zindex)
        .map(img => img.entity.only(Handle));
      const image = images.length > 0 ? images[0]! : null;
      if (image) {
        App.ui.select(image);
        return;
      }
      this.addReferenceImage(e.position);
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

  addReferenceImage(position: Position) {
    const entity = App.ecs.createEntity();
    const rect = entity.add(Rectangular);
    rect.center = position;
    rect.createHandle({
      tools: ['images tool'],
    });
    const img = entity.add(Imaged, 'reference');
    img.showUploadForm();
  }
}

App.tools.register(ImagesTool);

