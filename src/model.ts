class PhysNode extends Component implements Solo {
  readonly [SOLO] = true;

  private _pos: Point = Point.ZERO;
  private velocity: Vec = Vec.ZERO;
  private acceleration: Vec = Vec.ZERO;
  private forceAccum: Vec = Vec.ZERO;
  private mass: number = 1.0;
  private dragFactor: number = 0.5;

  constructor(
    entity: Entity,
    private readonly getPos?: () => Point,
    private readonly setPos?: (p: Point) => void) {
    super(entity);
  }

  get pos(): Point {
    return typeof this.getPos === 'undefined' ? this._pos : this.getPos();
  }

  set pos(p: Point) {
    if (typeof this.setPos !== 'undefined') {
      this.setPos(p);
    } else {
      this._pos = p;
    }
  }

  update() {
    const dt = Time.delta;

    // fake physics: if there are no forces, we don't move
    if (this.forceAccum.mag() < 0.1) {
      this.velocity = Vec.ZERO;
    }

    const dragForce = this.velocity.scale(-this.dragFactor * this.velocity.mag());

    this.velocity = this.velocity.splus(dt / this.mass, dragForce);
    this.velocity = this.velocity.splus(dt, this.acceleration);
    this.velocity = this.velocity.splus(dt / this.mass, this.forceAccum);
    this.pos = this.pos.splus(dt, this.velocity);
    this.forceAccum = Vec.ZERO;
  }

  addForce(f: Vec) {
    this.forceAccum = this.forceAccum.plus(f);
  }
}

class Wall extends Component implements Solo {
  public readonly [SOLO] = true;
  private _src: WallJoint;
  private _dst: WallJoint;

  constructor(entity: Entity) {
    super(entity);
    this._src = entity.ecs.createEntity().add(WallJoint);
    this._dst = entity.ecs.createEntity().add(WallJoint);
    this.src.attachOutgoing(this);
    this.dst.attachIncoming(this);

    const handle = entity.add(Handle, {
      getPos: () => Position(this.src.pos, 'model'),
      setPos: p => {
      },
      distance: (pt: Position) => Distance(
        new Edge(this.src.pos, this.dst.pos).distance(pt.get('model')),
        'model',
      ),
      priority: 0,
    });
    handle.onClick(({ point }) => this.showPopup(point));
    handle.onDrag({
      onStart: (e): [Point, Point] => {
        return [this.src.pos, this.dst.pos];
      },
      onUpdate: (e, [src, dst]) => {
        const delta = e.delta.get('model');
        const srcLocked = this.src.entity.get(FixedConstraint).some(f => f.enabled);
        const dstLocked = this.dst.entity.get(FixedConstraint).some(f => f.enabled);
        if (srcLocked && !dstLocked) {
          const start = e.start.get('model');
          const point = e.point.get('model');
          const initial = Vec.between(src, start);
          const current = Vec.between(src, point);
          const angle = current.angle() - initial.angle();
          this.dst.pos = src.plus(Vec.between(src, dst).rotate(angle));
        } else if (!srcLocked && dstLocked) {
          const start = e.start.get('model');
          const point = e.point.get('model');
          const initial = Vec.between(dst, start);
          const current = Vec.between(dst, point);
          const angle = current.angle() - initial.angle();
          this.src.pos = dst.plus(Vec.between(dst, src).rotate(angle));
        } else {
          this.src.pos = src.plus(delta);
          this.dst.pos = dst.plus(delta);
        }
      },
      onEnd: (e, [src, dst]) => {
      },
    });

    entity.add(LengthConstraint,
      () => this.src.entity.only(PhysNode),
      () => this.dst.entity.only(PhysNode),
      100,
    );

    entity.add(MinLengthConstraint,
      () => this.src.entity.only(PhysNode),
      () => this.dst.entity.only(PhysNode),
    );
  }

  get src() { return this._src; }
  get dst() { return this._dst; }

  set src(j: WallJoint) {
    if (j === this._src) return;
    this._src.detachOutgoing();
    this._src = j;
    j.attachOutgoing(this);
  }

  set dst(j: WallJoint) {
    if (j === this._dst) return;
    this._dst.detachIncoming();
    this._dst = j;
    j.attachIncoming(this);
  }

