type ConstraintStatus = 'satisfied' | 'under' | 'over';

interface ConstraintLabel {
  text: string;
  status: ConstraintStatus;
}

interface ConstraintColoring {
  satisfied?: string;
  under?: string;
  over?: string;
}

const signToErrorStatus = (s: Sign): ConstraintStatus => {
  if (s === -1) return 'under';
  if (s === 0) return 'satisfied';
  if (s === 1) return 'over';
  return impossible(s);
};

class Constraint extends Component {
  protected readonly enabledRef = Refs.of(false);
  protected readonly tensionRef = Refs.of(0.5);

  public enforce(): void {}

  public priority: number = 0;

  constructor(entity: Entity) {
    super(entity);
    this.addKind(Constraint);
    this.enabledRef.onChange(e => {
      if (e) this.onEnable();
      else this.onDisable();
      App.project.requestSave(`constraint ${this.name} enabled`);
    });
    this.tensionRef.onChange(_ =>
      App.project.requestSave(`${this.name} tension changed`));
  }

  public get kinematic(): boolean {
    return true;
  }

  public get enabled(): boolean {
    return this.enabledRef.get();
  }

  public set enabled(enabled: boolean) {
    this.enabledRef.set(enabled);
  }

  public get tension(): number {
    return this.tensionRef.get();
  }

  public set tension(t: number) {
    this.tensionRef.set(t);
  }

  get influence() {
    if (!this.enabled) return 0;
    const dt = clamp01(Time.delta);
    const a = lerp(this.tension, 0, dt);
    const b = lerp(this.tension, dt, 1);
    return lerp(this.tension, a, b);
  }

  // for subclasses to override
  protected onEnable() {}
  protected onDisable() {}
}

class FixedConstraint extends Constraint {
  private targets: Position[] = [];

  constructor(
    entity: Entity,
    private readonly getPoints: () => Position[],
    private readonly setPoints: (pts: Position[]) => void,
  ) {
    super(entity);
    this.tension = 1.0;
    this.priority = 5;
    this.enabled = false;

    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      const lockField = form.add({
        name: 'lock position',
        kind: 'toggle',
        value: this.enabledRef,
        icons: {
          on: Icons.posLocked,
          off: Icons.posUnlocked,
        },
      });
      return form;
    });
  }

  override get kinematic() {
    return this.tension < 1;
  }

  getTargets(): Position[] {
    return this.targets.map(x => x);
  }

  updateTargets(pts: Position[]) {
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
  private readonly node: PhysEdge;

  constructor(entity: Entity) {
    super(entity);
    this.enabled = true;
    this.tension = 1;
    this.node = entity.only(PhysEdge);
  }

  private get springConstant(): number {
    return this.tension * 3;
  }

  enforce() {
    if (this.entity.maybe(LengthConstraint)?.enabled) {
      // only apply this constraint in the absense of another length constraint.
      return;
    }
    const length = App.project.modelUnit.from({ value: 3, unit: 'inch' }).value;
    const edge = this.node.edge;
    const delta = Distance(length, 'model').minus(edge.length);
    if (delta.sign < 0) {
      return;
    }
    const correction = edge.tangent.scale(delta.scale(this.springConstant/2));
    this.node.addForces({
      src: correction.neg(),
      dst: correction,
    });
  }
}

class LengthConstraint extends Constraint {
  public readonly targetLength = Refs.of(0);

  private readonly node: PhysEdge;
  private readonly _label: RoRef<ConstraintLabel>;

