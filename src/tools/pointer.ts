class PointerTool extends Tool {
  private readonly hovered: Set<Handle> = new Set();

  constructor() {
    super('pointer tool');

    this.events.onMouse('down', e => {
      const handle = App.ui.getHandleAt(
        e.position, 
        h => h.clickable || h.draggable || h.selectable
      );
      if (handle === null) {
        App.ui.clearSelection();
      } else if (App.ui.selection.length > 1 || App.ui.multiSelecting || handle.selected) {
        App.ui.addSelection(handle);
      } else {
        App.ui.setSelection(handle);
      }
    });

    this.events.onMouse('click', e => {
      const handle = App.ui.getHandleAt(e.position, h => h.clickable || h.selectable);
      if (handle === null) {
        App.ui.clearSelection();
        return;
      }

      if (handle.clickable) {
        handle.events.handleMouse(e);
      }

      if (handle.selectable) {
        if (App.ui.multiSelecting) {
          App.ui.addSelection(handle);
        } else {
          App.ui.setSelection(handle);
        }
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
        const selection = App.ui.selection;
        if (selection.length > 0) {
          const snaps = selection
            .filter(s => typeof s.snapping !== 'undefined')
            .map(s => s.snapping as Snapping);
          const snapping: Snapping = {
            snapByDefault: snaps.every(s => s.snapByDefault)
              && !snaps.every(s => typeof s.preferredAxis !== 'undefined'),
            localAxes: () => snaps
              .map(s => s.localAxes)
              .map(a => typeof a === 'undefined' ? [] : a())
              .reduce((arr, a) => [...arr, ...a], []),
            preferredAxis: snaps.length === 1 ? snaps[0].preferredAxis : undefined,
            allowLocal: snaps.some(s => s.allowLocal !== false),
            allowGlobal: snaps.some(s => s.allowGlobal !== false),
            allowGeometry: snaps.some(s => s.allowGeometry !== false),
          };
          const cursors = new Set<Cursor>();
          const dispatcher = new UiEventDispatcher(PointerTool);
          for (const handle of selection) {
            dispatcher.forward(handle.events);
            if (handle.cursor) {
              cursors.add(handle.cursor);
            }
          }
          const cursor = cursors.size === 1 ? Array.from(cursors)[0]! : 'grabbed';
          App.pane.style.cursor = cursor;
          dispatcher.handleDrag(e);
          e.setSnapping(snapping);
          return dispatcher;
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

