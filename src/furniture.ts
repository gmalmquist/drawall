interface FurnitureJson {
  attach: {
    wall: Eid,
    at: number,
    normal: JsonObject,
    point: string,
    rotation: JsonObject,
  } | false,
  material: FurnitureMaterial,
}

interface FurnitureAttach {
  wall: Wall;
  at: number;
  normal: Distance;
  point: DragPoint;
  rotation: Angle;
}

// tbh i knew immediately when making this union type that i was gonna end up with shit
// like 'door' in it. whatevs. it's fine. it's valid to be made of door.
type FurnitureMaterial = 'image' | 'plain' | 'wood' | 'door' | 'window';

class Furniture extends Component implements Solo {
  public readonly [SOLO] = true;

  private static defaultMaterial: FurnitureMaterial = 'wood';

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
  public readonly labelHandle: Handle;
  public readonly materialRef = Refs.of<FurnitureMaterial>(Furniture.defaultMaterial);
  public readonly flippedRef = Refs.of<boolean>(false);

  private updatingOrientation: boolean = false;

  constructor(entity: Entity) {
    super(entity);
    this.rect = entity.getOrCreate(Rectangular);
    this.rect.createHandle({
      priority: 2,
    });

    const labelLine = Refs.memoReduce(
      (center, axis, width) => new MemoEdge(
        center.splus(width.scale(0.25), axis.neg()),
        center.splus(width.scale(0.25), axis),
      ),
      this.rect.centerRef, this.rect.horizontalAxisRef, this.rect.widthRef,
    );
    this.labelHandle = entity.ecs.createEntity().add(Handle, {
      clickable: true,
      hoverable: true,
      selectable: false,
      draggable: false,
      control: true,
      getPos: () => this.rect.center,
      distance: p => labelLine.get().distanceFrom(p),
      priority: 4,
      visible: () => this.material !== 'door' && this.material !== 'window',
    });
    this.labelHandle.events.onMouse('click', () => {
      Popup.input({
        title: 'Furniture Name',
        text: this.nameRef,
        position: App.ui.mousePos,
      });
    });

    entity.add(Form, () => {
      const form = new AutoForm();
      form.addSelect({
        name: 'Furniture Type',
        value: this.materialRef,
        items: [
          { value: 'plain', icon: Icons.plain, },
          { value: 'wood', icon: Icons.wood, },
          { value: 'image', icon: Icons.image, },
          { value: 'door', icon: Icons.door, },
          { value: 'window', icon: Icons.window, },
        ],
      });
      form.add({
        kind: 'toggle',
        name: 'Flip',
        value: this.flippedRef,
      });
      form.addButton({
        name: 'Align to Wall',
        icon: Icons.alignToWall,
        enabled: Refs.mapRo(this.attachRef, a => !!a?.wall?.entity?.isAlive),
        onClick: () => this.alignToWall(),
      });
      form.addButton({
        name: 'Place on Wall',
        icon: Icons.moveToWall,
        enabled: Refs.mapRo(this.attachRef, a => !!a?.wall?.entity?.isAlive),
        onClick: () => this.placeOnWall(),
      });
      form.addButton({
        name: 'Center on Wall',
        icon: Icons.centerOnWall,
        enabled: Refs.mapRo(this.attachRef, a => !!a?.wall?.entity?.isAlive),
        onClick: () => this.centerOnWall(),
      });
      form.addButton({
        name: 'Move to Corner',
        icon: Icons.moveToCorner,
        enabled: Refs.mapRo(this.attachRef, a => !!a?.wall?.entity?.isAlive),
        onClick: () => this.moveToCorner(),
      });
      return form;
    });

    const edgeListeners = new Map<Wall, (edge: MemoEdge) => void>();

    this.materialRef.onChange(m => {
      const hadImage = entity.has(Imaged);
      if (m === 'image') {
        const img = entity.getOrCreate(Imaged, 'furniture');
        img.showUploadForm();
      } else {
        entity.removeAll(Imaged);
      }
      if (hadImage !== entity.has(Imaged)) {
        App.ui.updateForms();
      }
      Furniture.defaultMaterial = m === 'image' ? 'wood' : m;
      this.applyMaterialConstraints();
      App.project.requestSave('changed furniture material');
    });

    this.flippedRef.onChange(_ => App.project.requestSave('flipped furniture'));

    this.attachRef.onChange(a => {
      if (a === null) return;
      if (!edgeListeners.has(a.wall)) {
        edgeListeners.set(a.wall, edge => {
          if (this.attach?.wall !== a.wall) return;
          this.updateOrientation();
        });
      }
      a.wall.edgeRef.onChange(edgeListeners.get(a.wall)!);
      App.project.requestSave('attached to wall');
    });

    this.entity.only(Handle).events.addDragListener({
      onStart: e => {
        return true;
      },
      onUpdate: (_e, _c) => {
        this.attach = this.findAttach();
        if (this.material === 'door' || this.material === 'window') {
          this.centerOnWall(true);
        }
      },
      onEnd: (_e, _c) => {
        this.attach = this.findAttach();
        this.applyMaterialConstraints();
      },
    });

    this.rect.rotationRef.onChange(() => {
      this.updateAttachRotation();
      this.updateAttachPosition();
    });
    this.rect.centerRef.onChange(() => this.updateAttachPosition());
    this.rect.widthRef.onChange(() => this.updateAttachPosition());
    this.rect.heightRef.onChange(() => this.updateAttachPosition());

    this.applyMaterialConstraints();
  }

