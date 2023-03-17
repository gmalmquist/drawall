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
      getPos: () => App.canvas.viewport.project.point(this.src.pos),
      setPos: p => {
        const delta = Vec.between(this.src.pos, this.dst.pos);
        this.src.pos = App.canvas.viewport.unproject.point(p);
        this.dst.pos = this.src.pos.plus(delta);
      },
      distance: (pt: Point) => App.canvas.viewport.project.distance(
        new Edge(this.src.pos, this.dst.pos).distance(
          App.canvas.viewport.unproject.point(pt),
        )
      ),
      priority: 0,
      clickable: false,
    });

    entity.ecs.createEntity().add(LengthConstraint,
      100,
      () => new Edge(this.src.pos, this.dst.pos),
      edge => {
        this.src.pos = edge.src;
        this.dst.pos = edge.dst;
      },
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

    const handle = entity.add(Handle, {
      getPos: () => App.canvas.viewport.project.point(this.pos),
      setPos: p => {
        this.pos = App.canvas.viewport.unproject.point(p);
        entity.get(FixedConstraint).forEach(c => c.updateTargets([this.pos]));
      },
      priority: 1,
    });
    handle.onClick(() => this.showPopup());

    entity.add(AngleConstraint,
      Math.PI/2.,
      () => this.outgoing ?
        Vec.between(this.pos, this.outgoing.dst.pos) : null,
      () => this.incoming ?
        Vec.between(this.pos, this.incoming.src.pos) : null,
      v => {
        if (this.outgoing) {
          this.outgoing.dst.pos = this.pos.plus(v);
        }
      },
      v => {
        if (this.incoming) {
          this.incoming.src.pos = this.pos.plus(v);
        }
      },
    );

    entity.add(FixedConstraint,
      () => [ this.pos ],
      ([p]: Point[]) => { this.pos = p; },
    );
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

  showPopup() {
    this.entity.removeAll(PopupWindow);
    const p = this.entity.add(PopupWindow);
    p.title = 'Corner';
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
    const angleConstraint = this.entity.get(AngleConstraint)[0];
    ui.addLabel('Angle', 'angle')
      .addNumberInput('angle', {
        min: 0,
        max: 360,
        value: angleConstraint.angle * 180 / Math.PI,
        size: 4,
      })
      .addRadioGroup('units', [{ name: 'radians' }, { name: 'degrees', isDefault: true }])
      .newRow()
      .addLabel('strength', 'strength')
      .addSliderInput('strength', { min: 0, max: 1, initial: angleConstraint.hardness })
      .newRow();
    ui.onChange((name: string, value: string) => {
      if (name === 'angle') {
        const scale = ui.getValue('units') === 'degrees' ? Math.PI / 180 : 1;
        angleConstraint.angle = parseFloat(value) * scale;
      } else if (name === 'strength') {
        angleConstraint.hardness = parseFloat(value);
      } else if (name === 'units') {
        const scale = ui.getValue('units') === 'degrees' ? 180 / Math.PI : 1;
        ui.setValue('angle', angleConstraint.angle * scale);
      }
    });
  }
}

class Constraint extends Component {
  enforce(): void {}

  public priority: number = 0;

  // hardness between 0 and 1
  public hardness: number = 0.5;

  constructor(entity: Entity) {
    super(entity);
    this.addKind(Constraint);
  }

  get influence() {
    const dt = Math.max(0, Math.min(1, Time.delta));
    const a = lerp(this.hardness, 0, dt);
    const b = lerp(this.hardness, dt, 1);
    return lerp(this.hardness, a, b);
  }
}

class FixedConstraint extends Constraint {
  public enabled: boolean = false;
  private targets: Point[] = [];

  constructor(
    entity: Entity,
    private readonly getPoints: () => Point[],
    private readonly setPoints: (pts: Point[]) => void,
  ) {
    super(entity);
    this.hardness = 1.0;
    this.priority = 5;
  }

  updateTargets(pts: Point[]) {
    this.targets = pts; 
  }

  enforce() {
    const influence = this.influence;
    if (!this.enabled || influence === 0) {
      this.targets = this.getPoints();
      return;
    }
    const points = [...this.getPoints()];
    for (let i = 0; i < points.length && i < this.targets.length; i++) {
      points[i] = points[i].lerp(influence, this.targets[i]);
    }
    this.setPoints(points);
  }
}

class LengthConstraint extends Constraint {
  constructor(
    entity: Entity,
    private readonly length: number,
    private readonly getEdge: () => Edge | null,
    private readonly setEdge: (e: Edge) => void) {
    super(entity);
  }

  enforce() {
    const edge = this.getEdge();
    if (edge === null) return;
    const delta = this.length - edge.vector().mag();
    const correction = edge.vector().unit().scale(delta/2 * this.influence);
    this.setEdge(new Edge(
      edge.src.minus(correction),
      edge.dst.plus(correction),
    ));
  }

}

class AngleConstraint extends Constraint {
  private currentAngle: number = 0;

