// Settings which aren't specific to the current project,
// and are something more like application settings.
class Settings {
  private static readonly STORE_KEY = "settings";

  public readonly fontSizeRef: Ref<number> = Refs.of(16);
  public readonly kinematics = Refs.of(true);
  public readonly showAngles = Refs.of(true);
  public readonly showDoorArcs = Refs.of(true);
  public readonly showDoors = Refs.of(true);
  public readonly showFurniture = Refs.of(true);
  public readonly showFurnitureLabels = Refs.of(true);
  public readonly showGrid = Refs.of(true);
  public readonly showGuides = Refs.of(true);
  public readonly showJoints = Refs.of(false);
  public readonly showLengths = Refs.of(true);
  public readonly showReferenceImages = Refs.of(true);
  public readonly showRoomLabels = Refs.of(true);
  public readonly showVisibilityOptions = Refs.of(true);
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

    this.loadRefs();

    for (const ref of this.settingsByName().values()) {
      ref.onChange(_ => this.saveRefs());
    }
  }

  private saveRefs() {
    const map = this.settingsByName();
    const obj: { [key: string]: any } = {};
    for (const name of map.keys()) {
      obj[name] = map.get(name)?.get();
    }
    window.localStorage.setItem(Settings.STORE_KEY, JSON.stringify(obj));
  }

  private loadRefs() {
    const data = window.localStorage.getItem(Settings.STORE_KEY);
    if (!data) {
      return;
    }
    const obj = JSON.parse(data);
    const map = this.settingsByName();
    for (const key of map.keys()) {
      const value = obj[key];
      if (typeof value !== 'undefined') {
        map.get(key)?.set(value);
      }
    }
  }

  private settingsByName(): Map<string, Ref<any>> {
    type Me = { [key: string]: Ref<any> };
    const me = this as unknown as Me;
    const map = new Map<string, Ref<any>>();
    for (const key of Object.keys(me)) {
      const ref = me[key];
      if (typeof ref === 'object'
        && typeof ref.get === 'function'
        && typeof ref.set === 'function') {
        map.set(key, ref);
      }
    }
    return map;
  }
}

