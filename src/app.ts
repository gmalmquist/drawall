class App {
  public static readonly ecs = new EntityComponentSystem();
  public static readonly pane: HTMLElement =
    document.getElementsByClassName('canvas-wrap')[0]! as HTMLElement;
  public static gui = new GUI();
  public static readonly tools = new Tools();
  public static readonly actions = new UserActions();
  public static readonly keybindings = Keybindings.defaults();
  public static readonly ui = new UiState();
  public static readonly canvas = new Canvas2d(
      document.getElementById('main-canvas') as HTMLCanvasElement)
  public static readonly settings = new Settings();
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
    App.tools.setup();
    App.actions.setup();
    App.gui.setup();
    App.ui.setup();
    setupCanvas();

    // register systems
    App.ecs.registerSystem(Recycler);

    // this renderer has to come before
    // the other ones, bc it clears the
    // canvas.
    App.ecs.registerSystem(RenderCanvas);

    App.ecs.registerSystem(AxisConstraintRenderer);
    App.ecs.registerSystem(AngleRenderer);
    App.ecs.registerSystem(WallRenderer);
    App.ecs.registerSystem(WallJointRenderer);
    App.ecs.registerSystem(RulerRenderer);

    App.ecs.registerSystem(ConstraintEnforcer);
    App.ecs.registerSystem(Kinematics);

    console.log(`
      hi! if you're here u probably are savvy enough that you'd like some hotkeys:
      ${App.keybindings.values().map(binding => `\n${binding.stroke.keys.join('+')}: ${binding.action}`).join('')}
    `.trim());
  }

  static update() {
    Time.tick();
    // nb: order matters, mostly bc it affects draw order
    // for things like tool actions.
    App.ecs.update();
    App.ui.update();
    App.tools.update();
  }

  static start() {
    App.init();
    setInterval(() => this.update(), 15);
  }
}

setTimeout(() => App.start(), 10);
