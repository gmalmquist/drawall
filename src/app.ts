class App {
  public static readonly ecs = new EntityComponentSystem();
  public static readonly pane: HTMLElement =
    document.getElementsByClassName('canvas-wrap')[0]! as HTMLElement;
  public static readonly referenceImages: HTMLElement =
    document.getElementById('reference-images') as HTMLElement;
  public static readonly furnitureImages: HTMLElement =
    document.getElementById('furniture-images') as HTMLElement;
  public static readonly uiJail: HTMLElement =
    document.getElementById('ui-jail') as HTMLElement;
  public static gui = new GUI();
  public static readonly tools = new Tools();
  public static readonly actions = new UserActions();
  public static readonly keybindings = Keybindings.defaults();
  public static readonly ui = new UiState();
  public static readonly viewport = new Viewport();
  public static readonly canvas = new Canvas2d(
    document.getElementById('main-canvas') as HTMLCanvasElement,
    true,
  );
  public static readonly background = new Canvas2d(
    document.getElementById('back-canvas') as HTMLCanvasElement,
    false,
  );
  public static readonly foreground = new VectorCanvas(
    document.getElementById('foreground-svg')!);
  public static readonly settings = new Settings();
  public static readonly project = new Project();
  public static readonly io = new IoUtil();
  public static readonly history = new ProjectHistory();
  public static readonly imageExporter = new ImageExporter();
  public static readonly rendering = Refs.of<boolean>(false);
  public static readonly renderReady = Refs.of<boolean>(false);
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
    App.project.setup();
    App.settings.setup();
    App.viewport.setup();
    App.background.setup();
    App.canvas.setup();
    App.foreground.setup();
    App.tools.setup();
    App.actions.setup();
    App.gui.setup();
    App.ui.setup();
    App.imageExporter.setup();

    // register systems
    App.ecs.registerSystem(Recycler);

    App.ecs.registerSystem(GridRenderer);

    // nb: order matters for these; it determines the
    // draw order
    App.ecs.registerSystem(RectangularRenderer);
    App.ecs.registerSystem(AxisConstraintRenderer);
    App.ecs.registerSystem(RoomRenderer);
    App.ecs.registerSystem(AngleRenderer);
    App.ecs.registerSystem(WallRenderer);
    App.ecs.registerSystem(WallJointRenderer);
    App.ecs.registerSystem(FurnitureRenderer);
    App.ecs.registerSystem(RulerRenderer);
    App.ecs.registerSystem(MarkupRenderer);

    App.ecs.registerSystem(DebugRenderer);

    App.ecs.registerSystem(ConstraintEnforcer);
    App.ecs.registerSystem(Kinematics);

    App.project.loadLocal();

    console.log(`
      hi! if you're here u probably are savvy enough that you'd like some hotkeys:
      ${App.keybindings.values().map(binding => `\n${formatKeyBinding(binding)}`).join('')}
    `.trim());
  }

  static update() {
    Time.tick();

    // important to get this up front before anything runs
    const isRendering = App.rendering.get();
    if (isRendering) {
      App.renderReady.set(false);
    }

    // nb: order matters, mostly bc it affects draw order
    // for things like tool actions.
    App.background.update();
    App.canvas.update();
    App.foreground.update();
    App.ecs.update();
    App.ui.update();
    App.tools.update();
    App.project.update();

    if (isRendering) {
      App.renderReady.set(true);
    }
  }

  static start() {
    App.pane.style.opacity = '0';

    App.init();
    setInterval(() => this.update(), 15);

    setTimeout(() => {
      // give images etc time to load and position, so
      // things don't look like they're glitching tf out
      // while the app is first loading.
      App.pane.style.opacity = '1';
    }, 100);
  }
}

setTimeout(() => App.start(), 10);

const DebugRenderer = (ecs: EntityComponentSystem) => {
  if (!App.debug) return;

  App.canvas.text({
    text: `fps: ${Time.fps}`,
    point: Position(
      new Point(
        App.viewport.screen_width - 20,
        App.viewport.screen_height - 20,
      ), 
      'screen',
    ),
    align: 'right',
    baseline: 'bottom',
    fill: 'black',
  });

  const pressed = App.ui.pressedKeys;
  if (pressed.length > 0) {
    App.canvas.text({
      text: `keys: ${pressed.map(k => k === ' ' ? '⎵' : k).join('+')}`,
      point: Position(
        new Point(
          App.viewport.screen_width - 20,
          App.viewport.screen_height - 20 - App.settings.fontSize * 1.25,
        ), 
        'screen',
      ),
      align: 'right',
      baseline: 'bottom',
      fill: 'black',
    });
  }
};

