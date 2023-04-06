class Project {
  private static readonly DEFAULT_GRID_SPACING: Amount = { value: 2, unit: 'feet' };
  private static readonly DEFAULT_NAME = 'untitled floorplan';
  private static readonly STORAGE_VERSION = '0.0.1';
  private static readonly PROJECT_KEY = 'project-data';
  private static readonly SAVE_FREQUENCY_SECONDS = 0.5;
  private static readonly LOAD_DELAY = 0.5;
  private loadedAt: number = 0;
  private saveRequestedAt: number | null = 0;

  private historyIndex: number = 0;

  // defines what 1 unit of model space is
  public readonly modelUnitRef = Refs.of<Unit>(Units.distance.get('in')!, (a, b) => (
    a.name === b.name
  ));

  // defines what unit is used to render UI labels.
  public readonly displayUnitRef = Refs.of<Unit>(Units.distance.get('ft')!, (a, b) => (
    a.name === b.name
  ));

  public readonly gridSpacingRef = Refs.of<Amount>(Project.DEFAULT_GRID_SPACING, (a, b) => (
    a.unit === b.unit && a.value === b.value
  ));

  public readonly projectNameRef = Refs.of<string>(Project.DEFAULT_NAME);

  public get projectName(): string {
    const name = this.projectNameRef.get().trim()
      .replace(/[#%&{}\\<>*?/$!'":@+`|=]+/g, '');
    return name.toString();
  }

  public set projectName(name: string) {
    this.projectNameRef.set(name);
  }

  public get displayUnit() {
    return this.displayUnitRef.get();
  }

  public set displayUnit(unit: Unit) {
    this.displayUnitRef.set(unit);
  }

  public get gridSpacing() {
    return this.gridSpacingRef.get();
  }

  public set gridSpacing(amount: Amount) {
    this.gridSpacingRef.set(amount);
  }

  public get displayDecimals(): number {
    return Math.round(Math.log10(
      1.0 / App.project.displayUnit.from(App.project.gridSpacing).value
    )) + 1;
  }

  public get modelUnit(): Unit {
    return this.modelUnitRef.get();
  }

  public set modelUnit(unit: Unit) {
    const scaleFactor = unit.from(this.modelUnitRef.get().newAmount(1)).value;
    if (scaleFactor === 1.0) {
      this.modelUnitRef.set(unit);
      return; // wow that was easy
    }
    
    // have to go in and update all the units....
    const nodes = App.ecs.getComponents(PhysNode);
    if (nodes.length === 0) {
      // we got off easy
      this.modelUnitRef.set(unit);
      return;
    }

    // update positions of all physics elements
    const centroid = nodes.map(n => n.pos)
      .map(n => n.get('model').toVec().scale(1.0 / nodes.length))
      .reduce((a, b) => a.plus(b), Point.ZERO);

    for (const node of App.ecs.getComponents(PhysNode)) {
      const p = node.pos.get('model');
      const delta = Vec.between(centroid, p);
      node.pos = Position(centroid.splus(scaleFactor, delta), 'model');
    }

    // update any fixed point constraints
    for (const constraint of App.ecs.getComponents(FixedConstraint)) {
      constraint.updateTargets(constraint.getTargets().map(pos => {
        const v = Vec.between(centroid, pos.get('model'));
        return Position(centroid.splus(scaleFactor, v), 'model');
      }));
    }

    // update any length constraints
    for (const constraint of App.ecs.getComponents(LengthConstraint)) {
      constraint.length *= scaleFactor;
    }

    // rectangles
    for (const rect of App.ecs.getComponents(Rectangular)) {
      rect.width = rect.width.scale(scaleFactor);
      rect.height = rect.height.scale(scaleFactor);
      rect.center = Position(centroid, 'model').splus(
        scaleFactor,
        Vectors.between(Position(centroid, 'model'), rect.center)
      );
    }

    this.modelUnitRef.set(unit);

    App.viewport.recenter();
  }

  public modelToAmount(value: number): Amount {
    return new Amount(value, this.modelUnit.name);
  }

  public amountToModel(amount: Amount): number {
    return this.modelUnit.from(amount).value;
  }

  public formatDistance(distance: Distance): string {
    const amount = this.displayUnit.from(
      this.modelUnit.newAmount(distance.get('model'))
    );
    return this.displayUnit.format(this.displayUnit.newAmount(
      roundBy(amount.value, this.displayDecimals)
    ));
  }

  public newProject() {
    const action = () => {
      App.ecs.deleteEverything();
      this.gridSpacing = Project.DEFAULT_GRID_SPACING;
      App.viewport.recenter();
      this.projectName = Project.DEFAULT_NAME;
      window.localStorage.removeItem(Project.PROJECT_KEY);
    };
    if (App.ecs.getComponents(Wall).length > 0) {
      Popup.confirm({
        title: 'Create New Project',
        body: 'This will clear any unsaved work and open a new project.',
        action,
      });
    } else {
      action();
    }
  }

  public saveProject() {
    const data = JSON.stringify(this.serialize());
    const dataUrl = `data:application/json;base64,${btoa(data)}`;
    const basename = this.projectName;
    const filename = basename.toLocaleLowerCase().endsWith('.json') ? basename : `${basename}.json`;
    App.io.download(filename, dataUrl);
  }

  public openProject() {
    const load = (json: JsonObject) => {
      App.pane.style.opacity = '0';
      this.loadJson(json);
      setTimeout(() => {
        App.pane.style.opacity = '1';
        App.actions.fire('recenter');
        this.saveLocal();
      }, 100);
    };
    App.io.open(
      ['.json'],
      url => fetch(url).then(response => response.json()).then(load)
    );
  }

  public saveLocal() {
    const data = JSON.stringify(this.serialize());
    App.log(`saved ${data.length} bytes to local storage`);
    window.localStorage.setItem(Project.PROJECT_KEY, data);
  }

  public loadLocal() {
    const data = window.localStorage.getItem(Project.PROJECT_KEY);
    if (!data) return;
    const json = JSON.parse(data) as JsonObject;
    this.loadJson(json);
    App.viewport.recenter();
  }

  public requestSave(reason: string) {
    if (App.history.isSuspended) return;
    if (this.loadedAt + Project.LOAD_DELAY > Time.now) return;
    App.log(`requestSave(${reason})`);
    this.saveRequestedAt = Time.now;
  }

  public serialize(): ProjectJson {
    return {
      application: 'drawall',
      projectName: this.projectName,
      version: Project.STORAGE_VERSION,
      ecs: App.ecs.toJson(),
      gridSpacing: Units.distance.format(this.gridSpacing),
      modelUnit: this.modelUnit.name,
      displayUnit: this.displayUnit.name,
    };
  }

  public loadJson(json: JsonObject) {
    if (!json || json.application !== 'drawall') {
      // TODO: show a dialog to the user?
      console.error('invalid project file', json);
      return;
    }
    this.loadedAt = Time.now;
    App.history.suspendWhile(() => {
      const p = json as unknown as ProjectJson;

      App.ecs.deleteEverything();

      if (p.gridSpacing) {
        const spacing = Units.distance.parse(
          p.gridSpacing! as string
        );
        if (spacing !== null) {
          this.gridSpacing = spacing;
        }
      }
      if (p.modelUnit) {
        this.modelUnitRef.set(Units.distance.get(p.modelUnit! as string)!);
      }
      if (p.displayUnit) {
        this.displayUnitRef.set(Units.distance.get(p.displayUnit! as string)!);
      }

      App.ecs.loadJson(p.ecs);

      this.projectName = p.projectName || Project.DEFAULT_NAME;
    });
    this.loadedAt = Time.now;
  }

  public setup() {
    this.modelUnitRef.onChange(_ => this.requestSave('model unit'));
    this.displayUnitRef.onChange(_ => this.requestSave('display unit'));
    this.gridSpacingRef.onChange(_ => this.requestSave('grid spacing'));
    this.projectNameRef.onChange(_ => this.requestSave('project name'));
  }

  public update() {
    const saveReq = this.saveRequestedAt;
    if (saveReq !== null
      && Time.now - saveReq >= Project.SAVE_FREQUENCY_SECONDS) {
      this.saveLocal();
      App.history.push();
      this.saveRequestedAt = null;
    }
  }
}

interface ProjectJson {
  application: string;
  projectName: string;
  version: string;
  ecs: SavedEcs;
  gridSpacing: string;
  modelUnit: string;
  displayUnit: string;
}