  constructor(
    entity: Entity,
    public angle: number,
    private readonly getLeft: () => Vec | null,
    private readonly getRight: () => Vec | null,
    private readonly setLeft: (v: Vec) => void,
    private readonly setRight: (v: Vec) => void) {
    super(entity);
  }

  enforce() {
    const left = this.getLeft();
    if (left === null) return;

    const right = this.getRight();
    if (right === null) return;

    const lu = left.unit();
    const ru = right.unit();
    const angle = lu.angle() - ru.angle();

    this.currentAngle = normalizeRadians(angle);

    const delta = normalizeRadians(this.angle) - normalizeRadians(angle);
    this.setLeft(left.rotate(delta/2 * this.influence));
    this.setRight(right.rotate(-delta/2 * this.influence));
  }
}

class DragHandle extends Component {
  constructor(entity: Entity, public readonly draggable: Draggable) {
    super(entity);
  }
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
    canvas.strokeLine(wall.src.pos, wall.dst.pos);
    canvas.lineWidth = 1;
    const ray = new Edge(wall.src.pos, wall.dst.pos).ray();
    const tickSpacing = 10; // px
    const tickSize = 10; // px
    const ticks = Math.floor(canvas.viewport.project
      .distance(ray.direction.mag()) / tickSpacing);
    for (let i = 0; i < ticks; i++) {
      const s = 1.0 * i / ticks;
      const p = ray.at(s);
      const v = ray.direction.unit()
        .scale(canvas.viewport.unproject.distance(tickSize))
        .rotate(30 * Math.PI / 180);
      canvas.strokeLine(p, p.plus(v));
    }

  }

  const joints = ecs.getComponents(WallJoint);
  for (const joint of joints) {
    const hovered = joint.entity.get(Handle).some(h => h.isHovered);
    const active = hovered || joint.entity.get(PopupWindow).some(p => p.isVisible);
    const pos = joint.pos;

    if (joint.incoming === null || joint.outgoing === null) {
      const rad = active ? 2 : 5;
      if (active) {
        canvas.lineWidth = 1;
        canvas.strokeStyle = 'black';
        canvas.fillStyle = BLUE;
        canvas.fillCircle(pos, 2);
        canvas.strokeCircle(pos, 2);
        canvas.strokeCircle(pos, 5);
      } else {
        canvas.fillStyle = 'black';
        canvas.fillCircle(pos, 2);
      }
      continue;
    }

    const incW = Vec.between(pos, joint.incoming.src.pos).unit();
    const outW = Vec.between(pos, joint.outgoing.dst.pos).unit();
    const incS = canvas.viewport.project.vec(incW).unit();
    const outS = canvas.viewport.project.vec(outW).unit();
    const angle = incS.angle() - outS.angle();
    const middle = incW.rotate(angle / 2);

    const arcRadius = active ? 20 : 10;
    const textDistance = canvas.viewport.unproject.distance(arcRadius + 12);

    const targetAngle = joint.entity.get(AngleConstraint)
      .map(a => a.angle)
      .reduce((_,a) => a, angle);
    const angleOff = normalizeRadians(targetAngle) - normalizeRadians(angle);
    const degText = (r: number, signed?: boolean) => {
      const s =`${Math.round(toDegrees(r))}°`;
      if (signed && r >= 0) {
        return `+${s}`;
      }
      return s;
    };
    const angleOffDegrees = Math.round(toDegrees(angleOff));
    const label = Math.abs(toDegrees(angleOff)) >= 1
      ? `${degText(angle)} (${degText(-angleOff, true)})`
      : degText(angle);

    canvas.beginPath();
    canvas.moveTo(pos);
    canvas.lineTo(pos.splus(canvas.viewport.unproject.distance(arcRadius), incW));
    canvas.arc(pos, arcRadius, incS.angle(), outS.angle(), true);
    canvas.closePath();

    canvas.strokeStyle = 'black';

    if (active) {
      canvas.fillStyle = 'black';
      canvas.lineWidth = 2;
      canvas.fill();
    } else {
      canvas.lineWidth = 1;
    }
    canvas.stroke();

    canvas.textAlign = 'center';
    canvas.textBaseline = 'middle';
    if (angleOffDegrees !== 0) {
      canvas.fillStyle = angleOffDegrees === 0 ? 'black'
        : angleOffDegrees > 0 ? PINK
        : BLUE;
      canvas.fillText(label, pos.splus(textDistance, middle)
        .plus(canvas.viewport.unproject.vec(new Vec(1,1))));
    }
    canvas.fillStyle = 'black';
    canvas.fillText(label, pos.splus(textDistance, middle));
  }
};

const ConstraintEnforcer = (ecs: EntityComponentSystem) => {
  const constraints = ecs.getComponents(Constraint);
  // sort ascending so that higher priority constraints
  // have the last say in the next frame's configuration.
  constraints.sort((a, b) => a.priority - b.priority);
  for (const c of constraints) {
    c.enforce();
  }
};
