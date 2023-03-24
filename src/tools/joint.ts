class JointTool extends SnappingTool {
  constructor() {
    super('joint tool');
  }

  override get icon(): URL {
    return Icons.jointTool;
  }

  override get cursor(): Cursor {
    return 'default';
  }

  override setup() {
    this.events.onMouse('click', e => {
      const joint = App.ui.getHandleAt(e.position, h => h.entity.has(WallJoint));
      if (joint !== null) {
        App.ui.select(joint);
        return;
      }
      const wall = App.ui.getHandleAt(e.position, h => h.entity.has(Wall));
      if (wall !== null) {
        this.split(wall.entity.only(Wall), e.position);
        return;
      }
      App.ui.clearSelection();
    });
    this.events.onMouse('move', e => {
      const handle = App.ui.getHandleAt(e.position, h => h.entity.has(Wall) || h.entity.has(WallJoint));
      App.pane.style.cursor = handle === null ? this.cursor : 'pointer';

      if (handle?.entity?.has(WallJoint)) {
        handle.hovered = true;
      }
      App.ecs.getComponents(Handle)
        .filter(h => h !== handle)
        .forEach(h => h.hovered = false);
    });

    const pointer = App.tools.getTool('pointer tool');

    this.events.addDragListener({
      onStart: e => {
        const joint = App.ui.getHandleAt(e.start, h => h.entity.has(WallJoint));
        if (joint === null) return null;
        App.ui.select(joint);
        pointer.events.handleDrag(e);
      },
      onUpdate: (e, _joint) => {
        pointer.events.handleDrag(e);
      },
      onEnd: (e, _joint) => {
        pointer.events.handleDrag(e);
      },
    });
  }

  override update() {
  }

  override onToolSelected() {
    App.ui.clearSelection();
  }

  split(wall: Wall, position: Position) {
    const split = wall.splitWall(position);
    if (split === null) return;
    const [one, two] = split;
    const joint = one.dst;
    App.ui.setSelection(joint.entity.only(Handle));
  }
}

App.tools.register(JointTool);

