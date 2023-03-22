// Settings which aren't specific to the current project,
// and are something more like application settings.
class Settings {
  public readonly fontSizeRef: Ref<number> = Refs.of(12);
  public readonly kinematics = Refs.of(true);

  public get fontSize(): number {
    return this.fontSizeRef.get();
  }
}

