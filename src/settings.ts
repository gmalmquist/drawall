// Settings which aren't specific to the current project,
// and are something more like application settings.
class Settings {
  public readonly fontSizeRef: Ref<number> = Refs.of(16);
  public readonly kinematics = Refs.of(true);
  public readonly showGuides = Refs.of(true);
  public readonly showAngles = Refs.of(true);
  public readonly showLengths = Refs.of(true);
  public readonly showGrid = Refs.of(true);
  public readonly snapGrid = Refs.of(true);

  public get fontSize(): number {
    return this.fontSizeRef.get();
  }
}