  private applyMaterialConstraints() {
    const material = this.material;
    if (material === 'door' || material === 'window') {
      this.rect.allowResizeV.set(false);
      this.rect.allowRotate.set(false);
      this.rect.height = Distance(
        App.project.modelUnit.from({ value: 2, unit: 'in' }).value,
        'model',
      );
    } else {
      this.rect.allowResizeV.set(true);
      this.rect.allowRotate.set(true);
    }
  }

  public placeOnWall(alwaysAlign?: boolean) {
    const attach = this.attach;
    if (!attach) return;
    const edge = attach.wall.edge;
    if (alwaysAlign || attach.normal.sign === 0) {
      this.rect.rotation = edge.tangent.neg().angle();
    }
    const highest = argmin(
      this.getDragPoints(),
      point => point,
      point => -Math.round(Vectors.between(edge.src, point.get())
        .dot(edge.normal).get('screen'))
    );
    if (highest !== null) {
      attach.point = highest.arg;
      attach.normal = Distance(0, 'model');
      attach.at = edge.unlerp(attach.point.get());
      this.updateOrientation();
    }
  }

  public centerOnWall(alwaysAlign?: boolean) {
    const attach = this.attach;
    if (!attach) return;
    const edge = attach.wall.edge;
    if (alwaysAlign || attach.point.name === 'center' && attach.normal.sign === 0) {
      attach.rotation = Angle(Radians(Math.PI), 'model');
    }
    attach.point = this.entity.only(Handle).getDragClosure('complete').points
      .filter(p => p.name === 'center')[0]!;
    attach.normal = Distance(0, 'model');
    attach.at = edge.unlerp(attach.point.get());
    this.updateOrientation();
  }

  public moveToCorner() {
    const attach = this.attach;
    if (!attach) return;
    const points = this.getDragPoints();
    if (points.length === 0) return;

    const normalDistance = (edge: MemoEdge, point: DragPoint) =>
      Vectors.between(edge.src, point.get()).dot(edge.normal).neg();

    const getClosestPoint = (edge: MemoEdge, normal: boolean) => argmin(
      points,
      point => ({
        point,
        distance: normal ? normalDistance(edge, point) : edge.distanceFrom(point.get()),
      }),
      ({ distance }) => Math.round(distance.get('screen')),
    )!.result;

    const edge = attach.wall.edge;
    const adj1 = attach.wall.src.incoming?.edge;
    const adj2 = attach.wall.dst.outgoing?.edge;
    const adj = argmin([adj1, adj2], edge => {
      if (!edge) return 'invalid';
      const { point, distance } = getClosestPoint(edge, false);
      return { edge, point, distance };
    }, ({ distance }) => Math.round(distance.get('screen')))?.result;

    if (!adj) return;

    const edgiest = getClosestPoint(edge, true).point;
    const adjiest = getClosestPoint(adj.edge, true).point;
    
    adjiest.set(adj.edge.closestPoint(adjiest.get()));
    attach.point = edgiest;
    attach.normal = Distance(0, 'model');
    attach.at = edge.unlerp(edgiest.get());
    this.updateOrientation();
  }

