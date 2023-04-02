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
  constructor(
    entity: Entity,
    private readonly getSrc: () => PhysNode,
    private readonly getDst: () => PhysNode,
  ) {
    super(entity);
    this.enabled = true;
    this.tension = 1;
  }

  private get springConstant(): number {
    return this.tension * 3;
  }

  private getEdge(): Edge {
    return Spaces.getCalc(
      'model',
      (a: Point, b: Point) => new Edge(a, b),
      this.getSrc().pos, this.getDst().pos,
    );
  }

  enforce() {
    if (this.entity.get(LengthConstraint).some(c => c.enabled)) {
      // only apply this constraint in the absense of another length constraint.
      return;
    }
    const length = App.project.modelUnit.from({ value: 3, unit: 'inch' }).value;
    const edge = this.getEdge();
    if (edge === null) return;
    const delta = length - edge.vector().mag();
    if (delta < 0) {
      return;
    }
    const correction = edge.vector().unit().scale(delta/2 * this.springConstant);
    this.getSrc().addForce(Vector(correction.neg(), 'model'));
    this.getDst().addForce(Vector(correction, 'model'));
  }
}

class LengthConstraint extends Constraint {
  public readonly targetLength = Refs.of(0);
  public lengthReference: LengthReference | null = null;

  constructor(
    entity: Entity,
    private readonly getSrc: () => PhysNode,
    private readonly getDst: () => PhysNode,
  ) {
    super(entity);
    this.enabled = false;

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

    Refs.polling({
      poll: () => this.getEdge().length,
      stopWhen: () => this.entity.isDestroyed,
      delayMillis: 250,
    }).onChange(value => {
      if (!this.enabled) {
        this.targetLength.set(value);
      }
    });
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

  private getEdge(): Edge {
    return Spaces.getCalc(
      'model',
      (a: Point, b: Point) => new Edge(a, b),
      this.getSrc().pos, this.getDst().pos,
    );
  }

  enforce() {
    if (this.lengthReference !== null) {
      this.length = this.lengthReference.getLength().get('model');
    }

    const edge = this.getEdge();
    if (edge === null) return;
    const delta = this.length - edge.vector().mag();
    const correction = edge.vector().unit().scale(delta/2 * this.springConstant);
    this.getSrc().addForce(Vector(correction.neg(), 'model'));
    this.getDst().addForce(Vector(correction, 'model'));
  }

  onEnable() {
    const mag = this.getEdge()?.vector()?.mag();
    if (typeof mag !== 'undefined') {
      this.length = mag;
    }
  }
}

interface Corner {
  center: Position;
  left: Vector;
  right: Vector;
}

class AngleConstraint extends Constraint {
  public readonly targetAngleRef = Refs.of(Angle(Radians(Math.PI/2), 'model'));

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

    this.corner = Refs.memo(Refs.reduceRo(
      ([center, left, right]) => ({
        center,
        left: Vectors.between(center, left),
        right: Vectors.between(center, right),
      }),
      center.position,
      Refs.flatMapRo(left, n => n.position),
      Refs.flatMapRo(right, n => n.position),
    ));

    this.currentAngleRef = Refs.memo(this.corner.map(({center, left, right}) => {
      if (!left.mag2().nonzero || !right.mag2().nonzero) {
        return Angles.zero('model');
      }
      return left.angle().minus(right.angle()).normalize();
    }));

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
      Refs.polling({
        poll: () => this.currentAngle,
        stopWhen: () => this.entity.isDestroyed,
        delayMillis: 250,
      }).onChange(value => {
        if (!this.enabled) {
          this.targetAngle = value;
        }
      });
      return form;
    });
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

  constructor(entity: Entity) {
    super(entity);
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
      const edge = phys.edge.unwrap();
      if (edge === null) continue;
      const tangent = edge.tangent;
      const x = Vector(Axis.X, 'screen').to(tangent.space);
      const y = Vector(Axis.Y, 'screen').to(tangent.space);
      this.axis.set(tangent.dot(x).abs().gt(tangent.dot(y).abs()) ? x : y);
    }
  }

  enforce() {
    if (!this.entity.has(PhysEdge)) {
      return;
    }
    const phys = this.entity.only(PhysEdge);
    const edge = phys.edge.unwrap();
    if (edge === null) {
      return;
    }
 
    const tangent = edge.tangent;

    const axis = this.axis.get().to('model').unit();
    const flip = axis.dot(tangent) > axis.neg().dot(tangent) ? 1 : -1;

    const center = edge.lerp(0.5);
    const length = edge.length.scale(0.5);

    const targetSrc = center.splus(length, axis.scale(-flip));
    const targetDst = center.splus(length, axis.scale(flip));

    const deltaSrc = Vectors.between(edge.src, targetSrc);
    const deltaDst = Vectors.between(edge.dst, targetDst);

    // now enforce the deltas to be normal to the current position
    // so we hopefully rotate with out changing size, all else equal.
    const normDeltaSrc = deltaSrc.onAxis(edge.normal).unit().scale(deltaSrc.mag());
    const normDeltaDst = deltaDst.onAxis(edge.normal).unit().scale(deltaDst.mag());

    const k = 3 * this.tension; // spring constant

    phys.src.with(s => s.addForce(normDeltaSrc.scale(k / 2)));
    phys.dst.with(s => s.addForce(normDeltaDst.scale(k / 2)));

    App.ifDebug(() => {
      App.canvas.lineWidth = 1;

      App.canvas.strokeStyle = 'purple';
      App.canvas.strokeLine(edge.src, edge.src.plus(normDeltaSrc));

      App.canvas.strokeStyle = 'orange';
      App.canvas.strokeLine(edge.dst, edge.dst.plus(normDeltaDst));

      App.canvas.strokeStyle = BLUE;
      App.canvas.strokeLine(
        center.splus(Distance(1000, 'screen'), axis),
        center.splus(Distance(-1000, 'screen'), axis),
      );
    })
  }
}

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

