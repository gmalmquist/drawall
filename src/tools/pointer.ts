class PointerTool extends SnappingTool {
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

  override get icon(): URL {
    return Icons.pointerTool;
  }

  override setup() {
    this.strictSelect.onChange(strict => {
      if (strict) App.ui.clearHovered();
    });

    this.events.onKey('keydown', e => {
      if (e.key === 'Escape') {
        App.ui.clearSelection();
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
        }
      } else if (App.ui.selection.size > 1 || App.ui.multiSelecting || handle.selected) {
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

      const handle = App.ui.getHandleAt(e.position, h => h.selectable && h.hoverable);

      if (handle?.clickable || handle?.draggable) {
        App.pane.style.cursor = handle.getContextualCursor() || this.cursor;
        handle.hovered = true;
        return;
      }

      App.pane.style.cursor = this.cursor;
      App.ui.clearHovered();
    });

    const drawSelect = this.getDrawSelectDispatcher();

    type NamedAxisP = (() => NamedAxis) | undefined;

    this.events.addDragListener<UiEventDispatcher>({
      onStart: e => {
        const overHandle = App.ui.getHandleAt(e.start, h => h.draggable) !== null;
        const selection = App.ui.selection;
        if (selection.size > 0 && overHandle) {
          const snaps = Array.from(selection)
            .filter(s => typeof s.snapping !== 'undefined')
            .map(s => s.snapping as Snapping);
          const getPreferred = (arr:  NamedAxisP[]): NamedAxisP => {
            if (true) return arr.length === 1 ? arr[0] : undefined;
            // this isn't working
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
          const cursors = new Set<Cursor>();
          const dispatcher = new UiEventDispatcher(PointerTool);
          for (const handle of selection) {
            dispatcher.forward(handle.events);
            cursors.add(handle.getContextualCursor());
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
    App.foreground.rect(rect, {
      fill: BLUE,
      stroke: BLUE,
      fillOpacity: 0.3,
      strokeOpacity: 0.6,
    });
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
        }
      },
      onEnd: (e, _) => {
        App.pane.style.cursor = 'default';
        const rect = rectFor(e);
        const strict = this.useStrictSelectFor(e);
        const selected = App.ecs.getComponents(Handle).filter(h => h.selectable)
          .filter(h => strict ? h.containedBy(rect) : h.intersects(rect));
        App.ui.clearHovered(); 
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

