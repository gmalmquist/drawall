type UserActionId = ToolName
  | 'noop'
;

interface UserAction {
  name: UserActionId,
  apply: () => void;
}

class UserActions {
  private readonly map = new Map<UserActionId, UserAction>();

  constructor() {
    const add = (name: UserActionId, apply: () => void) => this.register({
      name, apply
    });
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
}