  public alignToWall() {
    const attach = this.attach;
    if (!attach) return;
    this.rect.rotation = attach.wall.edge.tangent.neg().angle();
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

  private getDragPoints(): DragPoint[] {
    return this.entity.only(Handle).getDragClosure('complete').points;
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

  public get material(): FurnitureMaterial {
    return this.materialRef.get();
  }

  public set material(m: FurnitureMaterial) {
    this.materialRef.set(m);
  }

  public get attach(): FurnitureAttach | null {
    const attach = this.attachRef.get();
    if (!attach?.wall?.entity?.isAlive) return null;
    return attach;
  }

  public set attach(a: FurnitureAttach | null) {
    this.attachRef.set(a);
  }

  override tearDown() {
    this.labelHandle.entity.destroy();
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
      material: this.material,
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
  if (props.material) {
    furniture.material = props.material;
  }
  return furniture;
});

const FurnitureRenderer = (ecs: EntityComponentSystem) => {
  const renderMaterial = (furniture: Furniture) => {
    const rect = furniture.rect;
    const material = furniture.material;

    const drawNarrow = (pixels: number) => {
      const thickness = Distance(pixels, 'screen');
      const rect = furniture.rect;
      App.canvas.beginPath();
      App.canvas.moveTo(rect.left.splus(thickness, rect.verticalAxis));
      App.canvas.lineTo(rect.left.splus(thickness, rect.verticalAxis.neg()));
      App.canvas.lineTo(rect.right.splus(thickness, rect.verticalAxis.neg()));
      App.canvas.lineTo(rect.right.splus(thickness, rect.verticalAxis));
      App.canvas.closePath();
      App.canvas.fill();
      App.canvas.stroke();
    };

    App.canvas.lineWidth = 1;
    App.canvas.setLineDash([]);
    if (material === 'plain') {
      App.canvas.lineWidth = 2;
      App.canvas.fillStyle = 'lightgray';
      App.canvas.strokeStyle = 'darkgray';
      App.canvas.polygon(rect.polygon);
      App.canvas.fill();
      App.canvas.stroke();
    } else if (material === 'wood') {
      App.canvas.lineWidth = 2;
      App.canvas.fillStyle = 'hsl(30, 60%, 60%)';
      App.canvas.strokeStyle = 'hsl(30, 60%, 30%)';
      App.canvas.polygon(rect.polygon);
      App.canvas.fill();
      App.canvas.stroke();

      App.canvas.lineWidth = 1;
      const margin = Distance(10, 'screen').min(rect.height.scale(0.5));
      const inset1 = Distance(20, 'screen').min(rect.width);
      const inset2 = Distance(60, 'screen').min(rect.width);
      const mg = (v: Vector) => v.minus(v.unit().scale(margin));
      App.canvas.strokeLine(
        rect.left.splus(inset1, rect.horizontalAxis).plus(mg(rect.upRad)),
        rect.right.splus(inset2.neg(), rect.horizontalAxis).plus(mg(rect.upRad)),
      );
      App.canvas.strokeLine(
        rect.left.splus(inset2, rect.horizontalAxis).plus(mg(rect.downRad)),
        rect.right.splus(inset1.neg(), rect.horizontalAxis).plus(mg(rect.downRad)),
      );
    } else if (material === 'door') {
      App.canvas.lineWidth = 1;
      App.canvas.strokeStyle = 'black';
      App.canvas.fillStyle = 'white';
      drawNarrow(5);

      // doors... open o:
      App.canvas.lineWidth = 2;
      App.canvas.setLineDash([4, 4]);
      App.canvas.strokeStyle = 'gray';
      App.canvas.beginPath();
      if (furniture.flippedRef.get()) {
        const startAngle = rect.horizontalAxis.to('screen').neg().angle().normalize();
        App.canvas.arc(
          rect.right,
          rect.width,
          startAngle,
          startAngle.plus(Angle(Radians(Math.PI/2), 'screen')).normalize(),
          false,
        );
      } else {
        const startAngle = rect.horizontalAxis.to('screen').angle();
        App.canvas.arc(
          rect.left,
          rect.width,
          startAngle,
          startAngle.minus(Angle(Radians(Math.PI/2), 'screen')).normalize(),
          true,
        );
      }
      App.canvas.stroke();
      App.canvas.setLineDash([]);
    } else if (material === 'window') {
      App.canvas.lineWidth = 1;
      App.canvas.strokeStyle = 'black';
      // sill
      const sill = Distance(4, 'screen');
      const sillh = rect.horizontalAxis.scale(sill);
      const sillv = rect.verticalAxis.neg().scale(sill).scale(2);
      App.canvas.fillStyle = 'white';
      App.canvas.beginPath();
      App.canvas.moveTo(rect.left.minus(sillh));
      App.canvas.lineTo(rect.left.minus(sillh).plus(sillv));
      App.canvas.lineTo(rect.right.plus(sillh).plus(sillv));
      App.canvas.lineTo(rect.right.plus(sillh));
      App.canvas.closePath();
      App.canvas.fill();
      App.canvas.stroke();
      // frame
      App.canvas.fillStyle = 'lightgray';
      drawNarrow(3);
    }
    App.canvas.lineWidth = 1; App.canvas.setLineDash([]);
  };

  const renderAttachment = (furniture: Furniture) => {
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
  };

  const renderActive = (furniture: Furniture) => {
    const rect = furniture.rect;
    App.canvas.polygon(rect.polygon.pad(
      Distance(3, 'screen'),
      rect.rightRad,
      rect.upRad,
    ));

    App.canvas.setLineDash([8, 4]);
    App.canvas.lineWidth = 1;
    App.canvas.strokeStyle = BLUE;
    App.canvas.stroke();

    App.canvas.text({
      text: App.project.formatDistance(rect.width),
      fill: BLUE,
      align: 'center',
      baseline: 'middle',
      point: rect.top.splus(Distance(App.settings.fontSize, 'screen'), rect.upRad.unit()),
      axis: rect.rightRad,
      keepUpright: true,
    });

    if (furniture.material !== 'window' && furniture.material !== 'door') {
      App.canvas.text({
        text: App.project.formatDistance(rect.height),
        fill: BLUE,
        align: 'center',
        baseline: 'middle',
        point: rect.left.splus(Distance(App.settings.fontSize, 'screen'), rect.leftRad.unit()),
        axis: rect.upRad,
        keepUpright: true,
      });
    }

    App.canvas.lineWidth = 1;
    App.canvas.setLineDash([]);
  };

  const renderLabel = (furniture: Furniture) => {
    if (!furniture.labelHandle.visible) return;
    const rect = furniture.rect;
    const draw = (fill: string, offset: Vector = Vectors.zero('screen')) => App.canvas.text({
      text: furniture.name,
      point: rect.center.to('screen').plus(offset),
      axis: rect.horizontalAxis,
      keepUpright: true,
      align: 'center',
      baseline: 'middle',
      fill,
    });
    const active = furniture.labelHandle.isHovered;
    if (active) {
      const baseline = rect.center.splus(
        Distance(App.settings.fontSize/2, 'screen'),
        rect.verticalAxis.scale(rect.verticalAxis.dot(Vector(Axis.Y, 'screen')).sign),
      );
      App.canvas.lineWidth = 1;
      App.canvas.strokeStyle = BLUE;
      App.canvas.strokeLine(
        baseline.splus(0.75, rect.leftRad),
        baseline.splus(0.75, rect.rightRad),
      );

      draw(PINK, Vector(new Vec(-1, -1), 'screen'));
      draw(PINK, Vector(new Vec(1, -1), 'screen'));
      draw(BLUE, Vector(new Vec(-1, 1), 'screen'));
      draw(BLUE, Vector(new Vec(1, 1), 'screen'));
    }
    draw(active ? 'white' : 'black');
  };

  for (const furniture of ecs.getComponents(Furniture)) {
    const handle = furniture.entity.only(Handle);

    if (!furniture.entity.has(Imaged)) {
      renderMaterial(furniture);
    }

    renderLabel(furniture);

    if (!handle.isActive) continue;
    renderAttachment(furniture);
    renderActive(furniture);
  }
};

