// Settings which aren't specific to the current project,
// and are something more like application settings.
class Settings {
  public readonly fontSizeRef: Ref<number> = Refs.of(16);
  public readonly kinematics = Refs.of(true);
  public readonly showAngles = Refs.of(true);
  public readonly showDoorArcs = Refs.of(true);
  public readonly showDoors = Refs.of(true);
  public readonly showFurniture = Refs.of(true);
  public readonly showGrid = Refs.of(true);
  public readonly showGuides = Refs.of(true);
  public readonly showJoints = Refs.of(false);
  public readonly showLengths = Refs.of(true);
  public readonly showReferenceImages = Refs.of(true);
  public readonly showRoomLabels = Refs.of(true);
  public readonly showVisibilityOptions = Refs.of(true);

  // TODO: why is this field here??? should be w the other
  // snap fields in ux.ts
  public readonly snapGrid = Refs.of(true);

  public get fontSize(): number {
    return this.fontSizeRef.get();
  }

  public setup() {
    Refs.reduceRo(
      ([a, b]) => a || b,
      this.showFurniture,
      Refs.mapRo(App.tools.currentRef, r => r.name === 'furniture tool'),
    ).onChange(show=> {
      App.furnitureImages.style.opacity = show ? '1' : '0';
    });

    Refs.reduceRo(
      ([a, b]) => a || b,
      this.showReferenceImages,
      Refs.mapRo(App.tools.currentRef, r => r.name === 'images tool'),
    ).onChange(show=> {
      App.referenceImages.style.opacity = show ? '1' : '0';
    });
  }
}

