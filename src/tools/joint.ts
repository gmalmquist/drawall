class JointTool extends Tool {
  constructor() {
    super('joint tool');
  }

  override get icon(): URL {
    return Icons.jointTool;
  }

  get cursor(): Cursor {
    return 'default';
  }

  override setup() {
    this.events.onMouse('click', e => {
      const wall = App.ui.getHandleAt(e.position, h => h.entity.has(Wall));
      if (wall !== null) {
        this.split(wall.entity.only(Wall), e.position);
      }
    });
    this.events.onMouse('move', e => {
      const wall = App.ui.getHandleAt(e.position, h => h.entity.has(Wall));
      App.pane.style.cursor = wall === null ? this.cursor : 'pointer';
    });
  }

  override update() {
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

