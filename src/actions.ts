type UserActionId = ToolName
  | 'noop'
  | 'toggle-snap'
  | 'toggle-kinematics'
  | 'loop-select'
  | 'select-all'
  | 'recenter'
  | 'undo'
  | 'redo'
  | 'export-png'
;

interface UserAction {
  name: UserActionId,
  apply: () => void;
}

class UserActions {
  private readonly map = new Map<UserActionId, UserAction>();

  constructor() {
  }

  setup() {
    const add = (name: UserActionId, apply: () => void) => this.register({
      name, apply
    });
    const toggle = (name: UserActionId, ref: Ref<boolean>) => add(name, () => ref.set(!ref.get()));

    toggle('toggle-snap', App.ui.snapping.enableByDefaultRef);
    toggle('toggle-kinematics', App.settings.kinematics);

    add('loop-select', () => App.ui.loopSelect());
    add('select-all', () => App.ui.selectAll());

    add('recenter', () => App.viewport.recenter());

    add('undo', () => App.history.undo());
    add('redo', () => App.history.redo());

    add('export-png', () => App.imageExporter.export());
    // add('foo', () => doFoo());
  }

  register(action: UserAction) {
    if (this.map.has(action.name)) {
      throw new Error(`Already bound action ${action}.`);
    }
    this.map.set(action.name, action);
  }

  get(action: UserActionId): UserAction {
    return this.map.get(action)!;
  }

  get actions(): UserActionId[] {
    return Array.from(this.map.keys());
  }

  fire(action: UserActionId) {
    this.get(action).apply();
  }

  public evaluateKeybindings(): boolean {
    const stroke: KeyStroke = {
      keys: App.ui.pressedKeys,
    };
    const hotkey = App.keybindings.match(stroke);
    if (hotkey !== null) {
      const action = this.get(hotkey.action);
      App.log('executing keybinding', formatKeyStroke(hotkey.stroke), ':', action.name);
      action.apply();
      return true;
    }
    return false;
  }
}

