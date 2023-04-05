interface KeyStroke {
  keys: string[];
}

interface Keybinding {
  readonly action: UserActionId;
  readonly stroke: KeyStroke;
}

const formatKeyStroke = (stroke: KeyStroke): string => {
  return stroke.keys.sort((a, b) => b.length - a.length)
    .map(k => k === ' ' ? '⎵' : k)
    .join(' + ');
};

const formatKeyBinding = (keybinding: Keybinding): string => {
  return `${formatKeyStroke(keybinding.stroke)}: ${keybinding.action}`;
}

interface PartialBinding {
  to: (action: UserActionId) => void;
}

class Keybindings {
  static defaults(): Keybindings {
    const kb = new Keybindings();
    // bind common "default tool" hotkeys from various
    // other cad and graphical apps
    kb.bind('s').to('pointer tool'); // matches inkscape hotkey
    kb.bind(' ').to('pointer tool'); // matches sketchup hotkey
    kb.bind('Escape').to('pointer tool'); // nearly universal convention
    kb.bind('h').to('pan tool'); // matches sketchup hotkey
    kb.bind('r').to('room tool');
    kb.bind('t').to('ruler tool'); // 't' as in tape measure, matches sketchup
    kb.bind('j').to('joint tool');
    kb.bind('n').to('joint tool'); // matches inkscape hotkey
    kb.bind('d').to('furniture tool');
    kb.bind('f').to('flip-h');
    kb.bind('Shift', 'F').to('flip-v');
    kb.bind('Shift', '%').to('toggle-snap');
    kb.bind('k').to('toggle-kinematics');
    kb.bind('Control', 'l').to('loop-select'); // matches blender
    kb.bind('Control', 'a').to('select-all'); // nearly universal convention lol
    kb.bind('0').to('recenter'); // common convention
    kb.bind('Control', 'z').to('undo'); // universal 
    kb.bind('Control', 'Shift', 'Z').to('redo'); // common convention
    kb.bind('Shift', 'D').to('export-png'); // google drive?
    kb.bind('Control', '+').to('zoom-in');
    kb.bind('Control', '=').to('zoom-in');
    kb.bind('Control', '-').to('zoom-out');
    kb.bind('Control', '_').to('zoom-out');
    kb.bind('Control', 's').to('save'); // universal
    kb.bind('Control', 'n').to('new'); // universal
    kb.bind('Control', 'o').to('open'); // universal
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
      if (this.matches(stroke, binding)) {
        return binding;
      }
    }
    return null;
  }

  private matches(stroke: KeyStroke, binding: Keybinding): boolean {
    const strokeKeys = new Set(stroke.keys);
    const bindingKeys = new Set(binding.stroke.keys);
    return stroke.keys.every(k => bindingKeys.has(k))
      && binding.stroke.keys.every(k => strokeKeys.has(k));
  }
}

