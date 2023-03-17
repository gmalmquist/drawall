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

    entity.add(DragHandle, {
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

    entity.add(DragHandle, {
      getPos: () => App.canvas.viewport.project.point(this.pos),
      setPos: p => {
        this.pos = App.canvas.viewport.unproject.point(p);
      },
      distance: (pt: Point) => Vec.between(
        App.canvas.viewport.project.point(this.pos), pt
      ).mag(),
      onClick: () => this.showPopup(),
      priority: 1,
    });

    const ac = entity.add(AngleConstraint,
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
    ac.hardness = 0.5;
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
    const angleConstraint = this.entity.get(AngleConstraint)[0];
    const p = this.entity.add(PopupWindow);
    p.title = 'Corner';
    const ui = p.getUiBuilder()
      .addLabel('Angle', 'angle')
      .addNumberInput('angle', {
        min: 0,
        max: 360,
        value: angleConstraint.angle * 180 / Math.PI,
        size: 4,
      })
      .addRadioGroup('units', [{ name: 'radians' }, { name: 'degrees', isDefault: true }])
      .newRow()
      .addLabel('strength', 'strength')
      .addSliderInput('strength', { min: 0, max: 1, initial: 0.5 })
      .newRow()
      .addResetButton();
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
    p.show();
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
    const angle = Math.acos(lu.dot(ru));
    const delta = radianDelta(angle, this.angle);
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
  const walls = ecs.getComponents(Wall);
  for (const wall of walls) {
    if (wall.src === null || wall.dst ===  null) continue;
    const canvas = App.canvas;
    canvas.strokeStyle = 'black';
    canvas.lineWidth = 1;
    canvas.strokeLine(wall.src.pos, wall.dst.pos);
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
};

const ConstraintEnforcer = (ecs: EntityComponentSystem) => {
  const constraints = ecs.getComponents(Constraint);
  constraints.sort((a, b) => a.priority - b.priority);
  for (const c of constraints) {
    c.enforce();
  }
};
