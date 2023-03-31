type ToolName = 'none' 
  | 'pointer tool'
  | 'room tool'
  | 'joint tool'
  | 'pan tool'
  | 'ruler tool'
;

abstract class Tool {
  public readonly events = new UiEventDispatcher(
    this.constructor as (new (...args: unknown[]) => unknown)
  );

  constructor(
    public readonly name: ToolName,
  ) {
  }

  get allowSnap(): boolean {
    return false;
  }

  get description(): string {
    return '';
  }

  get icon(): URL | null {
    return null;
  }

  get cursor(): Cursor {
    return 'default';
  }

  createUi(form: AutoForm): void {
  }

  onToolSelected() {
  }

  abstract update(): void;

  abstract setup(): void;
}

interface ToolGroup {
  readonly name: string;
  readonly tools: ToolName[];
  readonly icon?: URL;
  current: ToolName;
}

type ToolKind<T extends Tool> = new () => T;

class NoopTool extends Tool {
  constructor() {
    super('none');
  }

  override setup() {}
  override update() {}
}

class ToolChain {
  public readonly groups: ToolGroup[] = [];
  private readonly groupMap = new Map<string, ToolGroup>();

  getGroup(name: string): ToolGroup {
    return this.groupMap.get(name)!;
  }

  addSingle(tool: ToolName): ToolChain {
    return this.addGroup(tool, [ tool ]);
  }

  addGroup(name: string, tools: ToolName[], icon?: URL): ToolChain {
    if (this.groupMap.has(name)) {
      throw new Error(`Cannot overwrite tool group ${name}.`);
    }
    if (tools.length === 0) {
      throw new Error(`Cannot create empty tool group ${name}.`);
    }
    const group = { name, tools, icon, current: tools[0] };
    this.groups.push(group);
    this.groupMap.set(name, group);
    return this;
  }
}

class Tools {
  private readonly registry = new Map<ToolName, Tool>();
  private readonly toolListeners = new Array<(tool: ToolName) => void>();

  private _current: Ref<Tool> = Refs.of(
    new NoopTool(),
    (a, b) => a.name === b.name,
  );

  public readonly chain = new ToolChain()
    .addSingle('pointer tool')
    .addSingle('pan tool')
    .addSingle('room tool')
    .addSingle('ruler tool')
    .addSingle('joint tool')
  ;

  public get current(): Tool {
    return this._current.get();
  }

  public get currentRef(): Ref<Tool> {
    return this._current;
  }

  public register<T extends Tool>(kind: ToolKind<T>) {
    const tool = new kind();
    if (this.registry.has(tool.name)) {
      const existing = this.registry.get(tool.name)!;
      throw new Error(`Cannot register ${tool.name} to ${kind.name}, because it would overwrwite ${existing.constructor.name}.`);
    }
    this.registry.set(tool.name, tool);

    // register action to switch to this tool (can be used by hotkeys)
    App.actions.register({ name: tool.name, apply: () => this.set(tool.name) });

    App.log('registered tool', tool.name, tool);
  }

  public getTools(): Tool[] {
    return Array.from(this.registry.values());
  }

  public getTool(name: ToolName): Tool {
    return this.registry.get(name)!;
  }

  public set(name: ToolName) {
    if (this.current.name === name) {
      return;
    }
    const tool = this.registry.get(name)!;
    this.toolListeners.forEach(listener => listener(name));
    this._current.set(tool);
    App.pane.style.cursor = tool.cursor;
    App.gui.tool.clear();
    const ui = new AutoForm();
    tool.createUi(ui)
    ui.inflate(App.gui.tool);
    tool.onToolSelected();
  }

  update() {
    this.current.update();
  }

  private allToolsRegistered(): boolean {
    return this.chain.groups.every(
      group => group.tools.every(
        tool => this.registry.has(tool)
      )
    );
  }

  setup() {
    for (const tool of this.registry.values()) {
      tool.setup();
    }

    const toolbar = document.getElementsByClassName('toolbar')[0]! as HTMLElement;
    this.chain.groups.forEach(group => this.setupToolGroup(toolbar, group));
    this.set('pointer tool');
  }

  private setupToolGroup(toolbar: HTMLElement, group: ToolGroup) {
    const tools = group.tools.map(name => this.registry.get(name)!);
    const icon = group.icon || (tools.length === 1 ? tools[0].icon : undefined);
    const button = new IconButton(group.name, icon);
    toolbar.appendChild(button.element);

    button.onClick(() => this.set(group.current));

    this.toolListeners.push(tool => {
      button.selected = new Set(group.tools).has(tool);
    });

    if (tools.length === 1) {
      button.tooltip = this.getTooltip(group.tools[0]!);
      return; // don't need to add group options.
    }
  }

  private createToolButton(tool: Tool): HTMLElement {
    const button = new IconButton(tool.name, tool.icon);
    return button.element;
  }

  private getTooltip(tool: ToolName): string {
    const parts: string[] = [tool];
    const keybinds = App.keybindings.values()
      .filter(kb => kb.action === tool)
      .map(kb => kb.stroke.keys.join('+'))
      .join(' or ');
    if (keybinds.length > 0) {
      parts.push(`(${keybinds})`);
    }
    const description = this.registry.get(tool)!.description;
    if (description.length > 0) {
      parts.push(`— ${description}`);
    }
    return parts.join(' ');
  }
}

