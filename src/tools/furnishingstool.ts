class FurnitureTool extends Tool {
  constructor() {
    super('furniture tool');
  }

  override get allowSnap() {
    return true;
  }

  override get icon(): URL {
    return Icons.furniture;
  }

  override get cursor(): Cursor {
    return 'crosshair';
  }

  override get description(): string {
    return 'add furniture, doors, and windows';
  }

  override createUi(ui: AutoForm) {
  }

  override setup() {
    const filter = (h: Handle) => h.entity.has(Furniture) || h.control;
    this.events.onMouse('move', e => {
      if (App.ui.dragging) return;
      const handle = App.ui.getHandleAt(e.position, filter);
      if (handle !== null) {
        App.pane.style.cursor = handle.getContextualCursor();
        return;
      }
      App.pane.style.cursor = this.cursor;
    })
    this.events.onMouse('click', e => {
      const handle = App.ui.getHandleAt(e.position, h => h.entity.has(Furniture));
      if (handle !== null) {
        App.ui.select(handle);
        return;
      }
      App.pane.style.cursor = this.cursor;
    });
    this.events.addDragListener({
      onStart: e => {
        const handle = App.ui.getHandleAt(e.start, filter);
        if (handle) {
          App.ui.select(handle);
          const events = App.ui.getDefaultDragHandler(filter);
          events.handleDrag(e);
          return events;
        }
        return this.getDrawFurnishing(e);
      },
      onUpdate: (e, events) => {
        events?.handleDrag(e);
      },
      onEnd: (e, events) => {
        events?.handleDrag(e);
        App.pane.style.cursor = this.cursor;
      }
    });
  }

  override update() {
  }

  private getDrawFurnishing(start: UiDragEvent): UiEventDispatcher {
    const events = new UiEventDispatcher(FurnitureTool, 'draw furnishing');
    events.addDragListener({
      onStart: e => {
        const furniture = App.ecs.createEntity().add(Furniture);
        furniture.rect.center = App.ui.snapPoint(e.start);
        App.ui.setSelection(furniture.entity.only(Handle));
        return furniture;
      },
      onUpdate: (e, furniture) => {
        let tl = App.ui.snapPoint(e.start);
        const end = App.ui.snapPoint(e.position);
        const delta = Vectors.between(tl, end);

        const right = Vector(Axis.X, 'screen');
        const down = Vector(Axis.Y, 'screen');

        if (delta.dot(right).sign < 0) {
          tl = tl.plus(delta.onAxis(right));
        }
        if (delta.dot(down).sign < 0) {
          tl = tl.plus(delta.onAxis(down));
        }

        furniture.rect.width = delta.dot(right).abs();
        furniture.rect.height = delta.dot(down).abs();
        furniture.rect.setLeft(tl);
        furniture.rect.setTop(tl);
      },
      onEnd: (e, furniture) => {
      },
    });
    events.handleDrag(start);
    return events;
  }
}

App.tools.register(FurnitureTool);

