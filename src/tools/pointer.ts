class PointerTool extends Tool {
  private readonly hovered: Set<Handle> = new Set();

  constructor() {
    super('pointer tool');

    this.events.onMouse('down', e => {
      const handle = App.ui.getHandleAt(e.position, h => h.clickable || h.draggable);
      if (!App.ui.multiSelecting) {
        App.ui.clearSelection();
      }
      if (handle !== null) {
        App.ui.addSelection(handle);
      }
    });

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
        App.pane.style.cursor = clickable.cursor || 'pointer';
        this.setHovered(clickable);
        return;
      }

      const draggable = App.ui.getHandleAt(e.position, h => h.draggable);
      if (draggable !== null) {
        App.pane.style.cursor = draggable.cursor || 'grab';
        this.setHovered(draggable);
        return;
      }

      App.pane.style.cursor = this.cursor;

      this.clearHovered();
    });

    const panTool = App.tools.getTool('pan tool');

    this.events.addDragListener<UiEventDispatcher>({
      onStart: e => {
        const handle = App.ui.getHandleAt(e.start, h => h.draggable);
        if (handle !== null) {
          App.pane.style.cursor = handle.cursor || 'grabbed';
          App.ui.setSelection(handle);
          e.setSnapping(handle.snapping);
          handle.events.handleDrag(e);
          return handle.events;
        }
        App.pane.style.cursor = 'grabbed';
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

