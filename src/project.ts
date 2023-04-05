class Project {
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

  public readonly gridSpacingRef = Refs.of<Amount>({ unit: 'feet', value: 1 }, (a, b) => (
    a.unit === b.unit && a.value === b.value
  ));

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
    App.ecs.deleteEverything();
    App.viewport.recenter();
    window.localStorage.removeItem(Project.PROJECT_KEY);
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
      version: Project.STORAGE_VERSION,
      ecs: App.ecs.toJson(),
      gridSpacing: Units.distance.format(this.gridSpacing),
      modelUnit: this.modelUnit.name,
      displayUnit: this.displayUnit.name,
    };
  }

  public loadJson(json: JsonObject) {
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
    });
    this.loadedAt = Time.now;
  }

  public setup() {
    this.modelUnitRef.onChange(_ => this.requestSave('model unit'));
    this.displayUnitRef.onChange(_ => this.requestSave('display unit'));
    this.gridSpacingRef.onChange(_ => this.requestSave('grid spacing'));
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
  version: string;
  ecs: SavedEcs;
  gridSpacing: string;
  modelUnit: string;
  displayUnit: string;
}

