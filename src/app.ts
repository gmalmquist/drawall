class App {
  public static readonly ecs = new EntityComponentSystem();
  public static readonly canvas: Canvas2d = new Canvas2d(
      document.getElementById('main-canvas') as HTMLCanvasElement);
  public static readonly mouse: Mouse = new Mouse();

  constructor() {
  }

  static init() {
    App.ecs.registerSystem(WallRenderer);
    App.ecs.registerSystem(ConstraintEnforcer);

    const wall = new Wall();
    const e = App.ecs.createEntity(wall);
    wall.src!.pos = new Point(-150, 60);
    wall.dst!.pos = new Point(-50, 60);

    const wall2 = new Wall();
    App.ecs.createEntity(wall2);
    wall2.src = wall.dst;
    wall2.src.outgoing = wall2;
    wall2.dst.pos = new Point(-20, 30);
  }
}

App.init();

