type UserActionId =
  'pointer tool'
  | 'room tool'
;

interface UserAction {
  name: UserActionId,
  apply: () => void;
}

class UserActions {
  private readonly map = new Map<UserActionId, UserAction>();

  constructor() {
    const add = (name: UserActionId, apply: () => void) => this.set({
      name, apply
    });
    add('pointer tool', () => App.tools.set('pointer')); 
    add('room tool', () => App.tools.set('draw-room')); 
  }

  set(action: UserAction) {
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

