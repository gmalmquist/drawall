class App {
  public static readonly ecs = new EntityComponentSystem();
  public static readonly pane: HTMLElement =
    document.getElementsByClassName('canvas-wrap')[0]! as HTMLElement;
  public static readonly tools = new Tools();
  public static readonly actions = new UserActions();
  public static readonly keybindings = Keybindings.defaults();
  public static readonly ui = new UiState();
  public static readonly canvas = new Canvas2d(
      document.getElementById('main-canvas') as HTMLCanvasElement)
  public static project = new Project();
  public static debug: boolean = false;

  constructor() {
  }

  static ifDebug<T>(f: () => T | undefined): T | undefined {
    if (App.debug) return f();
  }

  static log(...args: any[]) {
    if (!App.debug) return;
    const text = args.map(a => {
      if (typeof a === 'undefined' || a === null) {
        return '∅';
      }
      if (typeof a === 'string' || typeof a === 'number') {
        return `${a}`;
      }
      if (typeof a === 'object' && a.toString() !== '[object Object]') {
        return a.toString();
      }
      return JSON.stringify(a);
    }).join(' ');
    console.log(text);
  }

  static init() {
    App.ecs.registerSystem(Recycler);

    App.ecs.registerSystem(AngleRenderer);
    App.ecs.registerSystem(WallRenderer);
    App.ecs.registerSystem(WallJointRenderer);

    App.ecs.registerSystem(ConstraintEnforcer);
    App.ecs.registerSystem(Kinematics);

    const pt = (x: number, y: number) => Position(new Point(x, y), 'model');

    const wall = App.ecs.createEntity().add(Wall);
    wall.entity.name = 'wall1';
    wall.src!.pos = pt(-150, 60);
    wall.dst!.pos = pt(-50, 60);

    const wall2 = App.ecs.createEntity().add(Wall);
    wall2.entity.name = 'wall2';
    wall2.src = wall.dst;
    wall2.dst.pos = pt(-20, 30);

    const wall3 = App.ecs.createEntity().add(Wall);
    wall3.entity.name = 'wall3';
    wall3.src = wall2.dst;
    wall3.dst.pos = pt(-30, 0);

    const wall4 = App.ecs.createEntity().add(Wall);
    wall4.entity.name = 'wall4';
    wall4.src = wall3.dst;
    wall4.dst = wall.src;

    wall.src.entity.name = 'joint1';
    wall2.src.entity.name = 'joint2';
    wall3.src.entity.name = 'joint3';
    wall3.dst.entity.name = 'joint4';

    // enable length and angle constraints
    App.ecs.getComponents(AngleConstraint).forEach((a, i) => {
      a.enabled = true;
      a.targetAngle = Angle(Radians(Math.PI/2), 'model');
    });
    //App.ecs.getComponents(LengthConstraint).forEach(a => { a.enabled = true; });
  }

  static update() {
    App.ecs.update();
    App.ui.update();
  }
}

App.init();

