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
    const snapButtons = new MiniForm();
    snapButtons.verticalAlign = 'stretch';

    const snapLocal = new ToggleButton('Local Axes Snapping');
    snapLocal.setToggled(App.ui.snapping.snapToLocal);
    snapLocal.onToggle(snap => { App.ui.snapping.snapToLocal = snap; });

    const snapGlobal = new ToggleButton('Global Axes Snapping');
    snapGlobal.setToggled(App.ui.snapping.snapToGlobal);
    snapGlobal.onToggle(snap => { App.ui.snapping.snapToGlobal = snap; });

    const snapGeometry = new ToggleButton('Geometry Axes Snapping');
    snapGeometry.setToggled(App.ui.snapping.snapToGeometry);
    snapGeometry.onToggle(snap => { App.ui.snapping.snapToGeometry = snap; });

    snapButtons.append(snapLocal);
    snapButtons.append(snapGlobal);
    snapButtons.append(snapGeometry);

    this.ux.append(snapButtons);
  }

  private setupProject() {
    const gridSpacing = new AmountInput();
    gridSpacing.setValue(App.project.gridSpacing);
    gridSpacing.minValue = Units.distance.parse('1cm')!;
    gridSpacing.onChange(spacing => {
      if (spacing.value <= 0) {
        gridSpacing.setValue(App.project.gridSpacing);
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
    this.project.appendLabeled('grid spacing', gridSpacing);
  }
}