  constructor(entity: Entity, node?: PhysEdge) {
    super(entity);
    this.enabled = false;

    this.node = node || this.entity.only(PhysEdge);

    this.targetLength.onChange(_ => {
      if (this.enabled) App.project.requestSave('target length changed');
    });

    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      const lockField = form.add({
        name: 'lock length',
        kind: 'toggle',
        value: this.enabledRef,
        icons: {
          on: Icons.lengthLocked,
          off: Icons.lengthUnlocked,
        },
      });
      const lengthField = form.add({
        name: 'length',
        label: 'length',
        kind: 'amount',
        hidden: Refs.negate(this.enabledRef),
        value: this.targetLength.map({
          to: modelLength => App.project.displayUnit.from(App.project.modelUnit.newAmount(modelLength)),
          from: amount => App.project.modelUnit.from(amount).value,
          compareValues: (a, b) => a.value === b.value && a.unit === b.unit,
        }),
        min: App.project.modelUnit.newAmount(0),
        unit: Units.distance,
      });
      const hardnessField = form.add({
        name: 'length tension',
        label: 'tension',
        kind: 'slider',
        hidden: Refs.negate(this.enabledRef),
        value: this.tensionRef,
        min: 0,
        max: 1,
      });
      return form;
    });

    this.node.edgeRef.onChange(value => {
      if (!this.enabled) {
        this.targetLength.set(value.length.get('model'));
      }
    });

    this._label = Refs.memo(
      Refs.reduceRo(
        a => a,
        App.project.modelUnitRef,
        App.project.displayUnitRef,
        this.enabledRef,
        this.targetLength,
        this.node.edgeRef.map(e => e.length.get('model')),
      ),
      (args: readonly [
        Unit, Unit, boolean, number, number
      ]) => LengthConstraint.generateLabel(...args),
    );
  }

  get label() {
    return this._label.get();
  }

  get length() {
    return this.targetLength.get();
  }

  set length(v: number) {
    this.targetLength.set(v);
  }

  private get springConstant(): number {
    return this.tension * 3;
  }

  enforce() {
    const node = this.node;
    const delta = Distance(this.length, 'model').minus(node.edge.length);
    const correction = node.edge.tangent.scale(delta.scale(this.springConstant/2));
    node.addForces({
      src: correction.neg(),
      dst: correction,
    });
  }

  onEnable() {
    this.length = this.node.edge.length.get('model');
  }

  override toJson(): SavedComponent {
    return {
      factory: this.constructor.name,
      arguments: [
        this.enabled,
        MoreJson.distance.to(Distance(this.length, 'model'))
      ],
    };
  }

  private static generateLabel(
    modelUnit: Unit,
    displayUnit: Unit,
    enabled: boolean,
    targetLength: number,
    currentLength: number,
  ): ConstraintLabel {
    const error = enabled ? currentLength - targetLength : 0;
    const decimals = App.project.displayDecimals;
    const dispLength = displayUnit.from(modelUnit.newAmount(currentLength));
    const dispError = modelUnit.newAmount(error);
    dispError.value = Math.round(dispError.value);
    const hasError = Math.abs(dispError.value) > 0;
    const lengthText = displayUnit.format(dispLength, decimals);
    const errorTextU = displayUnit.format(dispError, decimals);
    const errorText = dispError.value >= 0 ? `+${errorTextU}` : errorTextU;
    const text = hasError ? `${lengthText} (${errorText})` : lengthText;
    return {
      text,
      status: signToErrorStatus(Math.sign(dispError.value) as Sign),
    };
  }
}

ComponentFactories.register(LengthConstraint, (
  entity: Entity,
  enabled: boolean,
  length: JsonObject,
) => {
  if (!entity.has(PhysEdge)) return 'not ready';
  const constraint = entity.getOrCreate(LengthConstraint);
  constraint.enabled = enabled;
  constraint.length = MoreJson.distance.from(length).get('model');
  return constraint;
});

interface Corner {
  center: Position;
  left: Vector;
  right: Vector;
}

class AngleConstraint extends Constraint {
  public readonly targetAngleRef = Refs.of(Angle(Radians(Math.PI/2), 'model'));

  private _label: RoRef<ConstraintLabel>;
  private readonly currentAngleRef: RoRef<Angle>;
  public readonly corner: RoRef<Corner>;


