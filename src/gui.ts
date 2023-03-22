class GUI {
  private readonly topbar: MiniForm;
  public readonly selection: MiniForm;
  public readonly tool: MiniForm;
  public readonly ux: MiniForm;
  public readonly project: MiniForm;

  constructor() {
    this.topbar = new MiniForm(
      Array.from(document.getElementsByClassName('topbar'))
      .map(t => t as HTMLElement)[0]);
    this.topbar.verticalAlign = 'stretch';
  
    this.selection = new MiniForm();
    this.tool = new MiniForm();
    this.ux = new MiniForm();
    this.project = new MiniForm();

    this.topbar.append(this.tool);
    this.topbar.appendRuler();
    this.topbar.append(this.selection);

    this.topbar.appendSpacer();

    this.topbar.appendRuler();
    this.topbar.append(this.ux);
    this.topbar.appendRuler();
    this.topbar.append(this.project);

    this.topbar.append(new MiniLabel('hi'));
  }

  setup() {
    this.setupUx();
    this.setupProject();
  }

  private setupUx() {
    const form = new AutoForm();

    form.add({
      name: 'Grid',
      kind: 'toggle',
      value: App.settings.showGrid,
    });

    form.add({
      name: 'Guides',
      kind: 'toggle',
      value: App.settings.showGuides,
    });

    form.add({
      name: 'Lengths',
      kind: 'toggle',
      value: App.settings.showLengths,
    });

    form.add({
      name: 'Angles',
      kind: 'toggle',
      value: App.settings.showAngles,
    });

    form.addSeparator();

    form.add({
      name: 'Kinematics',
      kind: 'toggle',
      value: App.settings.kinematics,
    });

    form.addSeparator();

    form.add({
      name: 'Local Axes Snapping',
      kind: 'toggle',
      value: App.ui.snapping.snapToLocalRef,
    });

    form.add({
      name: 'Global Axes Snapping',
      kind: 'toggle',
      value: App.ui.snapping.snapToGlobalRef,
    });

    form.add({
      name: 'Geometry Axes Snapping',
      kind: 'toggle',
      value: App.ui.snapping.snapToGeometryRef,
    });

    form.addSeparator();

    form.add({
      name: 'Snapping',
      kind: 'toggle',
      value: App.ui.snapping.enableByDefaultRef,
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
      value: Refs.of(
        App.project.gridSpacing,
        (a, b) => a.unit === b.unit && a.value === b.value,
      ),
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
      }
    });

    this.project.clear();
    form.inflate(this.project);
  }
}

