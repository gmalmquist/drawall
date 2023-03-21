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
    private readonly getPos?: () => Position,
    private readonly setPos?: (p: Position) => void) {
    super(entity);
  }

  get pos(): Position {
    return typeof this.getPos === 'undefined' ? Position(this._pos, 'model') : this.getPos();
  }

  set pos(p: Position) {
    if (typeof this.setPos !== 'undefined') {
      this.setPos(p);
    } else {
      this._pos = p.get('model');
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
    this.pos = this.pos.splus(dt, Vector(this.velocity, 'model'));
    this.clearForces();
  }

  addForce(f: Vector) {
    this.forceAccum = this.forceAccum.plus(f.get('model'));
  }

  clearForces() {
    this.forceAccum = Vec.ZERO;
  }
}

class Room extends Component implements Solo {
  public readonly [SOLO] = true;

  private _wallSet = new Set<Wall>();
  private _walls: Wall[] = [];

  constructor(entity: Entity) {
    super(entity);
  }

  get walls(): Wall[] {
    return this._walls.map(x => x);
  }

  addWall(wall: Wall) {
    if (!this._wallSet.has(wall)) {
      this._walls.push(wall);
      this._wallSet.add(wall);
    }
    wall.room = this;
  }

  removeWall(wall: Wall) {
    if (this._wallSet.has(wall)) {
      this._wallSet.delete(wall);
      this._walls = this._walls.filter(w => w.name !== wall.name);
    }
    if (wall.room === this) {
      wall.room = null;
    }
  }

  containsConvex(position: Position): boolean {
    // checks if the given point is in this room, assuming
    // this room's walls form a convex polygon.
    for (const wall of this.walls) {
      const vec = Vectors.between(wall.midpoint, position);
      if (vec.dot(wall.insideNormal) < 0) {
        return false;
      }
    }
    return true;
  }

  tearDown() {
    for (const wall of this.walls) {
      if (wall.room === this) {
        wall.room = null;
        wall.entity.destroy();
      }
    }
  }
}

class Wall extends Component implements Solo {
  public readonly [SOLO] = true;
  private _src: WallJoint;
  private _dst: WallJoint;
  private _room: Room | null = null;

