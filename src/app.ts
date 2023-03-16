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

    const wall = App.ecs.createEntity().add(Wall);
    wall.src!.pos = new Point(-150, 60);
    wall.dst!.pos = new Point(-50, 60);

    const wall2 = App.ecs.createEntity().add(Wall);
    wall2.src = wall.dst;
    wall2.dst.pos = new Point(-20, 30);
  }
}

App.init();

