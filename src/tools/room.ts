class DrawRoomTool extends Tool {
  constructor() {
    super('draw-room');
  }

  get cursor(): Cursor {
    return 'crosshair';
  }

  override setup() {}

  override update() {}
}

App.tools.register(DrawRoomTool);
