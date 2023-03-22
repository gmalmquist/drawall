class PointerTool extends Tool {
  private readonly hovered: Set<Handle> = new Set();
  private readonly selectionRect = Refs.of<Rect | null>(null, (a, b) => {
    if ((a === null) !== (b === null)) {
      return false;
    }
    if (a === null || b === null) return true;
    return a.eq(b); 
  });
  private readonly strictSelect = Refs.of<boolean>(false);
  private lastClickHandle: Handle | null = null;
  private lastClickAt: number = 0;

  constructor() {
    super('pointer tool');
  }

  private setHovered(handle: Handle) {
    if (this.hovered.has(handle)) return;
    this.clearHovered();
    this.hovered.add(handle);
    handle.hovered = true;
  }

  private addHovered(handle: Handle) {
    if (this.hovered.has(handle)) return;
    this.hovered.add(handle);
    handle.hovered = true;
  }

  private clearHovered() {
    Array.from(this.hovered)
      .forEach(h => h.hovered = false);
    this.hovered.clear();
  }

  override setup() {
    this.strictSelect.onChange(strict => {
      if (strict) this.clearHovered();
    });

    this.events.onKey('keydown', e => {
      if (e.key === 'Escape') {
        App.ui.clearSelection();
        this.clearHovered();
        App.ecs.getComponents(Handle).forEach(h => {
          h.hovered = false;
          h.selected = false;
        });
        App.ui.cancelDrag();
      }
    });

    this.events.onMouse('down', e => {
      const handle = App.ui.getHandleAt(
        e.position, 
        h => h.clickable || h.draggable || h.selectable
      );
      if (handle === null) {
        if (!App.ui.multiSelecting) {
          App.ui.clearSelection();
          this.clearHovered();
          App.ecs.getComponents(Handle).forEach(h => h.hovered = false);
        }
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
        if (this.lastClickHandle === handle && (Time.now - this.lastClickAt) < 0.5) {
          // handle double-click
          if (handle.entity.has(Wall)) {
            // nb: we could reference it directly, but this will
            // make the UI buttons flicker, which is good for
            // letting ppl know where the tool is.
            App.tools.getTool('joint tool').events.handleMouse(e);
            return;
          }
        }
        this.lastClickHandle = handle;
        this.lastClickAt = Time.now;
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

      const clickable = App.ui.getHandleAt(e.position, h => h.clickable && h.hoverable);
      if (clickable !== null) {
        const c = clickable.getContextualCursor() || this.cursor;
        App.pane.style.cursor = clickable.getContextualCursor() || this.cursor;
        this.setHovered(clickable);
        return;
      }

      const draggable = App.ui.getHandleAt(e.position, h => h.draggable && h.hoverable);
      if (draggable !== null) {
        App.pane.style.cursor = draggable.getContextualCursor() || this.cursor;
        this.setHovered(draggable);
        return;
      }

      App.pane.style.cursor = this.cursor;
      this.clearHovered();
    });

    const drawSelect = this.getDrawSelectDispatcher();

    type NamedAxisP = (() => NamedAxis) | undefined;

    this.events.addDragListener<UiEventDispatcher>({
      onStart: e => {
        const overHandle = App.ui.getHandleAt(e.start, h => h.draggable) !== null;
        const selection = App.ui.selection;
        if (selection.length > 0 && overHandle) {
          const snaps = selection
            .filter(s => typeof s.snapping !== 'undefined')
            .map(s => s.snapping as Snapping);
          const getPreferred = (arr:  NamedAxisP[]): NamedAxisP => {
            const cmp = (fa: NamedAxisP, fb: NamedAxisP): boolean => {
              if (typeof fa === 'undefined' || typeof fb === 'undefined') return false;
              const [a, b] = [fa(), fb()];
              const one = a.direction.unit();
              const two = b.direction.unit().to(one.space);
              const negate = one.dot(two).sign < 0 ? -1 : 1;
              const delta = Angles.shortestDelta(one.angle(), two.neg().angle());
              return unwrap(toDegrees(delta.get(delta.space))) < 1;
            };
            return arr.every(el => cmp(arr[0], el)) ? arr[0] : undefined;
          };
          const preferredAxis = getPreferred(snaps.map(s => s.preferredAxis));
          const snapping: Snapping = {
            snapByDefault: snaps.every(s => s.snapByDefault) && typeof preferredAxis !== 'undefined',
            localAxes: () => snaps
              .map(s => s.localAxes)
              .map(a => typeof a === 'undefined' ? [] : a())
              .reduce((arr, a) => [...arr, ...a], []),
            preferredAxis,
            allowLocal: snaps.some(s => s.allowLocal !== false),
            allowGlobal: snaps.some(s => s.allowGlobal !== false),
            allowGeometry: snaps.some(s => s.allowGeometry !== false),
          };
          console.log(JSON.stringify(snapping, undefined, 2));
          console.log(selection);
          const cursors = new Set<Cursor>();
          const dispatcher = new UiEventDispatcher(PointerTool);
          for (const handle of selection) {
            dispatcher.forward(handle.events);
            if (handle.cursor) {
              cursors.add(handle.getContextualCursor());
            }
          }
          const cursor = cursors.size === 1 ? Array.from(cursors)[0]! : 'grabbing';
          App.pane.style.cursor = cursor;
          dispatcher.handleDrag(e);
          e.setSnapping(snapping);
          return dispatcher;
        }
        drawSelect.handleDrag(e);
        return drawSelect;
      },
      onUpdate: (e, dispatcher) => dispatcher.handleDrag(e),
      onEnd: (e, dispatcher) => {
        dispatcher.handleDrag(e);
        App.pane.style.cursor = 'default';
      },
    });
  }

  override update() {
    const rect = this.selectionRect.get();
    if (rect === null) return;

    const palette = this.strictSelect.get() 
      ? ['hsla(348,79%,81%,0.3)', 'hsla(348,79%,20%,0.3)'] 
      : ['hsla(196,94%,66%,0.3)', 'hsla(196,94%,20%,0.3)'];

    const [fill, stroke] = palette;

    App.canvas.fillStyle = fill;
    App.canvas.strokeStyle = stroke;
    App.canvas.lineWidth = 1;
    App.canvas.rect(rect);
    App.canvas.fill();
    App.canvas.stroke();
  }

  private getDrawSelectDispatcher(): UiEventDispatcher {
    const dispatcher = new UiEventDispatcher(PointerTool, 'Rectangular Select');
    const rectFor = (e: UiDragEvent) => {
      const rect = new Rect(e.start, e.position);
      this.selectionRect.set(rect);
      return rect;
    };
    dispatcher.addDragListener<0>({
      onStart: e => {
        App.pane.style.cursor = 'default';
        rectFor(e);
        return 0;
      },
      onUpdate: (e, _) => {
        App.pane.style.cursor = 'default';
        const rect = rectFor(e);
        const strict = this.useStrictSelectFor(e);
        this.strictSelect.set(strict);
        const selectables = App.ecs.getComponents(Handle).filter(h => h.selectable);
        for (const s of selectables) {
          s.hovered = strict ? s.containedBy(rect) : s.intersects(rect);
          if (s.hovered) {
            this.hovered.add(s);
          }
        }
      },
      onEnd: (e, _) => {
        App.pane.style.cursor = 'default';
        const rect = rectFor(e);
        const strict = this.useStrictSelectFor(e);
        const selected = App.ecs.getComponents(Handle).filter(h => h.selectable)
          .filter(h => strict ? h.containedBy(rect) : h.intersects(rect));
        this.clearHovered();
        App.ui.addSelection(...selected);
        this.selectionRect.set(null);
      },
    });
    return dispatcher;
  }

  private useStrictSelectFor(e: UiDragEvent): boolean {
    const delta = Vectors.between(e.start, e.position).get('screen');
    return delta.x < 0 && delta.y < 0;
  }
}

App.tools.register(PointerTool);

