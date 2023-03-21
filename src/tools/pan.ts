class PanTool extends Tool {
  constructor() {
    super('pan tool');

    this.events.addDragListener({
      onStart: (e) => {
        e.setSnapping({
          snapByDefault: false,
          allowLocal: false,
          allowGlobal: true,
          allowGeometry: false,
        });
        // have to save original transformations
        return ({
          origin: App.canvas.viewport.origin,
          project: App.canvas.viewport.project,
          unproject: App.canvas.viewport.unproject,
        });
      },
      onUpdate: (e, context) => {
        const { origin, project, unproject } = context;
        App.canvas.viewport.origin = origin.minus(unproject.vec(e.delta.get('screen')));
        App.canvas.updateTransforms();
        return context;
      },
      onEnd: (e, context) => {
      },
    });
  }

  get cursor(): Cursor {
    return 'grab';
  }

  override setup() {}

  override update() {}
}

App.tools.register(PanTool);

