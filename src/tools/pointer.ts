class PointerTool extends Tool {
  private readonly hovered: Set<Handle> = new Set();

  constructor() {
    super('pointer tool');

    this.events.onMouse('click', e => {
      const clickable = App.ui.getHandleAt(e.position, h => h.clickable);
      if (clickable !== null) {
        clickable.events.handleMouse(e);
      }
    });

    this.events.onMouse('move', e => {
      if (App.ui.dragging) return;

      const clickable = App.ui.getHandleAt(e.position, h => h.clickable);
      if (clickable !== null) {
        App.pane.style.cursor = 'pointer';
        this.setHovered(clickable);
        return;
      }

      const draggable = App.ui.getHandleAt(e.position, h => h.draggable);
      if (draggable !== null) {
        App.pane.style.cursor = 'grab';
        this.setHovered(draggable);
        return;
      }

      this.clearHovered();
    });

    const panTool = App.tools.getTool('pan tool');

    this.events.addDragListener<UiEventDispatcher>({
      onStart: e => {
        App.pane.style.cursor = 'grabbed';
        const handle = App.ui.getHandleAt(e.start, h => h.draggable);
        if (handle !== null) {
          App.ui.setSelection(handle);
          handle.events.handleDrag(e);
          return handle.events;
        }
        panTool.events.handleDrag(e);
        return panTool.events;
      },
      onUpdate: (e, dispatcher) => dispatcher.handleDrag(e),
      onEnd: (e, dispatcher) => {
        dispatcher.handleDrag(e);
        App.pane.style.cursor = 'default';
      },
    });
  }

  private setHovered(handle: Handle) {
    if (this.hovered.has(handle)) return;
    this.clearHovered();
    this.hovered.add(handle);
    handle.hovered = true;
  }

  private clearHovered() {
    Array.from(this.hovered)
      .forEach(h => h.hovered = false);
    this.hovered.clear();
  }

  override setup() {
  }

  override update() {
  }
}

App.tools.register(PointerTool);

