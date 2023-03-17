class Project {
  // defines what 1 unit of world space is
  public worldUnit: Unit = Units.distance.get('in')!;

  // defines what unit is used to render UI labels.
  public displayUnit: Unit = Units.distance.get('ft')!;

  public gridSpacing: Amount = { unit: 'feet', value: 1 };
}

