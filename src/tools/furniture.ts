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
          App.ui.select(handle);
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

  override update() {
  }

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
  attach: {
    wall: Eid,
    at: number,
    normal: JsonObject,
    point: string,
    rotation: JsonObject,
  } | false,
}

interface FurnitureAttach {
  wall: Wall;
  at: number;
  normal: Distance;
  point: DragPoint;
  rotation: Angle;
}

class Furniture extends Component implements Solo {
  public readonly [SOLO] = true;

  public readonly attachRef = Refs.of<FurnitureAttach | null>(
    null, (a, b) => {
      if (a === b) return true;
      if (a === null || b === null) return false;
      return a.wall === b.wall
        && a.at === b.at
        && a.normal.get('model') === b.normal.get('model')
        && a.point.name === b.point.name;
    },
  );
  public readonly rect: Rectangular;
  private updatingOrientation: boolean = false;

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
      form.addButton({
        name: 'Align to Wall',
        enabled: Refs.mapRo(this.attachRef, a => !!a?.wall?.entity?.isAlive),
        onClick: () => {
          const attach = this.attach;
          if (!attach) return;
          attach.rotation = Angle(Radians(0), 'model');
          this.updateOrientation();
        },
      });
      return form;
    });

    const edgeListeners = new Map<Wall, (edge: MemoEdge) => void>();

    this.attachRef.onChange(a => {
      if (a === null) return;
      if (!edgeListeners.has(a.wall)) {
        edgeListeners.set(a.wall, edge => {
          if (this.attach?.wall !== a.wall) return;
          this.updateOrientation();
        });
      }
      a.wall.edgeRef.onChange(edgeListeners.get(a.wall)!);
    });

    this.entity.only(Handle).events.addDragListener({
      onStart: e => {
        return true;
      },
      onUpdate: (_e, _c) => {
        this.attach = this.findAttach();
      },
      onEnd: (_e, _c) => {
        this.attach = this.findAttach();
      },
    });

    this.rect.rotationRef.onChange(() => {
      this.updateAttachRotation();
      this.updateAttachPosition();
    });
    this.rect.centerRef.onChange(() => this.updateAttachPosition());
    this.rect.widthRef.onChange(() => this.updateAttachPosition());
    this.rect.heightRef.onChange(() => this.updateAttachPosition());
  }

  public updateOrientation() {
    const attach = this.attach;
    if (attach === null) return;
    this.updatingOrientation = true;
    const edge = attach.wall.edge;
    this.rect.rotation = edge.tangent.angle().plus(attach.rotation);
    attach.point.set(edge.lerp(attach.at).splus(attach.normal, edge.normal));
    this.updatingOrientation = false;
  }

  private findAttach(): FurnitureAttach | null {
    const epsDistance = Distance(0.1, 'model');
    const closure = this.entity.only(Handle).getDragClosure('complete');
    const positions = closure.points.map(p => p.get());
    const pointOrdering = closure.points.map((_, i) => i);
    const furnitureAngle = this.rect.rotation;
    reverseInPlace(pointOrdering); // ensure midpoints come first

    const best = argmin(App.ecs.getComponents(Wall), wall => {
      const edge = wall.entity.only(PhysEdge).edge;
      const wallToCenter = Vectors.between(edge.midpoint, this.rect.center);
      
      const closest = argmin(pointOrdering, i => {
        const p = positions[i];
        const s = edge.unlerp(p);
        if (s < 0 || s > 1) return 'invalid';
        const d = Vectors.between(edge.src, p).dot(edge.normal);
        if (d.gt(epsDistance)) {
          return 'invalid'; // on the wrong side of the wall
        }
        return { at: s, distance: d };
      }, ({ distance }) => Math.round(Math.abs(distance.get('screen'))));
      if (closest === null) {
        return 'invalid';
      }
      const { arg: index, result } = closest;

      const line = new MemoEdge(positions[index], wall.edge.lerp(result.at));
      for (const other of App.ecs.getComponents(Wall)) {
        if (other !== wall && other.edge.intersection(line) !== null) {
          return 'invalid';
        }
      }

      return {
        wall,
        point: closure.points[index],
        normal: result.distance,
        at: result.at,
        rotation: furnitureAngle.minus(edge.tangent.angle()),
      };
    }, attach => Math.abs(Math.round(attach.normal.get('screen'))));
    return best?.result || null;
  }

  private updateAttachRotation() {
    if (this.updatingOrientation) return;
    const attach = this.attach;
    if (attach === null) return;
    const rotation = this.rect.rotation;
    attach.rotation = rotation.minus(attach.wall.edge.tangent.angle());
  }

  private updateAttachPosition() {
    if (this.updatingOrientation) return;
    const attach = this.attach;
    if (attach === null) return;
    const position = attach.point.get();
    const edge = attach.wall.edge;
    attach.at = edge.unlerp(position);
    attach.normal = edge.normal.dot(Vectors.between(edge.src, position));
  }

  public get attach(): FurnitureAttach | null {
    const attach = this.attachRef.get();
    if (!attach?.wall?.entity?.isAlive) return null;
    return attach;
  }

  public set attach(a: FurnitureAttach | null) {
    this.attachRef.set(a);
  }

  override toJson(): SavedComponent {
    const attach = this.attach;
    const json: FurnitureJson = {
      attach: attach === null ? false : {
        wall: attach.wall.entity.id,
        at: attach.at,
        normal: MoreJson.distance.to(attach.normal),
        point: attach.point.name,
        rotation: MoreJson.angle.to(attach.rotation),
      },
    };
    return {
      factory: this.constructor.name,
      arguments: [ json as unknown as JsonObject ],
    };
  }
}

ComponentFactories.register(Furniture, (
  entity: Entity,
  propsJson: JsonObject,
) => {
  const props = propsJson as unknown as FurnitureJson;

  if (!entity.has(Rectangular)) {
    return 'not ready';
  }

  if (props.attach && !App.ecs.getEntity(props.attach.wall)?.has(Wall)) {
    return 'not ready';
  }

  const furniture = entity.getOrCreate(Furniture);
  if (props.attach) {
    const attach = props.attach;
    furniture.attach = !attach ? null : {
      wall: App.ecs.getEntity(attach.wall)!.only(Wall),
      at: attach.at,
      normal: MoreJson.distance.from(attach.normal),
      point: entity.only(Handle).getDragClosure('complete').points
        .filter(p => p.name === attach.point)[0]!,
      rotation: MoreJson.angle.from(attach.rotation),
    };
  }
  return furniture;
});


const FurnitureRenderer = (ecs: EntityComponentSystem) => {
  // most of the heavy-lifting is actually done by the rectangle and image
  // renderers! this is 90% to handle the UI while dragging and stuff.
  for (const furniture of ecs.getComponents(Furniture)) {
    const handle = furniture.entity.only(Handle);
    if (!handle.isActive) continue;

    const attach = furniture.attach;
    if (attach !== null) {
      const edge = attach.wall.edge;
      App.canvas.strokeStyle = PINK;
      App.canvas.lineWidth = 2;
      App.canvas.setLineDash([4, 2]);
      App.canvas.strokeLine(
        attach.point.get(),
        edge.lerp(attach.at),
      );
      App.canvas.lineWidth = 1;
      App.canvas.setLineDash([]);
    }
  }
};