  getLength(): Distance {
    return Distance(Vec.between(this.src.pos, this.dst.pos).mag(), 'model');
  }

  showPopup(openAt: Position) {
    this.entity.removeAll(PopupWindow);
    const p = this.entity.add(PopupWindow);
    p.setPosition(openAt);
    p.title = this.name;

    const length = this.entity.only(LengthConstraint);

    const lengthRefMap = new Map<string, LengthReference>();
    for (const wall of this.entity.ecs.getComponents(Wall)) {
      if (wall === this) continue;
      lengthRefMap.set(wall.name, {
        name: wall.name,
        getLength: () => wall.getLength(),
      });
    }

    const ui = p.getUiBuilder()
      .addCheckbox('enable', length.enabled)
      .addLabel('length', 'enable')
      .addFormattedInput(
        'length', 
        (value: string): string => {
          try {
            let measure = Units.distance.parse(value)!;
            if (measure.unit === UNITLESS) {
              measure = App.project.modelUnit.newAmount(measure.value);
            }
            return App.project.displayUnit.format(measure);
          } catch (_) {
            return value;
          }
        },
        {
          value: App.project.displayUnit.format(
            App.project.modelUnit.newAmount(
              length.enabled ? length.length : Vec.between(this.src.pos, this.dst.pos).mag())
          ),
          size: 8,
        },
      )
      .newRow()
      .addDropdown('lengthRef', {
        options: Array.from(lengthRefMap.keys()).sort().map(name => ({
          name,
          label: `length = ${name}`,
        })),
        placeholder: '-- set length equal to --',
        selected: length.lengthReference ? length.lengthReference.name : undefined,
      })
      .newRow()
      .addLabel('tension', 'tension')
      .addSlider('tension', { min: 0, max: 1, initial: length.hardness })
      .newRow();

    ui.onChange((name, value) => {
      if (name === 'length') {
        try {
          const amount = Units.distance.parse(value)!;
          const original = length.length;
          length.length = App.project.modelUnit.from(amount).value;
          if (original !== length.length) {
            length.enabled = true;
            length.lengthReference = null;
            ui.setValue('enable', 'true');
            ui.setValue('lengthRef', '');
          }
        } catch (e) {
          console.error(`could not parse distance '${value}'`);
        }
      } else if (name === 'tension') {
        length.hardness = parseFloat(value);
      } else if (name === 'enable') {
        length.enabled = value === 'true';
        ui.fireChange('length');
      } else if (name === 'lengthRef') {
        const lr = lengthRefMap.get(value);
        if (lr) {
          length.lengthReference = lr;
          length.enabled = true;
        } else {
          length.lengthReference = null;
        }
      }
    });

    ui.addResetButton();
    p.show();
  }

  tearDown() {
    this.src.detachOutgoing();
    this.dst.detachIncoming();
  }
}

class WallJoint extends Component {
  public pos: Point = Point.ZERO;
  private _outgoing: Wall | null = null;
  private _incoming: Wall | null = null;

  constructor(entity: Entity) {
    super(entity);

    const position = entity.add(
      PhysNode,
      () => this.pos,
      (pos: Point) => { this.pos = pos; },
    );

    const handle = entity.add(Handle, {
      getPos: () => Position(this.pos, 'model'),
      setPos: p => {
        this.pos = p.get('model');
        entity.get(FixedConstraint).forEach(c => c.updateTargets([this.pos]));
      },
      priority: 1,
    });
    handle.onClick(({ point }) => this.showPopup(point));

    entity.add(AngleConstraint,
      () => ({
        center: position,
        left: this.outgoing ? this.outgoing.dst.entity.only(PhysNode) : position,
        right: this.incoming ? this.incoming.src.entity.only(PhysNode) : position,
      }),
      Math.PI/2.,
    );

    entity.add(FixedConstraint,
      () => [ this.pos ],
      ([p]: Point[]) => { this.pos = p; },
    );
  }

  get isCorner(): boolean {
    return this.incoming !== null && this.outgoing !== null;
  }

  get incoming(): Wall | null {
    return this._incoming;
  }

  get outgoing(): Wall | null {
    return this._outgoing;
  }

  attachIncoming(wall: Wall) {
    this._incoming = wall;
  }

