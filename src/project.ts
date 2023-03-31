class Project {
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
    App.gui.project.reset();
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

  public newProject() {
    App.ecs.deleteEverything();
    App.viewport.recenter();
  }
}

