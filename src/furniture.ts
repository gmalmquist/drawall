interface FurnitureJson {
  attach: {
    wall: Eid,
    at: number,
    normal: JsonObject,
    point: string,
    rotation: JsonObject,
  } | false,
  furnitureType: FurnitureType,
  flippedHorizontal: boolean,
  flippedVertical: boolean,
}

interface FurnitureAttach {
  wall: Wall;
  at: number;
  normal: Distance;
  point: DragPoint;
  rotation: Angle;
}

interface FurnitureTypeProps {
  flippable: boolean;
  keepOnWall: boolean;
  onInit: (f: Furniture) => void;
}

const createFurnitureType = (atts: Partial<FurnitureTypeProps>): FurnitureTypeProps => ({
  flippable: false,
  keepOnWall: false,
  onInit: (_: Furniture) => {/* noop */},
  ...atts,
});

//  'image' | 'plain' | 'wood' | 'door' | 'window';
const FurnitureTypes = {
  plain: createFurnitureType({}),
  wood: createFurnitureType({}),
  door: createFurnitureType({
    keepOnWall: true,
    flippable: true,
  }),
  window: createFurnitureType({
    keepOnWall: true,
  }),
  image: createFurnitureType({
    onInit: (f: Furniture) => {
      if (!f.entity.has(Imaged)) {
        f.entity.add(Imaged, 'furniture').showUploadForm();
      }
    },
  }),
};

type FurnitureType = (keyof typeof FurnitureTypes) & string;

class Furniture extends Component implements Solo {
  public readonly [SOLO] = true;

  public static readonly defaultFurnitureType= Refs.of<FurnitureType>('wood');

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
  public readonly furnitureTypeRef: Ref<FurnitureType>;
  public readonly flippedHorizontalRef = Refs.of<boolean>(false);
  public readonly flippedVerticalRef = Refs.of<boolean>(false);

  private readonly attachAllowedRef: RoRef<(name: string) => boolean>;
  private updatingOrientation: boolean = false;

  constructor(entity: Entity, furnitureType: FurnitureType) {
    super(entity);
    this.rect = entity.getOrCreate(Rectangular);
    this.rect.createHandle({
      priority: 2,
      visible: () => {
        if (App.tools.current.name === 'furniture tool') {
          return true;
        }
        if (this.furnitureType === 'door' || this.furnitureType === 'window') {
          return App.settings.showDoors.get();
        }
        return App.settings.showFurniture.get();
      },
    });

    this.furnitureTypeRef = Refs.of(furnitureType);

    this.attachAllowedRef = Refs.mapRo(this.furnitureTypeRef, m => {
      if (FurnitureTypes[m].keepOnWall) {
        return (name: string) => name === 'center';
      }
      return (_: string) => true;
    });

    const labelLine = Refs.memoReduce(
      (center, axis, width) => new MemoEdge(
        center.splus(width.scale(0.1), axis.neg()),
        center.splus(width.scale(0.1), axis),
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
      visible: () => {
        if (this.furnitureType === 'door' || this.furnitureType === 'window') {
          return false;
        }
        if (App.tools.current.name === 'furniture tool') {
          return true;
        }
        return App.settings.showFurniture.get();
      },
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
        value: this.furnitureTypeRef,
        items: [
          { value: 'plain', icon: Icons.plain, },
          { value: 'wood', icon: Icons.wood, },
          { value: 'image', icon: Icons.image, },
          { value: 'door', icon: Icons.door, },
          { value: 'window', icon: Icons.window, },
        ],
      });
      form.addButton({
        name: 'Flip Horizontally (f)',
        icon: Icons.flipH,
        enabled: Refs.mapRo(this.furnitureTypeRef, f => FurnitureTypes[f].flippable),
        onClick: () => this.flip('horizontal'),
      });
      form.addButton({
        name: 'Flip Vertically (Shift + F)',
        icon: Icons.flipV,
        enabled: Refs.mapRo(this.furnitureTypeRef, f => FurnitureTypes[f].flippable),
        onClick: () => this.flip('vertical'),
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

    this.furnitureTypeRef.onChange(m => {
      const hadImage = entity.has(Imaged);
      if (m !== 'image') {
        entity.removeAll(Imaged);
      }

      FurnitureTypes[m].onInit(this);

      if (hadImage !== entity.has(Imaged)) {
        App.ui.updateForms();
      }

      Furniture.defaultFurnitureType.set(m);

      this.applyFurnitureTypeConstraints();
      App.project.requestSave('changed furniture type');
    });

    this.flippedHorizontalRef.onChange(_ => App.project.requestSave('flipped furniture'));
    this.flippedVerticalRef.onChange(_ => App.project.requestSave('flipped furniture'));

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
        const atts = FurnitureTypes[this.furnitureType];
        if (atts.keepOnWall) {
          this.centerOnWall(true);
        }
      },
      onEnd: (_e, _c) => {
        this.attach = this.findAttach();
        this.applyFurnitureTypeConstraints();
      },
    });