  constructor(entity: Entity) {
    super(entity);
    this._src = entity.ecs.createEntity().add(WallJoint);
    this._dst = entity.ecs.createEntity().add(WallJoint);
    this.src.attachOutgoing(this);
    this.dst.attachIncoming(this);

    const handle = entity.add(Handle, {
      getPos: () => this.src.pos,
      setPos: p => {
      },
      distance: (pt: Position) => new SpaceEdge(this.src.pos, this.dst.pos).distance(pt),
      priority: 0,
      snapping: {
        snapByDefault: true,
        preferredAxis: () => ({
          name: 'wall normal',
          direction: this.outsideNormal,
          points: [
            this.src.pos,
            this.dst.pos,
          ],
        }),
        localAxes: () => {
          return [
            { name: 'wall normal', direction: this.outsideNormal, points: [ this.midpoint ], },
            { name: 'wall tangent', direction: this.tangent, points: [ this.midpoint ], },
          ];
        },
      },
      cursor: () => getResizeCursor(this.outsideNormal),
    });
    handle.events.addDragListener({
      onStart: (e): [Position, Position] => {
        return [this.src.pos, this.dst.pos];
      },
      onUpdate: (e, [src, dst]) => {
        const delta = e.delta;
        const srcLocked = this.src.entity.get(FixedConstraint).some(f => f.enabled);
        const dstLocked = this.dst.entity.get(FixedConstraint).some(f => f.enabled);
        if (srcLocked && !dstLocked) {
          const initial = Vectors.between(src, e.start);
          const current = Vectors.between(src, e.position);
          const angle = Angles.counterClockwiseDelta(initial.angle(), current.angle());
          this.dst.pos = src.plus(Vectors.between(src, dst).rotate(angle));
        } else if (!srcLocked && dstLocked) {
          const initial = Vectors.between(dst, e.start);
          const current = Vectors.between(dst, e.position);
          const angle = Angles.counterClockwiseDelta(initial.angle(), current.angle());
          this.src.pos = dst.plus(Vectors.between(dst, src).rotate(angle));
        } else {
          this.src.pos = src.plus(delta);
          this.dst.pos = dst.plus(delta);
        }
        if (srcLocked && dstLocked) {
          this.src.entity.get(FixedConstraint).forEach(c => c.updateTargets([src.plus(delta)]));
          this.dst.entity.get(FixedConstraint).forEach(c => c.updateTargets([dst.plus(delta)]));
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

  getConnectedLoop(direction: 'forward' | 'backward' | 'both' = 'both'): Wall[] {
    const results: Wall[] = [ this ];
    const seen: Set<Wall> = new Set(results);

    if (direction === 'backward' || direction === 'both') {
      for (let wall = this.src.incoming;
           wall !== null && !seen.has(wall);
           wall = wall.src.incoming) {
        seen.add(wall);
        results.push(wall);
      }
      reverseInPlace(results);
    }

    if (direction === 'forward' || direction === 'both') {
      for (let wall = this.dst.outgoing;
           wall !== null && !seen.has(wall);
           wall = wall.dst.outgoing) {
        seen.add(wall);
        results.push(wall);
      }
    }

    return results;
  }

  get room(): Room | null {
    return this._room;
  }

  set room(room: Room | null) {
    if (room === this._room) return;
    const old = this._room;
    this._room = room;
    if (old !== null) {
      old.removeWall(this);
    }
    if (room !== null) {
      room.addWall(this);
    }
  }

  get src() { return this._src; }
  get dst() { return this._dst; }

  set src(j: WallJoint) {
    if (j === this._src) return;
    const old = this._src;
    this._src = j;
    if (old.outgoing === this) {
      old.detachOutgoing();
    }
    j.attachOutgoing(this);
  }

  set dst(j: WallJoint) {
    if (j === this._dst) return;
    const old = this._dst;
    this._dst = j;
    if (old.incoming === this) {
      old.detachIncoming();
    }
    j.attachIncoming(this);
  }

  get outsideNormal(): Vector {
    return this.tangent.r90();
  }

  get insideNormal(): Vector {
    return this.outsideNormal.scale(-1);
  }

  get tangent(): Vector {
    return Vectors.between(this.src.pos, this.dst.pos);
  }

  get midpoint(): Position {
    return this.src.pos.lerp(0.5, this.dst.pos);
  }

  // split this wall into two walls, creating a new
  // wall joint between them.
  splitWall(at: Position): readonly [Wall, Wall] | null {
    const edge = this.getEdge();
    const s = Vectors.between(edge.src, at).get('model')
      .dot(edge.vector.get('model')) / edge.vector.get('model').mag2();

    if (s >= 1) {
      return null;
    }

    if (s <= 0) {
      // same as above case but on the other side.
      return null;
    }

    const rest = this.entity.ecs.createEntity().add(Wall);
    if (this.room !== null) {
      this.room.addWall(rest);
    }
    rest.src.pos = edge.lerp(s);
    rest.dst = this.dst;
    this.dst = rest.src;

    return [this, rest];
  }

  getEdge(): SpaceEdge {
    return new SpaceEdge(this.src.pos, this.dst.pos);
  }

  getLength(): Distance {
    return this.getEdge().length;
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
              length.enabled ? length.length : Distances.between(this.src.pos, this.dst.pos).get('model'))
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
    this.room = null;
  }
}

class WallJoint extends Component {
  private _pos: Position = Position(Point.ZERO, 'model');
  private _outgoing: Wall | null = null;
  private _incoming: Wall | null = null;

  constructor(entity: Entity) {
    super(entity);

    const position = entity.add(
      PhysNode,
      () => this.pos,
      (pos: Position) => { this.pos = pos; },
    );

    const handle = entity.add(Handle, {
      getPos: () => this.pos,
      setPos: p => {
        this.pos = p;
        entity.get(FixedConstraint).forEach(c => c.updateTargets([p]));
      },
      priority: 1,
      snapping: {
        snapByDefault: false,
        allowLocal: true,
        allowGlobal: true,
        allowGeometry: true,
        localAxes: () => {
          const incoming = this.incoming;
          const outgoing = this.outgoing;
          const axes: NamedAxis[] = [];
          if (incoming !== null) {
            axes.push({
              name: 'right wall',
              direction: Vectors.between(this.pos, incoming.src.pos),
              points: [ this.pos ],
            });
          }
          if (outgoing !== null) {
            axes.push({
              name: 'left wall',
              direction: Vectors.between(this.pos, outgoing.dst.pos),
              points: [ this.pos ],
            });
          }
          return axes;
        },
      },
    });

    entity.add(AngleConstraint,
      () => {
        return {
          center: position,
          left: this.outgoing ? this.outgoing.dst.entity.onlyRef(PhysNode).or(position) : position,
          right: this.incoming ? this.incoming.src.entity.onlyRef(PhysNode).or(position) : position,
        };
      },
      Angle(Radians(Math.PI/2.), 'model'),
    );

    entity.add(FixedConstraint,
      () => [ this.pos ],
      ([p]: Position[]) => { this.pos = p; },
    );
  }

  shallowDup(): WallJoint {
    // create a wall joint in the same place,
    // but with no connectivity info
    const joint = this.entity.ecs.createEntity().add(WallJoint);
    joint.pos = this.pos;
    return joint;
  }

  get pos(): Position {
    return this._pos;
  }

  set pos(p: Position) {
    this._pos = p.to('model');
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
    if (this._incoming?.dst === this) {
      this._incoming.entity.destroy();
    }
    this._incoming = null;
    if (this._outgoing === null || this._outgoing.entity.isDestroyed) {
      this.entity.destroy();
    }
  }

  detachOutgoing() {
    if (this._outgoing?.src === this) {
      this._outgoing.entity.destroy();
    }
    this._outgoing = null;
    if (this._incoming === null || this._incoming.entity.isDestroyed) {
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

  override tearDown() {
    const out = this._outgoing;
    const inc = this._incoming;
    if (out !== null && out.src === this) out.entity.destroy();
    if (inc !== null && inc.dst === this) inc.entity.destroy();
  }

  private createAnchorUi(ui: UiBuilder) {
    const fixed = this.entity.only(FixedConstraint);
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
    const angle = Spaces.getCalc('model', (t: Radians, c: Radians) => {
      return toDegrees(angleConstraint.enabled ? t : c);
    }, angleConstraint.targetAngle, angleConstraint.currentAngle);

    ui
      .addCheckbox('lock angle', angleConstraint?.enabled)
      .addLabel('angle', 'lock angle')
      .addNumberInput('angle', {
        min: 0,
        max: 360,
        value: unwrap(angle),
        size: 4,
      })
      .addRadioGroup('units', [{ name: 'radians' }, { name: 'degrees', isDefault: true }])
      .newRow()
      .addLabel('tension', 'strength')
      .addSlider('strength', { min: 0, max: 1, initial: angleConstraint.hardness })
      .newRow();

    const resetAngle = () => {
      const scale = ui.getValue('units') === 'degrees' ? 180 / Math.PI : 1;
      ui.setValue('angle', (ui.getValue('units') === 'degrees'
        ? toDegrees(angleConstraint.targetAngle.get('model'))
        : angleConstraint.targetAngle.get('model')).toString());
    };

    const parseAngle = (value: string) => {
      const prev = angleConstraint.targetAngle;
      const angle = parseFloat(value);
      if (isNaN(angle)) {
        resetAngle();
        return prev;
      }
      return Angle(ui.getValue('units') === 'degrees'
        ? toRadians(Degrees(angle))
        : Radians(angle), 'model');
    };

    ui.onChange((name: string, value: string) => {
      if (name === 'angle') {
        const prev = angleConstraint.targetAngle;
        angleConstraint.targetAngle = parseAngle(value.trim());
        if (angleConstraint.targetAngle !== prev) {
          angleConstraint.enabled = true;
          ui.setValue('lock angle', true);
        }
      } else if (name === 'strength') {
        angleConstraint.hardness = parseFloat(value);
      } else if (name === 'units') {
        resetAngle();
      } else if (name === 'lock angle') {
        angleConstraint.enabled = value === 'true';
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
  private targets: Position[] = [];

  constructor(
    entity: Entity,
    private readonly getPoints: () => Position[],
    private readonly setPoints: (pts: Position[]) => void,
  ) {
    super(entity);
    this.hardness = 1.0;
    this.priority = 5;
    this.enabled = false;

    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      const lockField = form.add({
        name: 'lock position',
        kind: 'toggle',
        value: this.enabled as boolean,
      });
      form.addFieldListener(({ name, kind, value }) => {
        if (name === 'lock position' && kind === 'toggle') {
          this.enabled = value;
        }
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
    this.hardness = 1;
  }

  private get springConstant(): number {
    return this.hardness * 3;
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
  public lengthReference: LengthReference | null = null;

  constructor(
    entity: Entity,
    private readonly getSrc: () => PhysNode,
    private readonly getDst: () => PhysNode,
    public length: number,
  ) {
    super(entity);
    this.enabled = false;

    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      const lockField = form.add({
        name: 'lock length',
        kind: 'toggle',
        value: this.enabled as boolean,
      });
      const lengthField = form.add({
        name: 'length',
        label: 'length',
        kind: 'amount',
        value: App.project.displayUnit.from(App.project.modelUnit.newAmount(length)),
        min: App.project.modelUnit.newAmount(0),
        unit: Units.distance,
      });
      const hardnessField = form.add({
        name: 'tension',
        label: 'tension',
        kind: 'slider',
        value: this.hardness,
        min: 0,
        max: 1,
      });
      form.addFieldListener(({ name, kind, value }) => {
        if (name === 'length' && kind === 'amount') {
          lockField.setValue(true);
          this.length = App.project.modelUnit.from(value).value;
        } else if (name === 'lock length' && kind === 'toggle') {
          this.enabled = value;
        } else if (name === 'tension' && kind === 'slider') {
          this.hardness = value;
        }
      });
      return form;
    });
  }

  private get springConstant(): number {
    return this.hardness * 3;
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
  center: PhysNode;
  left: PhysNode;
  right: PhysNode;
}

class AngleConstraint extends Constraint {
  constructor(
    entity: Entity,
    public readonly getCorner: () => Corner,
    public targetAngle: Angle = Angle(Radians(Math.PI/2), 'model'),
  ) {
    super(entity);

    this.entity.add(Form).setFactory(() => {
      const form = new AutoForm();
      const lockField = form.add({
        name: 'lock angle',
        kind: 'toggle',
        value: this.enabled as boolean,
      });
      const angleField = form.add({
        name: 'angle',
        label: 'angle',
        kind: 'angle',
        value: this.enabled ? this.targetAngle : this.currentAngle,
      });
      const tensionField = form.add({
        name: 'tension',
        label: 'tension',
        kind: 'slider',
        value: this.hardness,
        min: 0,
        max: 1,
      });
      form.addFieldListener(({ name, kind, value }) => {
        if (name === 'angle' && kind === 'angle') {
          lockField.setValue(true);
          this.targetAngle = value;
        } else if (name === 'lock angle' && kind === 'toggle') {
          this.enabled = value;
        } else if (name === 'tension' && kind === 'slider') {
          this.hardness = value;
        }
      });
      return form;
    });
  }

  private getLeft(): Vector {
    const c = this.getCorner();
    return Vectors.between(c.center.pos, c.left.pos);
  }

  private getRight(): Vector {
    const c = this.getCorner();
    return Vectors.between(c.center.pos, c.right.pos);
  }

  get currentAngle(): Angle {
    const left = this.getLeft();
    const right = this.getRight();
    if (left.mag2().get('model') === 0 || right.mag2().get('model') === 0) {
      return Angles.zero('model');
    }
    return left.angle().minus(right.angle()).normalize();
  }

  get springConstant(): number {
    return this.hardness * 3;
  }

  enforce() {
    const left = this.getLeft();
    const right = this.getRight();
    if (left.get('model').mag2() === 0 || right.get('model').mag2() === 0) {
      return;
    }
    const delta = this.targetAngle.normalize().minus(this.currentAngle);
    const corner = this.getCorner();

    const targetLeft = corner.center.pos.plus(left.rotate(delta.scale(this.springConstant / 2)));
    const targetRight = corner.center.pos.plus(right.rotate(delta.scale(-this.springConstant / 2)));

    const deltaL = Vectors.between(corner.left.pos, targetLeft);
    const deltaR = Vectors.between(corner.right.pos, targetRight);
    corner.left.addForce(deltaL.scale(this.hardness));
    corner.right.addForce(deltaR.scale(this.hardness));

    if (!App.debug) return;
    App.canvas.lineWidth = 1;

    App.canvas.strokeStyle = 'green';
    App.canvas.strokeLine(corner.center.pos, targetLeft);
    App.canvas.strokeStyle = 'blue';
    App.canvas.setLineDash([2, 2]);
    App.canvas.strokeLine(corner.left.pos, targetLeft);
    App.canvas.setLineDash([]);

    App.canvas.strokeStyle = 'red';
    App.canvas.strokeLine(corner.center.pos, targetRight);
    App.canvas.strokeStyle = 'blue';
    App.canvas.setLineDash([2, 2]);
    App.canvas.strokeLine(corner.right.pos, targetRight);
    App.canvas.setLineDash([]);
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

// cleanup broken geometry
const Recycler = (ecs: EntityComponentSystem) => {
  for (const wall of ecs.getComponents(Wall)) {
    if (wall.dst.entity.isDestroyed || wall.src.entity.isDestroyed) {
      wall.entity.destroy();
    }
  }
  for (const joint of ecs.getComponents(WallJoint)) {
    const incoming = joint.incoming;
    const outgoing = joint.outgoing;
    if (incoming !== null && incoming.entity.isDestroyed) {
      joint.detachIncoming();
    }
    if (outgoing !== null && outgoing.entity.isDestroyed) {
      joint.detachOutgoing();
    }
  }
};

const WallRenderer = (ecs: EntityComponentSystem) => {
  const canvas = App.canvas;

  const walls = ecs.getComponents(Wall);
  for (const wall of walls) {
    if (wall.src === null || wall.dst ===  null) continue;
    const hovered = wall.entity.get(Handle).some(h => h.isHovered);
    const active = hovered || wall.entity.get(PopupWindow).some(p => p.isVisible);
    canvas.strokeStyle = 'black';
    canvas.lineWidth = active ? 2 : 1;
    canvas.strokeLine(wall.src.pos, wall.dst.pos);
    canvas.lineWidth = 1;

    const edge = new SpaceEdge(wall.src.pos, wall.dst.pos);
    const tickSpacing = Distance(10, 'screen');
    const tickSize = Distance(10, 'screen');
    const ticks = Math.floor(
     edge.length.get('screen') / tickSpacing.get('screen')
    );
    for (let i = 0; i < ticks; i++) {
      const s = 1.0 * i / ticks;
      const p = edge.lerp(s);
      const v = edge.vector.unit().scale(tickSize).rotate(Angles.fromDegrees(Degrees(30), 'model'));
      canvas.strokeLine(p, p.plus(v));
    }

    const roundAmount = (a: Amount): Amount => ({ value: Math.round(a.value), unit: a.unit });

    const constraint = wall.entity.only(LengthConstraint);
    const error = constraint?.enabled ? edge.length.get('model') - constraint.length : 0;
    const dispLength = App.project.displayUnit.from(
      roundAmount(App.project.modelUnit.newAmount(edge.length.get('model')))
    );
    const dispError = App.project.modelUnit.newAmount(error);
    dispError.value = Math.round(dispError.value);
    const hasError = Math.abs(dispError.value) > 0;
    const lengthText = App.project.displayUnit.format(dispLength);
    const errorTextU = App.project.displayUnit.format(dispError);
    const errorText = dispError.value >= 0 ? `+${errorTextU}` : errorTextU;
    const label = hasError ? `${lengthText} (${errorText})` : lengthText;
    const textOffset = Distance(10, 'screen');
    const textPosition = edge.lerp(0.5).dplus(textOffset.scale(-1), edge.vector.r90().unit());
    canvas.text({
      point: textPosition,
      axis: edge.vector,
      keepUpright: true,
      text: label,
      fill: 'black',
      shadow: hasError ? (dispError.value > 0 ? PINK : BLUE) : undefined,
      align: 'center',
      baseline: 'middle',
    });

    if (App.ecs.getComponents(Popup).some(p => p.isVisible)) {
      canvas.text({
        point: textPosition.dplus(Distance(-15, 'screen'), edge.vector.r90().unit()),
        axis: edge.vector,
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

    const pos = joint.pos;
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
      canvas.strokeCircle(pos, radius.scale(2));
    }
  }
};

const AngleRenderer = (ecs: EntityComponentSystem) => {
  const constraints = ecs.getComponents(AngleConstraint);

  const canvas = App.canvas;

  for (const constraint of constraints) {
    const corner = constraint.getCorner();
    const center = corner.center.pos;
    const leftVec = Vectors.between(center, corner.left.pos);
    const rightVec = Vectors.between(center, corner.right.pos);

    if (leftVec.get('model').mag2() === 0 || rightVec.get('model').mag2() === 0) {
      continue;
    }

    const leftAngle = leftVec.angle(); 
    const rightAngle = rightVec.angle();

    const arcRadius = Distance(15, 'screen');
    const textDistance = arcRadius.map(r => r + 20);

    const angle = Degrees(Math.round(unwrap(toDegrees(constraint.currentAngle.get('model')))));
    const error = Spaces.getCalc('model', (current: Radians, target: Radians) => {
      if (!constraint.enabled) return Degrees(0);
      const delta = Radians(unwrap(current) - unwrap(target));
      return Degrees(Math.round(unwrap(toDegrees(delta))));
    }, constraint.currentAngle, constraint.targetAngle);
    
    const middle = rightVec.rotate(constraint.currentAngle.scale(0.5)).unit();

    let label = formatDegrees(angle);
    if (unwrap(error) > 0) {
      label = `${label} (+${formatDegrees(error)})`;
    } else if (unwrap(error) < 0) {
      label = `${label} (${formatDegrees(error)})`;
    }

    const color = constraint.enabled ? 'black' : 'hsl(0, 0%, 50%)';
    const highlight = error === Degrees(0) ? undefined
        : error > Degrees(0) ? PINK
        : BLUE;

    canvas.text({
      text: label,
      align: 'center',
      baseline: 'middle',
      point: center.dplus(textDistance, middle),
      fill: color,
      shadow: highlight,
    });

    canvas.beginPath();
    canvas.moveTo(center);
    canvas.lineTo(center.dplus(arcRadius, rightVec.unit()));
    canvas.arc(
      center,
      arcRadius,
      rightAngle,
      leftAngle,
      true,
    );
    canvas.closePath();

    canvas.strokeStyle = color;
    canvas.setLineDash(constraint.enabled ? [] : [2, 2]);
    canvas.lineWidth = 1;
    canvas.stroke();
    canvas.setLineDash([]);
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
  if (App.ui.dragging) {
    // don't move everything around while we're dragging stuff
    positions.forEach(p => p.clearForces());
    return; 
  }

  const points = positions.map(p => p.pos);

  positions.forEach(p => p.update());

  // correct drift
  if (positions.length > 0) {
    let dx = 0.;
    let dy = 0.;
    for (let i = 0; i < positions.length; i++) {
      const a = points[i].get('model');
      const b = positions[i].pos.get('model');
      dx += b.x - a.x;
      dy += b.y - a.y;
    }
    dx /= positions.length;
    dy /= positions.length;
    const drift = Vector(new Vec(dx, dy), 'model');
    if (drift.get('model').mag2() > 0) {
      positions.forEach(p => {
        p.pos = p.pos.minus(drift);
      });
    }
  }
};