  attachOutgoing(wall: Wall) {
    this._outgoing = wall;
  }

  detachIncoming() {
    this._incoming = null;
    if (this._outgoing === null) {
      this.entity.destroy();
    }
  }

  detachOutgoing() {
    this._outgoing = null;
    if (this._incoming === null) {
      this.entity.destroy();
    }
  }

  showPopup(openAt: Position) {
    this.entity.removeAll(PopupWindow);
    const p = this.entity.add(PopupWindow);
    p.setPosition(openAt);
    p.title = this.name;
    const ui = p.getUiBuilder()
    this.createAnchorUi(ui);
    this.createAngleUi(ui);
    ui.addResetButton();
    p.show();
  }

  private createAnchorUi(ui: UiBuilder) {
    const fixed = this.entity.get(FixedConstraint)[0]!;
    ui.addCheckbox('fix', fixed.enabled)
      .addLabel('lock position', 'fix')
      .addSpacer()
      .newRow();
    ui.onChange((name, value) => {
      if (name === 'fix') {
        fixed.enabled = value === 'true';
      }
    });
  }

  private createAngleUi(ui: UiBuilder) {
    if (this.incoming === null || this.outgoing === null) {
      return;
    }
    const angleConstraint = this.entity.only(AngleConstraint);
    ui
      .addCheckbox('lock angle', angleConstraint?.enabled)
      .addLabel('angle', 'lock angle')
      .addNumberInput('angle', {
        min: 0,
        max: 360,
        value: Math.round(toDegrees(angleConstraint.enabled
          ? angleConstraint.targetAngle
          : angleConstraint.currentAngle) * 10)/10.,
        size: 4,
      })
      .addRadioGroup('units', [{ name: 'radians' }, { name: 'degrees', isDefault: true }])
      .newRow()
      .addLabel('tension', 'strength')
      .addSlider('strength', { min: 0, max: 1, initial: angleConstraint.hardness })
      .newRow();
    ui.onChange((name: string, value: string) => {
      if (name === 'angle') {
        const scale = ui.getValue('units') === 'degrees' ? Math.PI / 180 : 1;
        const prev = angleConstraint.targetAngle;
        angleConstraint.targetAngle = parseFloat(value) * scale;
        if (angleConstraint.targetAngle !== prev) {
          angleConstraint.enabled = true;
          ui.setValue('lock angle', true);
        }
      } else if (name === 'strength') {
        angleConstraint.hardness = parseFloat(value);
      } else if (name === 'units') {
        const scale = ui.getValue('units') === 'degrees' ? 180 / Math.PI : 1;
        ui.setValue('angle', angleConstraint.targetAngle * scale);
      } else if (name === 'lock angle') {
        angleConstraint.enabled = value === 'true';
        ui.fireChange('angle');
      }
    });
  }
}

class Constraint extends Component {
  private _enabled: boolean = false;

  public enforce(): void {}

  public priority: number = 0;

  // hardness between 0 and 1
  private _hardness: number = 0.5;

  constructor(entity: Entity) {
    super(entity);
    this.addKind(Constraint);
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public set enabled(enabled: boolean) {
    if (enabled === this._enabled) return;
    if (enabled) {
      this.onEnable();
    } else {
      this.onDisable();
    }
    this._enabled = enabled;
  }

  public get hardness(): number {
    return this._hardness;
  }

  public set hardness(hardness: number) {
    this._hardness = clamp01(hardness);
  }

  get influence() {
    if (!this.enabled) return 0;
    const dt = clamp01(Time.delta);
    const a = lerp(this.hardness, 0, dt);
    const b = lerp(this.hardness, dt, 1);
    return lerp(this.hardness, a, b);
  }

  // for subclasses to override
  onEnable() {}
  onDisable() {}
}

class FixedConstraint extends Constraint {
  private targets: Point[] = [];

  constructor(
    entity: Entity,
    private readonly getPoints: () => Point[],
    private readonly setPoints: (pts: Point[]) => void,
  ) {
    super(entity);
    this.hardness = 1.0;
    this.priority = 5;
    this.enabled = false;
  }

  updateTargets(pts: Point[]) {
    this.targets = pts; 
  }

