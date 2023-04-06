class GUI {
  private readonly titlebar: MiniForm;
  private readonly title: MiniForm;
  public readonly meta: MiniForm;

  private readonly topbar: MiniForm;
  public readonly file: MiniForm;
  public readonly selection: MiniForm;
  public readonly tool: MiniForm;
  public readonly ux: MiniForm;
  public readonly project: MiniForm;

  constructor() {
    this.topbar = new MiniForm(
      Array.from(document.getElementsByClassName('topbar'))
      .map(t => t as HTMLElement)[0]);
    this.topbar.verticalAlign = 'stretch';

    this.titlebar = new MiniForm(
      Array.from(document.getElementsByClassName('titlebar'))
      .map(t => t as HTMLElement)[0]);
    this.titlebar.verticalAlign = 'stretch';
 
    this.file = new MiniForm();
    this.selection = new MiniForm();
    this.tool = new MiniForm();
    this.ux = new MiniForm();
    this.project = new MiniForm();
    this.meta = new MiniForm();
    this.title = new MiniForm();

    this.titlebar.append(this.title);
    this.titlebar.appendSpacer();
    this.titlebar.append(this.project);
    this.topbar.appendRuler();
    this.titlebar.append(this.meta);

    this.topbar.append(this.file);
    this.topbar.appendRuler();
    this.topbar.append(this.tool);
    this.topbar.append(this.selection);
    this.topbar.appendSpacer();
    this.topbar.append(this.ux);
  }

  setup() {
    this.setupTitle();
    this.setupFile();
    this.setupUx();
    this.setupProject();
    this.setupMeta();
    this.preloadIcons();
  }

  private setupTitle() {
    const form = new AutoForm();
    form.add({
      kind: 'text',
      name: 'projectname',
      value: App.project.projectNameRef,
    });
    form.inflate(this.title);
  }

  private setupMeta() {
    const form = new AutoForm();

    form.addButton({
      name: 'About',
      icon: Icons.heartInfo,
      onClick: () => {
        const popup = App.ecs.createEntity().add(PopupWindow);
        popup.setPosition(Position(new Point(
          App.viewport.screen_width/2,
          App.viewport.screen_height/2,
        ), 'screen'));
        popup.title = 'About';

        const rainbow = (text: string): string => {
          const result: string[] = [];
          for (let i = 0; i < text.length; i++) {
            const c = text.charAt(i);
            if (c === ' ') {
              result.push('<span style="display: inline-block; width: 0.5em;"></span>');
              continue;
            }
            const hue = Math.round(360 * i / text.length);
            const color = `hsl(${hue}, 100%, 50%)`;
            result.push(`<span style="
              display: inline-block;
              color: ${color};
            ">${c}</span>`);
          }
          return result.join('');
        };

        const content = document.createElement('div');
        content.style.width = '50vw';
        content.style.maxWidth = '50em';
        content.style.maxHeight = 'calc(70vh - 100px)';
        content.style.overflowY = 'scroll';
        content.style.marginBottom = '1ex';
        const inner = document.createElement('div');
        content.appendChild(inner);
        inner.innerHTML = `
          Hi~! This floor plan CAD thingy was made by <a target="blank_" href="https://cohost.org/gwenverbsnouns/">Gwen</a>.
          <p>It's designed to make quick and easy mockups from imprecise measurements—because we've all had the experience of taking a thousand measurements, then trying to draw it up and finding that the inches don't <em>quite</em> add up! Or trying to plan a move based off of vague dimensions provided by a landlord.
          <h4>why did u do this</h4>
          <p>I made it 'cause <span style="text-decoration: line-through; font-size: 0.9em;">it was my project during a manic episode</span> I've moved into a lot of apartments, and I always end up spending wayyyy too much time figuring out how to arrange furniture in applications that are either totally overkill (Sketchup, Blender, OpenSCAD, FreeCAD), or lacking features I wanted. And none of them did a great job of supporting measurements that were a little bit fuzzy!
          <h4>is this rly free???</h4>
          <p>yeah.
          <h4>ok but i feel like it <em>shouldn't</em> be free???</h4>
          <p>If you like this tool and wanna support me and my polycule, feel free to click on <a target="blank_" href="https://ko-fi.com/gwenverbsnouns">this ko-fi link</a>. I'll prolly spend it on getting bubble tea with my gf. My financial situation isn't dire, but I <em>am</em> burned out af and not working rn, which is p stressful at times.
          <h4>privacy?</h4>
          <p>This is a static website; all data is stored locally in your browser. There's not even a backend (backends are expensive), let alone a shadowy database of personal info.
          <h4>i think it's broken</h4>
          <p>Oh no! Please file an issue (or a pull request) over <a target="blank_" href="https://github.com/gmalmquist/drawall">here</a>.
          <h4>what's it made out of?</h4>
          <p>I mean, you can look at the github repo linked above? But I made the icons in <a target="blank_" href="https://inkscape.org">Inkscape</a>, which I adore. I made typescript newtypes for IDs and math stuffs using <a target="blank_" href="https://github.com/kanwren/minewt">this teeny library</a> my girlfriend (whom I also adore) wrote. The rest is mostly just vanilla typescript and html/css bc I thought that would be fun.
          <h4>why is the ui kinda gay</h4>
          <p>${rainbow('idk what ur talking about')}
        `;

        popup.appendHTML(content);
        popup.getUiBuilder()
          .newRow()
          .addButton("im done reading now <3", (_) => {
            popup.entity.destroy();
          });
        popup.show();
        popup.element.style.top = '100px';
      },
    });

    form.inflate(this.meta);
  }

  private setupFile() {
    const form = new AutoForm();

    form.addButton({
      name: 'New',
      icon: Icons.newFile,
      onClick: () => App.actions.fire('new'),
    });

    form.addButton({
      name: 'Open',
      icon: Icons.openFile,
      onClick: () => App.actions.fire('open'),
    });

    form.addButton({
      name: 'Save',
      icon: Icons.saveFile,
      onClick: () => App.actions.fire('save'),
    });

    form.addButton({
      name: 'Download Image (Shift+D)',
      icon: Icons.exportImage,
      onClick: () => App.actions.fire('export-png'),
    });

    form.addButton({
      name: 'Undo (Control+z)',
      icon: Icons.editUndo,
      onClick: () => App.actions.fire('undo'),
      enabled: App.history.canUndo,
    });

    form.addButton({
      name: 'Redo (Control+Shift+Z)',
      icon: Icons.editRedo,
      onClick: () => App.actions.fire('redo'),
      enabled: App.history.canRedo,
    });

    form.inflate(this.file);
  }

  private setupUx() {
    const form = new AutoForm();

    const snappingSupported = App.tools.currentRef.map<boolean>({
      to: tool => tool.allowSnap,
      from: _ => App.tools.current,
    });

    const snappingHidden = Refs.negate(Refs.reduce(
      {
        to: ([supported, enabled]) => supported && enabled,
        from: _ => [snappingSupported.get(), App.ui.snapping.enableByDefaultRef.get()],
        compareValues: areEq,
      },
      snappingSupported,
      App.ui.snapping.enableByDefaultRef,
    ));

// not implemented
//    form.add({
//      name: 'Local Axes Snapping',
//      kind: 'toggle',
//      value: App.ui.snapping.snapToLocalRef,
//      icons: { on: Icons.snapLocalOn, off: Icons.snapLocalOff },
//      hidden: snappingHidden,
//    });

    form.add({
      name: 'Global Axes Snapping',
      kind: 'toggle',
      value: App.ui.snapping.snapToGlobalRef,
      icons: { on: Icons.snapGlobalOn, off: Icons.snapGlobalOff },
      hidden: snappingHidden,
    });

// not implemented
//    form.add({
//      name: 'Geometry Axes Snapping',
//      kind: 'toggle',
//      value: App.ui.snapping.snapToGeometryRef,
//      icons: { on: Icons.snapGeomOn, off: Icons.snapGeomOff },
//      hidden: snappingHidden,
//    });

    form.add({
      name: 'Snap to Grid',
      kind: 'toggle',
      value: App.settings.snapGrid,
      icons: { on: Icons.snapGridOn, off: Icons.snapGridOff },
      hidden: snappingHidden,
    });

    form.add({
      name: 'Snapping (Shift + %)',
      kind: 'toggle',
      value: App.ui.snapping.enableByDefaultRef,
      icons: { on: Icons.snapOn, off: Icons.snapOff },
      enabled: snappingSupported,
    });

    form.addSeparator();

    form.addButton({
      name: 'Zoom In',
      onClick: () => App.actions.fire('zoom-in'),
      icon: Icons.zoomIn,
    });

    form.addButton({
      name: 'Zoom Out',
      onClick: () => App.actions.fire('zoom-out'),
      icon: Icons.zoomOut,
    });

    form.addButton({
      name: 'Recenter View (0)',
      onClick: () => App.viewport.recenter(),
      icon: Icons.recenter,
    });

    this.ux.clear();
    form.inflate(this.ux);
  }

  private addVisibilityOptions(form: AutoForm) {
    const hideVisibilityOptions = Refs.negate(App.settings.showVisibilityOptions);

    form.add({
      name: 'Show/Hide Grid',
      kind: 'toggle',
      value: App.settings.showGrid,
      icons: { on: Icons.showGrid, off: Icons.hideGrid },
      hidden: hideVisibilityOptions,
    });

    form.add({
      name: 'Show/Hide Guides',
      kind: 'toggle',
      value: App.settings.showGuides,
      icons: { on: Icons.showGuides, off: Icons.hideGuides },
      hidden: hideVisibilityOptions,
    });

    form.add({
      name: 'Show/Hide Lengths',
      kind: 'toggle',
      value: App.settings.showLengths,
      icons: { on: Icons.showLengths, off: Icons.hideLengths },
      hidden: hideVisibilityOptions,
    });

    form.add({
      name: 'Show/Hide Angles',
      kind: 'toggle',
      value: App.settings.showAngles,
      icons: { on: Icons.showAngles, off: Icons.hideAngles },
      hidden: hideVisibilityOptions,
    });

    form.add({
      name: 'Show/Hide Joints',
      kind: 'toggle',
      value: App.settings.showJoints,
      icons: { on: Icons.showJoints, off: Icons.hideJoints },
      hidden: hideVisibilityOptions,
    });

    form.add({
      name: 'Visibility Options',
      kind: 'toggle',
      value: App.settings.showVisibilityOptions,
      icons: { on: Icons.visible, off: Icons.invisible },
    });
  }

  private setupProject() {
    const form = new AutoForm();

    this.addVisibilityOptions(form);

    form.addSeparator();

    form.add({
      name: 'Kinematics',
      kind: 'toggle',
      tooltip: 'Kinematic Constraints (k)',
      value: App.settings.kinematics,
      icons: { on: Icons.kinematicsOn, off: Icons.kinematicsOff },
    });

    form.addSeparator();

    const fontSize = form.add({
      name: 'font size',
      label: 'font size',
      kind: 'number',
      min: 4,
      max: 100,
      value: App.settings.fontSizeRef,
    });

    const gridSpacing = form.add({
      name: 'grid spacing',
      label: 'grid spacing',
      kind: 'amount',
      min: Units.distance.parse('1cm')!,
      value: App.project.gridSpacingRef,
      unit: Units.distance,
    });

    gridSpacing.value.onChange(spacing => {
      if (spacing.value <= 0) {
        gridSpacing.value.set(App.project.gridSpacing);
        return;
      }
      const unit = Units.distance.get(spacing.unit)!;
      App.project.gridSpacing = spacing;
      App.project.displayUnit = unit.name === 'inch' ? Units.distance.get('ft')! : unit;
    });

    this.project.clear();
    form.inflate(this.project);
  }

  private preloadIcons() {
    for (const iconUrl of Object.values(Icons)) {
      const image = new Image();
      image.src = iconUrl.toString();
    }
  }
}