    this.rect.rotationRef.onChange(() => {
      this.updateAttachRotation();
      this.updateAttachPosition();
    });
    this.rect.centerRef.onChange(() => this.updateAttachPosition());
    this.rect.widthRef.onChange(() => this.updateAttachPosition());
    this.rect.heightRef.onChange(() => this.updateAttachPosition());

    this.applyFurnitureTypeConstraints();

    if (this.furnitureType === 'image' && !entity.has(Imaged)) {
      entity.add(Imaged, 'furniture', this.rect).showUploadForm();
    }
  }

  public applyFurnitureTypeConstraints() {
    const furnitureType = this.furnitureType;
    const atts = FurnitureTypes[furnitureType];
    if (atts.keepOnWall) {
      this.rect.allowResizeV.set(false);
      this.rect.allowRotate.set(false);
      this.rect.height = Distance(
        App.project.modelUnit.from({ value: 2, unit: 'inch' }).value,
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

  public flip(axis: 'vertical' | 'horizontal') {
    if (axis === 'horizontal') {
      this.flippedHorizontalRef.set(!this.flippedHorizontalRef.get());
      return;
    }
    if (axis === 'vertical') {
      this.flippedVerticalRef.set(!this.flippedVerticalRef.get());
      return;
    }
    return impossible(axis);
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
    return this.entity.only(Handle)
      .getDragClosure('complete').points
      .filter(p => this.attachAllowed(p.name));
  }

  private findAttach(): FurnitureAttach | null {
    const epsDistance = Distance(0.1, 'model');
    const points = this.getDragPoints();
    const positions = points.map(p => p.get());
    const pointOrdering = points.map((_, i) => i);
    const furnitureAngle = this.rect.rotation;
    reverseInPlace(pointOrdering); // ensure midpoints come first

    const keepOnWall = FurnitureTypes[this.furnitureType].keepOnWall;

    const best = argmin(App.ecs.getComponents(Wall), wall => {
      const edge = wall.entity.only(PhysEdge).edge;
      const wallToCenter = Vectors.between(edge.midpoint, this.rect.center);
      
      const closest = argmin(pointOrdering, i => {
        const p = positions[i];
        const s = edge.unlerp(p);
        if (s < 0 || s > 1) return 'invalid';
        const d = Vectors.between(edge.src, p).dot(edge.normal);
        if (!keepOnWall && d.gt(epsDistance)) {
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
        point: points[index],
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

  private attachAllowed(name: string): boolean {
    const filter = this.attachAllowedRef.get();
    return filter(name);
  }

  public get furnitureType(): FurnitureType {
    return this.furnitureTypeRef.get();
  }

  public set furnitureType(m: FurnitureType) {
    this.furnitureTypeRef.set(m);
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
      furnitureType: this.furnitureType,
      flippedHorizontal: this.flippedHorizontalRef.get(),
      flippedVertical: this.flippedVerticalRef.get(),
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

  if (props.furnitureType === 'image' && !entity.has(Imaged)) {
    return 'not ready';
  }

  if (props.attach && !App.ecs.getEntity(props.attach.wall)?.has(Wall)) {
    return 'not ready';
  }

  const furniture = entity.getOrCreate(
    Furniture,
    props.furnitureType || 'plain',
  );

  if (props.furnitureType) {
    // possibly not redundant with above, if we're in the "get"
    // part of "getOrCreate".
    furniture.furnitureType = props.furnitureType;
  }

  furniture.flippedHorizontalRef.set(!!propsJson.flippedHorizontal);
  furniture.flippedVerticalRef.set(!!propsJson.flippedVertical);

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
  const showFurniture = App.tools.current.name === 'furniture tool'
    || App.settings.showFurniture.get();
  const showDoors = App.tools.current.name === 'furniture tool'
    || App.settings.showDoors.get();
  const showDoorArcs = App.tools.current.name === 'furniture tool'
    || App.settings.showDoorArcs.get();

  const renderFurnitureType = (furniture: Furniture) => {
    const rect = furniture.rect;
    const furnitureType = furniture.furnitureType;

    const drawNarrow = (pixels: number) => {
      const rect = furniture.rect;
      const origin = Positions.zero('screen');
      const vertical = rect.verticalAxis.to('screen').unit().scale(pixels);
      const horizontal = rect.rightRad.to('screen');
      App.canvas.beginPath();
      App.canvas.moveTo(origin.plus(horizontal).plus(vertical));
      App.canvas.lineTo(origin.plus(horizontal).plus(vertical.neg()));
      App.canvas.lineTo(origin.minus(horizontal).plus(vertical.neg()));
      App.canvas.lineTo(origin.minus(horizontal).plus(vertical));
      App.canvas.closePath();
    };

    App.canvas.lineWidth = 1;
    App.canvas.setLineDash([]);
    if (furnitureType === 'plain' && showFurniture) {
      App.canvas.lineWidth = 2;
      App.canvas.fillStyle = 'lightgray';
      App.canvas.strokeStyle = 'darkgray';
      App.canvas.polygon(rect.polygon);
      App.canvas.fill();
      App.canvas.stroke();
    } else if (furnitureType === 'wood' && showFurniture) {
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
    } else if (furnitureType === 'door' && showDoors) {
      App.canvas.pushTransform();
      App.canvas.translateTo(rect.center);
      App.canvas.rotate(Angle(
        furniture.flippedVerticalRef.get() ? Radians(Math.PI) : Radians(0),
        'screen',
      ));

      App.canvas.lineWidth = 1;
      App.canvas.strokeStyle = 'black';
      drawNarrow(5);
      App.canvas.stroke();

      // draw white rect to 'break' the attached wall
      App.canvas.pushTransform();
      App.canvas.translate(rect.verticalAxis.to('screen').unit().scale(8));
      drawNarrow(16);
      App.canvas.fillStyle = 'white';
      App.canvas.fill();
      App.canvas.popTransform();

      App.canvas.fillStyle = '#dedede';
      drawNarrow(5);
      App.canvas.fill();

      if (furniture.entity.only(Handle).isActive) {
        drawNarrow(5);
        App.canvas.stroke();
      }
      
      if (showDoorArcs) {
        // doors... open o:
        App.canvas.lineWidth = 2;
        App.canvas.setLineDash([4, 4]);
        App.canvas.strokeStyle = 'gray';

        App.canvas.beginPath();
        const origin = Positions.zero('screen');
        if (furniture.flippedHorizontalRef.get() !== furniture.flippedVerticalRef.get()) {
          const startAngle = rect.horizontalAxis.to('screen').neg().angle().normalize();
          const startPos = origin.plus(rect.rightRad);
          App.canvas.arc(
            startPos,
            rect.width,
            startAngle,
            startAngle.plus(Angle(Radians(Math.PI/2), 'screen')).normalize(),
            false,
          );
          App.canvas.stroke();
          App.canvas.setLineDash([]);
          App.canvas.lineWidth = 1;
          App.canvas.strokeLine(startPos, startPos.splus(rect.width, rect.upRad.to('screen').unit()));
        } else {
          const startAngle = rect.horizontalAxis.to('screen').angle();
          const startPos = origin.plus(rect.leftRad);
          App.canvas.arc(
            startPos,
            rect.width,
            startAngle,
            startAngle.minus(Angle(Radians(Math.PI/2), 'screen')).normalize(),
            true,
          );
          App.canvas.stroke();
          App.canvas.setLineDash([]);
          App.canvas.lineWidth = 1;
          App.canvas.strokeLine(startPos, startPos.splus(rect.width, rect.upRad.to('screen').unit()));
        }
      }
      App.canvas.popTransform();
    } else if (furnitureType === 'window' && showDoors) {
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
      App.canvas.pushTransform();
      App.canvas.translateTo(rect.center);
      drawNarrow(3);
      App.canvas.fill();
      App.canvas.stroke();
      App.canvas.popTransform();
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

    if (furniture.furnitureType !== 'window' && furniture.furnitureType !== 'door') {
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
      renderFurnitureType(furniture);
    }

    renderLabel(furniture);

    if (!handle.isActive) continue;
    renderAttachment(furniture);
    renderActive(furniture);
  }
};