  constructor(
    entity: Entity,
    private readonly center: PhysNode,
    private readonly left: RoRef<PhysNode>,
    private readonly right: RoRef<PhysNode>,
  ) {
    super(entity);

    this.targetAngleRef.onChange(_ => {
      if (this.enabled) App.project.requestSave('target angle changed');
    });

    this.corner = Refs.memo(
      Refs.reduceRo(
        a => a,
        center.position,
        Refs.flatMapRo(left, n => n.position),
        Refs.flatMapRo(right, n => n.position),
      ),
      ([center, left, right]) => ({
        center,
        left: Vectors.between(center, left),
        right: Vectors.between(center, right),
      }),
    );

    this.currentAngleRef = Refs.memo(this.corner, ({center, left, right}) => {
      if (!left.mag2().nonzero || !right.mag2().nonzero) {
        return Angles.zero('model');
      }
      return left.angle().minus(right.angle()).normalize();
    });

    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      const lockField = form.add({
        name: 'lock angle',
        kind: 'toggle',
        value: this.enabledRef,
        icons: {
          on: Icons.angleLocked,
          off: Icons.angleUnlocked,
        },
      });
      const angleField = form.add({
        name: 'angle',
        label: 'angle',
        kind: 'angle',
        hidden: Refs.negate(this.enabledRef),
        value: this.targetAngleRef,
      });
      const tensionField = form.add({
        name: 'angle tension',
        label: 'tension',
        kind: 'slider',
        hidden: Refs.negate(this.enabledRef),
        value: this.tensionRef,
        min: 0,
        max: 1,
      });
      return form;
    });

    this.currentAngleRef.onChange(value => {
      if (!this.enabled) {
        this.targetAngle = value;
      }
    });

    this._label = Refs.memo(
      Refs.reduceRo(
        a => a,
        this.enabledRef,
        this.currentAngleRef,
        this.targetAngleRef,
      ),
      (args: readonly [boolean, Angle, Angle]) => AngleConstraint.generateLabel(...args),
    );
  }

  public get label(): ConstraintLabel {
    return this._label.get();
  }

  public getCorner(): Corner {
    return this.corner.get();
  }

  get targetAngle(): Angle {
    return this.targetAngleRef.get();
  }

  set targetAngle(a: Angle) {
    this.targetAngleRef.set(a);
  }
    
  get currentAngle(): Angle {
    return this.currentAngleRef.get();
  }

  get springConstant(): number {
    return this.tension * 3;
  }

  enforce() {
    const { center, left, right } = this.getCorner();
    if (!left.mag2().nonzero || !right.mag2().nonzero) {
      return;
    }
    const currentAngle = this.currentAngle;
    const delta = this.targetAngle.normalize().minus(currentAngle);

    const targetLeft = center.plus(left.rotate(delta.scale(this.springConstant / 2)));
    const targetRight = center.plus(right.rotate(delta.scale(-this.springConstant / 2)));

    const deltaL = Vectors.between(center.plus(left), targetLeft);
    const deltaR = Vectors.between(center.plus(right), targetRight);
    this.left.get().addForce(deltaL.scale(this.tension));
    this.right.get().addForce(deltaR.scale(this.tension));

    if (!App.debug) return;
    App.canvas.lineWidth = 1;

    App.canvas.strokeStyle = 'green';
    App.canvas.strokeLine(center, targetLeft);
    App.canvas.strokeStyle = 'blue';
    App.canvas.setLineDash([2, 2]);
    App.canvas.arrow(center.plus(left), targetLeft);
    App.canvas.stroke();
    App.canvas.setLineDash([]);

    App.canvas.strokeStyle = 'red';
    App.canvas.strokeLine(center, targetRight);
    App.canvas.strokeStyle = 'blue';
    App.canvas.setLineDash([2, 2]);
    App.canvas.arrow(center.plus(right), targetRight);
    App.canvas.stroke();
    App.canvas.setLineDash([]);
  }

  onEnable() {
    this.targetAngle = this.currentAngle;
  }

  private static generateLabel(
    enabled: boolean,
    currentAngle: Angle,
    targetAngle: Angle,
  ): ConstraintLabel {
    const angle = Degrees(Math.round(unwrap(toDegrees(currentAngle.get('model')))));
    const error = Spaces.getCalc('model', (current: Radians, target: Radians) => {
      if (!enabled) return Degrees(0);
      const delta = Radians(unwrap(current) - unwrap(target));
      return Degrees(Math.round(unwrap(toDegrees(delta))));
    }, currentAngle, targetAngle);

    let label = formatDegrees(angle);
    if (unwrap(error) > 0) {
      label = `${label} (+${formatDegrees(error)})`;
    } else if (unwrap(error) < 0) {
      label = `${label} (${formatDegrees(error)})`;
    }

    return {
      text: label,
      status: signToErrorStatus(Math.sign(unwrap(error)) as Sign),
    };
  }
}

