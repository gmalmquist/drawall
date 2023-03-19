class Project {
  // defines what 1 unit of model space is
  private _modelUnit: Unit = Units.distance.get('in')!;

  // defines what unit is used to render UI labels.
  public displayUnit: Unit = Units.distance.get('ft')!;

  public gridSpacing: Amount = { unit: 'feet', value: 1 };

  public get modelUnit(): Unit {
    return this._modelUnit;
  }

  public set modelUnit(unit: Unit) {
    const scaleFactor = unit.from(this._modelUnit.newAmount(1)).value;
    if (scaleFactor === 1.0) {
      this._modelUnit = unit;
      return; // wow that was easy
    }

    App.canvas.viewport.radius *= scaleFactor;
    App.canvas.updateTransforms();
    
    // have to go in and update all the units....
    const nodes = App.ecs.getComponents(PhysNode);
    if (nodes.length === 0) {
      // we got off easy
      this._modelUnit = unit;
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

    this._modelUnit = unit;
  }
}