  enforce() {
    const influence = this.influence;
    const points = [...this.getPoints()];
    for (let i = 0; i < points.length && i < this.targets.length; i++) {
      points[i] = points[i].lerp(influence, this.targets[i]);
    }
    this.setPoints(points);
  }

  onEnable() {
    this.targets = this.getPoints();
  }
}

class MinLengthConstraint extends Constraint {
  constructor(
    entity: Entity,
    private readonly getSrc: () => PhysNode,
    private readonly getDst: () => PhysNode,
    public length: number = App.project.modelUnit.from(App.project.gridSpacing).value,
  ) {
    super(entity);
    this.enabled = true;
    this.hardness = 1;
  }

  private get springConstant(): number {
    return this.hardness * 3;
  }

  private getEdge(): Edge {
    return new Edge(this.getSrc().pos, this.getDst().pos);
  }

  enforce() {
    if (this.entity.get(LengthConstraint).some(c => c.enabled)) {
      // only apply this constraint in the absense of another length constraint.
      return;
    }
    const edge = this.getEdge();
    if (edge === null) return;
    const delta = this.length - edge.vector().mag();
    if (delta < 0) {
      return;
    }
    const correction = edge.vector().unit().scale(delta/2 * this.springConstant);
    this.getSrc().addForce(correction.neg());
    this.getDst().addForce(correction);
  }
}

class LengthConstraint extends Constraint {
  public lengthReference: LengthReference | null = null;

  constructor(
    entity: Entity,
    private readonly getSrc: () => PhysNode,
    private readonly getDst: () => PhysNode,
    public length: number,
  ) {
    super(entity);
    this.enabled = false;
  }

  private get springConstant(): number {
    return this.hardness * 3;
  }

  private getEdge(): Edge {
    return new Edge(this.getSrc().pos, this.getDst().pos);
  }

  enforce() {
    if (this.lengthReference !== null) {
      this.length = this.lengthReference.getLength().get('model');
    }

    const edge = this.getEdge();
    if (edge === null) return;
    const delta = this.length - edge.vector().mag();
    const correction = edge.vector().unit().scale(delta/2 * this.springConstant);
    this.getSrc().addForce(correction.neg());
    this.getDst().addForce(correction);
  }

  onEnable() {
    const mag = this.getEdge()?.vector()?.mag();
    if (typeof mag !== 'undefined') {
      this.length = mag;
    }
  }
}

interface Corner {
  center: PhysNode;
  left: PhysNode;
  right: PhysNode;
}

class AngleConstraint extends Constraint {
  constructor(
    entity: Entity,
    public readonly getCorner: () => Corner,
    public targetAngle: number = Math.PI/2,
  ) {
    super(entity);
  }

  private getLeft(): Vec {
    const c = this.getCorner();
    return Vec.between(c.center.pos, c.left.pos);
  }

  private getRight(): Vec {
    const c = this.getCorner();
    return Vec.between(c.center.pos, c.right.pos);
  }

  get currentAngle(): number {
    const left = this.getLeft();
    if (left === null || left.mag2() === 0) return 0;

    const right = this.getRight();
    if (right === null || right.mag2() === 0) return 0;

    const lu = left.unit();
    const ru = right.unit();
    return normalizeRadians(lu.angle() - ru.angle());
  }

  get springConstant(): number {
    return this.hardness * 3;
  }

  enforce() {
    const left = this.getLeft();
    const right = this.getRight();
    if (left === null || right === null
      || left.mag2() === 0 || right.mag2() === 0) {
      return;
    }
    const delta = normalizeRadians(this.targetAngle) - this.currentAngle;
    const corner = this.getCorner();
    const targetLeft = corner.center.pos.plus(left.rotate(delta/2 * this.springConstant));
    const targetRight = corner.center.pos.plus(right.rotate(-delta/2 * this.springConstant));
    const deltaL = Vec.between(corner.left.pos, targetLeft);
    const deltaR = Vec.between(corner.right.pos, targetRight);
    corner.left.addForce(deltaL.scale(this.hardness));
    corner.right.addForce(deltaR.scale(this.hardness));

    if (!App.debug) return;
    App.canvas.lineWidth = 1;

    App.canvas.strokeStyle = 'green';
    App.canvas.strokeLine(Position(corner.center.pos, 'model'), Position(targetLeft, 'model'));
    App.canvas.strokeStyle = 'blue';
    App.canvas.strokeLine(Position(corner.left.pos, 'model'), Position(targetLeft, 'model'));

    App.canvas.strokeStyle = 'red';
    App.canvas.strokeLine(Position(corner.center.pos, 'model'), Position(targetRight, 'model'));
    App.canvas.strokeStyle = 'blue';
    App.canvas.strokeLine(Position(corner.left.pos, 'model'), Position(targetRight, 'model'));
  }