class AxisConstraint extends Constraint {
  public readonly axis = Refs.of(
    Vector(Axis.X, 'screen'),
    (one, two) => {
      const a = one.get('screen');
      const b = two.get('screen');
      return a.minus(b).mag() < 0.001;
    },
  );

  public readonly axisToggle = this.axis.map<boolean>({
    to: (axis: Vector) => Math.abs(axis.get('screen').x) < Math.abs(axis.get('screen').y),
    from: (vertical: boolean) => vertical ? Vector(Axis.Y, 'screen') : Vector(Axis.X, 'screen'),
  });

  private readonly node: PhysEdge;

  private readonly _forces: RoRef<{ src: Vector, dst: Vector }>;

  constructor(entity: Entity) {
    super(entity);

    this.node = entity.only(PhysEdge);

    this._forces = Refs.memo(
      Refs.reduceRo(
        a => a, 
        this.axis,
        this.node.edgeRef,
        this.tensionRef,
        App.viewport.changedRef,
      ),
      ([axis, edge, tension, _]) => AxisConstraint.calculateForces(
        axis.to('model').unit(),
        edge,
        tension,
      ),
    );

    this.axis.onChange(_ => {
      if (this.enabled) App.project.requestSave('axis constraint changed');
    });
    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      form.add({
        name: 'axis lock enabled',
        kind: 'toggle',
        value: this.enabledRef,
        icons: {
          on: Icons.axisLocked,
          off: Icons.axisUnlocked,
        },
      });
      form.add({
        name: 'axis',
        kind: 'toggle',
        value: this.axisToggle,
        hidden: Refs.negate(this.enabledRef),
        icons: { on: Icons.axisY, off: Icons.axisX }, 
      });
      form.add({
        name: 'axis tension',
        label: 'axis tension',
        kind: 'slider',
        min: 0,
        max: 1,
        value: this.tensionRef,
        hidden: Refs.negate(this.enabledRef),
      });
      return form;
    });
  }

  onEnable() {
    for (const phys of this.entity.get(PhysEdge)) {
      const tangent = phys.edge.tangent;
      const x = Vector(Axis.X, 'screen').to(tangent.space);
      const y = Vector(Axis.Y, 'screen').to(tangent.space);
      this.axis.set(tangent.dot(x).abs().gt(tangent.dot(y).abs()) ? x : y);
    }
  }

  enforce() {
    this.node.addForces(this._forces.get());
  }

  private static calculateForces(
    axis: Vector,
    edge: MemoEdge,
    tension: number,
  ): { src: Vector, dst: Vector } {
    const tangent = edge.tangent;
    const normal = edge.normal;
    const center = edge.midpoint;
    const length = edge.length.scale(0.5);

    const flip = axis.dot(tangent) > axis.neg().dot(tangent) ? 1 : -1;

    const targetSrc = center.splus(length, axis.scale(-flip));
    const targetDst = center.splus(length, axis.scale(flip));

    const deltaSrc = Vectors.between(edge.src, targetSrc);
    const deltaDst = Vectors.between(edge.dst, targetDst);

    // now enforce the deltas to be normal to the current position
    // so we hopefully rotate with out changing size, all else equal.
    const normDeltaSrc = deltaSrc.onAxis(normal).unit().scale(deltaSrc.mag());
    const normDeltaDst = deltaDst.onAxis(normal).unit().scale(deltaDst.mag());

    const k = 3 * tension; // spring constant

    return {
      src: normDeltaSrc.scale(k / 2),
      dst: normDeltaDst.scale(k / 2),
    };
  }
}

const ConstraintEnforcer = (ecs: EntityComponentSystem) => {
  const constraints = ecs.getComponents(Constraint);
  // sort ascending so that higher priority constraints
  // have the last say in the next frame's configuration.
  constraints.sort((a, b) => a.priority - b.priority);
  for (const c of constraints) {
    if (!c.enabled) continue;
    if (c.kinematic && (!App.settings.kinematics.get() || App.ui.dragging)) {
      continue;
    }
    c.enforce();
  }
};

