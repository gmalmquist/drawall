class App {
  public static readonly ecs = new EntityComponentSystem();
  public static readonly pane: HTMLElement =
    document.getElementsByClassName('canvas-wrap')[0]! as HTMLElement;
  public static readonly dragUi = new DragUi(App.pane);
  public static readonly canvas = new Canvas2d(
      document.getElementById('main-canvas') as HTMLCanvasElement)
  public static project = new Project();
  public static debug: boolean = false;

  constructor() {
  }

  static init() {
    App.ecs.registerSystem(AngleRenderer);

    App.ecs.registerSystem(WallRenderer);
    App.ecs.registerSystem(WallJointRenderer);

    App.ecs.registerSystem(ConstraintEnforcer);
    App.ecs.registerSystem(Kinematics);

    const wall = App.ecs.createEntity().add(Wall);
    wall.entity.name = 'wall1';
    wall.src!.pos = new Point(-150, 60);
    wall.dst!.pos = new Point(-50, 60);

    const wall2 = App.ecs.createEntity().add(Wall);
    wall2.entity.name = 'wall2';
    wall2.src = wall.dst;
    wall2.dst.pos = new Point(-20, 30);

    const wall3 = App.ecs.createEntity().add(Wall);
    wall3.entity.name = 'wall3';
    wall3.src = wall2.dst;
    wall3.dst.pos = new Point(-30, 0);

    const wall4 = App.ecs.createEntity().add(Wall);
    wall4.entity.name = 'wall4';
    wall4.src = wall3.dst;
    wall4.dst = wall.src;

    wall.src.entity.name = 'joint1';
    wall2.src.entity.name = 'joint2';
    wall3.src.entity.name = 'joint3';
    wall3.dst.entity.name = 'joint4';

    // enable length and angle constraints
    App.ecs.getComponents(AngleConstraint).forEach(a => { a.enabled = true; });
    //App.ecs.getComponents(LengthConstraint).forEach(a => { a.enabled = true; });
  }

  static update() {
    App.ecs.update();
    App.dragUi.update();
  }
}

App.init();

