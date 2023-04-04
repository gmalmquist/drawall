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
    this.events.onMouse('move', e => {
      if (App.ui.dragging) return;
      const handle = App.ui.getHandleAt(e.position, h => h.entity.has(Furniture));
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
        const handle = App.ui.getHandleAt(e.start, h => h.entity.has(Furniture));
        if (handle) {
          const events = App.ui.getDefaultDragHandler(h => h.entity.has(Furniture));
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

  override update() {}

  private getDrawFurnishing(start: UiDragEvent): UiEventDispatcher {
    const events = new UiEventDispatcher(FurnitureTool, 'draw furnishing');
    events.addDragListener({
      onStart: e => {
        const furniture = App.ecs.createEntity().add(Furniture);
        furniture.rect.center = e.start;
        App.ui.setSelection(furniture.entity.only(Handle));
        return furniture;
      },
      onUpdate: (e, furniture) => {
        let tl = e.start;

        const right = Vector(Axis.X, 'screen');
        const down = Vector(Axis.Y, 'screen');

        if (e.delta.dot(right).sign < 0) {
          tl = tl.plus(e.delta.onAxis(right));
        }
        if (e.delta.dot(down).sign < 0) {
          tl = tl.plus(e.delta.onAxis(down));
        }

        furniture.rect.width = e.delta.dot(right).abs();
        furniture.rect.height = e.delta.dot(down).abs();
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

interface FurnitureJson {
}

interface FurnitureAttach {
  wall: Wall;
  anchor: 'src' | 'dst' | 'center';
  posNormal: Distance;
  posTangent: number;
}

class Furniture extends Component implements Solo {
  public readonly [SOLO] = true;

  public readonly rect: Rectangular;

  constructor(entity: Entity) {
    super(entity);
    this.rect = entity.getOrCreate(Rectangular);
    this.rect.createHandle({
      priority: 2,
    });

    entity.getOrCreate(Form).add(() => {
      const form = new AutoForm();
      form.addButton({
        name: 'Upload Image',
        icon: Icons.imageUpload,
        onClick: () => {
          const img = entity.getOrCreate(Imaged, 'furniture');
          img.showUploadForm();
        },
      });
      return form;
    });
  }

  override toJson(): SavedComponent {
    return {
      factory: this.constructor.name,
      arguments: [{
      }],
    };
  }
}

ComponentFactories.register(Furniture, (
  entity: Entity,
  props: FurnitureJson,
) => {
  const furniture = entity.getOrCreate(Furniture);
  return furniture;
});


const FurnitureRenderer = (ecs: EntityComponentSystem) => {
  // most of the heavy-lifting is actually done by the rectangle and image
  // renderers! this is 90% to handle the UI while dragging and stuff.


};