  onEnable() {
    this.targetAngle = this.currentAngle;
  }
}

// reference the length of something else
interface LengthReference {
  name: string;
  getLength: () => Distance;
}

interface AngleReference {
  name: string;
  getAngle: () => Angle;
}

const WallRenderer = (ecs: EntityComponentSystem) => {
  const canvas = App.canvas;

  const walls = ecs.getComponents(Wall);
  for (const wall of walls) {
    if (wall.src === null || wall.dst ===  null) continue;
    const hovered = wall.entity.get(Handle).some(h => h.isHovered);
    const active = hovered || wall.entity.get(PopupWindow).some(p => p.isVisible);
    canvas.strokeStyle = 'black';
    canvas.lineWidth = active ? 2 : 1;
    canvas.strokeLine(
      Position(wall.src.pos, 'model'),
      Position(wall.dst.pos, 'model'),
    );
    canvas.lineWidth = 1;
    const ray = new Edge(wall.src.pos, wall.dst.pos).ray();
    const tickSpacing = Distance(10, 'screen');
    const tickSize = Distance(10, 'screen');
    const ticks = Math.floor(
      Distance(ray.direction.mag(), 'model').get('screen') 
      / tickSpacing.get('screen')
    );
    for (let i = 0; i < ticks; i++) {
      const s = 1.0 * i / ticks;
      const p = ray.at(s);
      const v = ray.direction.unit()
        .scale(tickSize.get('model'))
        .rotate(30 * Math.PI / 180);
      canvas.strokeLine(Position(p, 'model'), Position(p.plus(v), 'model'));
    }

    const constraint = wall.entity.only(LengthConstraint);
    const length = Vec.between(wall.src.pos, wall.dst.pos).mag();
    const error = constraint?.enabled ? length - constraint.length : 0;
    const dispLength = App.project.displayUnit.from(
      App.project.modelUnit.newAmount(Math.round(length))
    );
    const dispError = App.project.modelUnit.newAmount(error);
    dispError.value = Math.round(dispError.value);
    const hasError = Math.abs(dispError.value) > 0;
    const lengthText = App.project.displayUnit.format(dispLength);
    const errorTextU = App.project.displayUnit.format(dispError);
    const errorText = dispError.value >= 0 ? `+${errorTextU}` : errorTextU;
    const label = hasError ? `${lengthText} (${errorText})` : lengthText;
    const textOffset = Distance(10, 'screen');
    const textPosition = Position(ray.at(0.5), 'model').apply(
      (o: Point, s: number, v: Vec) => o.splus(s, v),
      textOffset.apply(t => -t),
      Vector(ray.direction.r90().unit(), 'model'),
    );
    canvas.text({
      point: textPosition,
      axis: Vector(ray.direction, 'model'),
      keepUpright: true,
      text: label,
      fill: 'black',
      shadow: hasError ? (dispError.value > 0 ? PINK : BLUE) : undefined,
      align: 'center',
      baseline: 'middle',
    });

    if (App.ecs.getComponents(Popup).some(p => p.isVisible)) {
      canvas.text({
        point: textPosition.apply(
          (o: Point, s: number, v: Vec) => o.splus(s, v),
          Distance(-15, 'screen'),
          Vector(ray.direction.r90().unit(), 'model'),
        ),
        axis: Vector(ray.direction, 'model'),
        keepUpright: true,
        text: wall.name,
        fill: 'black',
        align: 'center',
        baseline: 'middle',
      });
    }
  }
};

const WallJointRenderer = (ecs: EntityComponentSystem) => {
  const joints = ecs.getComponents(WallJoint);
  const canvas = App.canvas;
  for (const joint of joints) {
    const hovered = joint.entity.get(Handle).some(h => h.isHovered);
    const active = hovered || joint.entity.get(PopupWindow).some(p => p.isVisible);
    const locked = joint.entity.get(FixedConstraint).some(f => f.enabled);

    canvas.fillStyle = 'black';
    canvas.strokeStyle = 'black';

    const pos = Position(joint.pos, 'model');
    const radius = Distance(5, 'screen');
    if (locked) {
      canvas.fillStyle = 'black';
      canvas.fillCircle(pos, radius);
    } else {
      canvas.fillStyle = 'white';
      canvas.fillCircle(pos, radius);
    }
    canvas.lineWidth = 1;
    canvas.strokeCircle(pos, radius);

    if (active) {
      canvas.lineWidth = 2;
      canvas.strokeCircle(pos, radius.apply(r => r * 2));
    }
  }

};

const AngleRenderer = (ecs: EntityComponentSystem) => {
  const constraints = ecs.getComponents(AngleConstraint);

  const canvas = App.canvas;

  for (const constraint of constraints) {
    const corner = constraint.getCorner();
    const center = corner.center.pos;
    const leftVec = Vec.between(center, corner.left.pos);
    const rightVec = Vec.between(center, corner.right.pos);

    if (leftVec.mag2() === 0 || rightVec.mag2() === 0) {
      continue;
    }

    const leftAngle = Angle(Radians(leftVec.angle()), 'model');
    const rightAngle = Angle(Radians(rightVec.angle()), 'model');

    const arcRadius = Distance(15, 'screen');
    const textDistance = arcRadius.apply(r => r + 20);

    const angle = Math.round(toDegrees(constraint.currentAngle));
    const error = constraint.enabled
      ? Math.round(toDegrees(constraint.currentAngle - constraint.targetAngle))
      : 0;

    const middle = rightVec.rotate(constraint.currentAngle / 2).unit();

    const formatAngle = (a: number) => `${a}°`;

    let label = formatAngle(angle);
    if (error > 0) {
      label = `${label} (+${formatAngle(error)})`;
    } else if (error < 0) {
      label = `${label} (${formatAngle(error)})`;
    }

    canvas.text({
      text: label,
      align: 'center',
      baseline: 'middle',
      point: Position(center, 'model').apply(
        (p: Point, s: number, v: Vec) => p.splus(s, v),
        textDistance, Vector(middle, 'model')
      ),
      fill: 'black',
      shadow: error === 0 ? undefined
        : error > 0 ? PINK
        : BLUE,
    });

    canvas.beginPath();
    canvas.moveTo(Position(center, 'model'));
    canvas.lineTo(Position(center, 'model').apply(
      (c: Point, s: number, v: Vec) => c.splus(s, v),
      arcRadius,
      Vector(rightVec.unit(), 'model'),
    ));
    canvas.arc(
      Position(center, 'model'),
      arcRadius,
      rightAngle,
      leftAngle,
      true,
    );
    canvas.closePath();

    canvas.strokeStyle = 'black';
    canvas.lineWidth = 1;
    canvas.stroke();
  }
};

const ConstraintEnforcer = (ecs: EntityComponentSystem) => {
  const constraints = ecs.getComponents(Constraint);
  // sort ascending so that higher priority constraints
  // have the last say in the next frame's configuration.
  constraints.sort((a, b) => a.priority - b.priority);
  for (const c of constraints) {
    if (!c.enabled) continue;
    c.enforce();
  }
};

const Kinematics = (ecs: EntityComponentSystem) => {
  const positions = ecs.getComponents(PhysNode);
  const points = positions.map(p => p.pos);

  positions.forEach(p => p.update());

  // correct drift
  if (positions.length > 0) {
    let dx = 0.;
    let dy = 0.;
    for (let i = 0; i < positions.length; i++) {
      const a = points[i];
      const b = positions[i].pos;
      dx += b.x - a.x;
      dy += b.y - a.y;
    }
    dx /= positions.length;
    dy /= positions.length;
    const drift = new Vec(dx, dy);
    if (drift.mag2() > 0) {
      positions.forEach(p => {
        p.pos = p.pos.minus(drift);
      });
    }
  }
};


