class GUI {
  private readonly topbar: MiniForm;
  public readonly file: MiniForm;
  public readonly selection: MiniForm;
  public readonly tool: MiniForm;
  public readonly ux: MiniForm;
  public readonly project: MiniForm;

  constructor() {
    this.topbar = new MiniForm(
      Array.from(document.getElementsByClassName('topbar'))
      .map(t => t as HTMLElement)[0]);
    this.topbar.verticalAlign = 'stretch';
 
    this.file = new MiniForm();
    this.selection = new MiniForm();
    this.tool = new MiniForm();
    this.ux = new MiniForm();
    this.project = new MiniForm();

    this.topbar.append(this.file);
    this.topbar.appendRuler();
    this.topbar.append(this.selection);
    this.topbar.appendSpacer();
    this.topbar.append(this.tool);
    this.topbar.appendRuler();
    this.topbar.append(this.ux);
    this.topbar.appendRuler();
    this.topbar.append(this.project);
  }

  setup() {
    this.setupFile();
    this.setupUx();
    this.setupProject();
    this.preloadIcons();
  }

  private setupFile() {
    const form = new AutoForm();

    form.addButton({
      name: 'New',
      icon: Icons.newPage,
      onClick: () => {
        if (true || App.ecs.entityCount > 0) {
          Popup.confirm({
            title: 'Create New Project',
            body: 'This will clear any unsaved work and open a new project.',
            action: () => App.project.newProject(),
          });
        }
      },
    });

    form.addButton({
      name: 'Download Image',
      icon: Icons.exportImage,
      onClick: () => App.imageExporter.downloadCanvasComposite(),
    });

    form.addButton({
      name: 'Undo (ctrl+z)',
      icon: Icons.editUndo,
      onClick: () => App.actions.fire('undo'),
      enabled: App.history.canUndo,
    });

    form.addButton({
      name: 'Redo (ctrl+shift+z)',
      icon: Icons.editRedo,
      onClick: () => App.actions.fire('redo'),
      enabled: App.history.canRedo,
    });

    form.inflate(this.file);
  }

  private setupUx() {
    const form = new AutoForm();

    const snappingSupported = App.tools.currentRef.map<boolean>({
      to: tool => tool.allowSnap,
      from: _ => App.tools.current,
    });

    const snappingHidden = Refs.reduce(
      {
        to: ([supported, enabled]) => supported && enabled,
        from: _ => [snappingSupported.get(), App.ui.snapping.enableByDefaultRef.get()],
        compareValues: (a, b) => a === b,
      },
      snappingSupported,
      App.ui.snapping.enableByDefaultRef,
    ).map<boolean>({
      to: a => !a,
      from: a => !a,
    });

    form.add({
      name: 'Local Axes Snapping',
      kind: 'toggle',
      value: App.ui.snapping.snapToLocalRef,
      icons: { on: Icons.snapLocalOn, off: Icons.snapLocalOff },
      hidden: snappingHidden,
    });

    form.add({
      name: 'Global Axes Snapping',
      kind: 'toggle',
      value: App.ui.snapping.snapToGlobalRef,
      icons: { on: Icons.snapGlobalOn, off: Icons.snapGlobalOff },
      hidden: snappingHidden,
    });

    form.add({
      name: 'Geometry Axes Snapping',
      kind: 'toggle',
      value: App.ui.snapping.snapToGeometryRef,
      icons: { on: Icons.snapGeomOn, off: Icons.snapGeomOff },
      hidden: snappingHidden,
    });

    form.add({
      name: 'Snap to Grid',
      kind: 'toggle',
      value: App.settings.snapGrid,
      icons: { on: Icons.snapGridOn, off: Icons.snapGridOff },
      hidden: snappingHidden,
    });

    form.add({
      name: 'Snapping (Shift + %)',
      kind: 'toggle',
      value: App.ui.snapping.enableByDefaultRef,
      icons: { on: Icons.snapOn, off: Icons.snapOff },
      enabled: snappingSupported,
    });

    form.addSeparator();

    form.add({
      name: 'Show Grid',
      kind: 'toggle',
      value: App.settings.showGrid,
      icons: { on: Icons.showGrid, off: Icons.hideGrid },
    });

    form.add({
      name: 'Guides',
      kind: 'toggle',
      value: App.settings.showGuides,
      icons: { on: Icons.showGuides, off: Icons.hideGuides },
    });

    form.add({
      name: 'Lengths',
      kind: 'toggle',
      value: App.settings.showLengths,
      icons: { on: Icons.showLengths, off: Icons.hideLengths },
    });

    form.add({
      name: 'Angles',
      kind: 'toggle',
      value: App.settings.showAngles,
      icons: { on: Icons.showAngles, off: Icons.hideAngles },
    });

    form.addSeparator();

    form.addButton({
      name: 'Recenter View (0)',
      onClick: () => App.viewport.recenter(),
      icon: Icons.recenter,
    });

    form.addSeparator();
    form.add({
      name: 'Kinematics',
      kind: 'toggle',
      tooltip: 'Kinematic Constraints (k)',
      value: App.settings.kinematics,
      icons: { on: Icons.kinematicsOn, off: Icons.kinematicsOff },
    });

    this.ux.clear();
    form.inflate(this.ux);
  }

  private setupProject() {
    const form = new AutoForm();

    const fontSize = form.add({
      name: 'font size',
      label: 'font size',
      kind: 'number',
      min: 4,
      max: 100,
      value: App.settings.fontSizeRef,
    });

    const gridSpacing = form.add({
      name: 'grid spacing',
      label: 'grid spacing',
      kind: 'amount',
      min: Units.distance.parse('1cm')!,
      value: App.project.gridSpacingRef,
      unit: Units.distance,
    });

    gridSpacing.value.onChange(spacing => {
      if (spacing.value <= 0) {
        gridSpacing.value.set(App.project.gridSpacing);
        return;
      }
      const unit = Units.distance.get(spacing.unit)!;
      App.project.gridSpacing = spacing;
      App.project.displayUnit = unit.name === 'inch' ? Units.distance.get('ft')! : unit;

      if (unit.family !== App.project.modelUnit.family) {
        if (unit.family === 'metric') {
          App.project.modelUnit = Units.distance.get('cm')!;
        } else if (unit.family === 'imperial') {
          App.project.modelUnit = Units.distance.get('in')!;
        } else if (unit.family === 'esoteric') {
          App.project.modelUnit = Units.distance.get('light-nanosecond')!;
        }
        App.viewport.recenter();
      }
    });

    this.project.clear();
    form.inflate(this.project);
  }

  private preloadIcons() {
    for (const iconUrl of Object.values(Icons)) {
      const image = new Image();
      image.src = iconUrl.toString();
    }
  }
}

