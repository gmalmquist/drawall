type Cursor = 'default' | 'none' | 'help' | 'context-menu'
  | 'pointer' | 'progress' | 'wait' | 'cell' | 'crosshair'
  | 'text' | 'vertical-text' | 'alias' | 'copy' | 'move'
  | 'no-drop' | 'grab' | 'grabbing' | 'all-scroll' | 'col-resize'
  | 'row-resize' | 'n-resize' | 's-resize' | 'w-resize'
  | 'ne-resize' | 'nw-resize' | 'se-resize' | 'sw-resize'
  | 'ew-resize' | 'ns-resize' | 'nesw-resize' | 'nwse-resize'
  | 'zoom-in' | 'zoom-out';

type ToolName = 'none' | 'pointer' | 'draw-room';

abstract class Tool {
  public readonly events = new UiEventDispatcher(
    this.constructor as (new (...args: unknown[]) => unknown)
  );

  constructor(
    public readonly name: ToolName,
  ) {
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

  private _current: Tool = new NoopTool();

  public readonly chain = new ToolChain()
    .addSingle('pointer')
    .addSingle('draw-room')
  ;

  public get current(): Tool {
    return this._current;
  }

  public register<T extends Tool>(kind: ToolKind<T>) {
    const tool = new kind();
    if (this.registry.has(tool.name)) {
      const existing = this.registry.get(tool.name)!;
      throw new Error(`Cannot register ${tool.name} to ${kind.name}, because it would overwrwite ${existing.constructor.name}.`);
    }
    this.registry.set(tool.name, tool);
   
    App.log('registered tool', tool.name, tool);

    if (this.allToolsRegistered()) {
      App.log('setting up tools.');
      this.setup();
    }
  }

  public getTools(): Tool[] {
    return Array.from(this.registry.values());
  }

  public set(name: ToolName) {
    if (this.current.name === name) {
      return;
    }
    const tool = this.registry.get(name)!;
    this.toolListeners.forEach(listener => listener(name));
    this._current = tool;
    App.pane.style.cursor = tool.cursor;
    if (typeof tool.setup !== 'undefined') {
      tool.setup();
    }
  }

  update() {
    const u = this.current.update;
    if (typeof u !== 'undefined') {
      u();
    }
  }

  private allToolsRegistered(): boolean {
    return this.chain.groups.every(
      group => group.tools.every(
        tool => this.registry.has(tool)
      )
    );
  }

  private setup() {
    const toolbar = document.getElementsByClassName('toolbar')[0]! as HTMLElement;
    this.chain.groups.forEach(group => this.setupToolGroup(toolbar, group));
    this.set('pointer');
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
      return; // don't need to add group options.
    }
  }

  private createToolButton(tool: Tool): HTMLElement {
    const button = new IconButton(tool.name, tool.icon);
    return button.element;
  }
}

