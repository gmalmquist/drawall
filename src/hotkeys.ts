interface KeyStroke {
  keys: string[];
}

interface Keybinding {
  readonly action: UserActionId;
  readonly stroke: KeyStroke;
}

const formatKeyStroke = (stroke: KeyStroke): string => {
  return stroke.keys.sort((a, b) => b.length - a.length).join(' + ');
};

interface PartialBinding {
  to: (action: UserActionId) => void;
}

class Keybindings {
  static defaults(): Keybindings {
    const kb = new Keybindings();
    // bind common "default tool" hotkeys from various
    // other cad and graphical apps
    kb.bind('s').to('pointer tool');
    kb.bind('a').to('pointer tool');
    kb.bind(' ').to('pointer tool');
    kb.bind('Escape').to('pointer tool');
    kb.bind('r').to('room tool');
    kb.bind('p').to('pan tool');
    kb.bind('j').to('joint tool');
    kb.bind('Shift', '%').to('toggle-snap');
    kb.bind('k').to('toggle-kinematics');
    kb.bind('L').to('loop-select');
    kb.bind('Control', 'l').to('loop-select');
    kb.bind('A').to('select-all');
    kb.bind('Control', 'a').to('select-all');
    return kb;
  }

  private readonly bindings = new Array<Keybinding>();

  constructor() {
  }

  values(): Keybinding[] {
    return this.bindings.map(x => x);
  }

  bind(...keys: string[]): PartialBinding {
    return {
      to: (action: UserActionId) => {
        this.add({
          action,
          stroke: { keys },
        });
      },
    };
  }

  add(binding: Keybinding) {
    this.bindings.push(binding);
  }

  match(stroke: KeyStroke): Keybinding | null {
    if (stroke.keys.length === 0) return null;
    const keys = new Set(stroke.keys);
    const bindings = this.values()
      .sort((a, b) => b.stroke.keys.length - a.stroke.keys.length);
    for (const binding of bindings) {
      if (binding.stroke.keys.length === 0) {
        continue;
      }
      if (binding.stroke.keys.every(k => keys.has(k))) {
        return binding;
      }
    }
    return null;
  }
}

