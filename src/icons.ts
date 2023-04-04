const iconUrl = (name: string): URL => {
  const path = window.location.pathname.startsWith('/')
    ? window.location.pathname.substring(1)
    : window.location.pathname;
  const subpath = path.length > 0 ? `${path}/icons/${name}` : `icons/${name}`;
  return new URL(`${window.location.protocol}//${window.location.host}/${subpath}`);
};

const Icons = {
  //snapGuidesOff: iconUrl('snap-guides-off.svg'),
  //snapGuidesOn: iconUrl('snap-guides-on.svg'),
  angleLocked: iconUrl('angle-locked.svg'),
  angleUnlocked: iconUrl('angle-unlocked.svg'),
  aspectLocked: iconUrl('aspect-locked.svg'),
  aspectUnlocked: iconUrl('aspect-unlocked.svg'),
  axisLocked: iconUrl('axis-locked.svg'),
  axisUnlocked: iconUrl('axis-unlocked.svg'),
  axisX: iconUrl('axis-x.svg'),
  axisY: iconUrl('axis-y.svg'),
  editRedo: iconUrl('redo.svg'),
  editUndo: iconUrl('undo.svg'),
  exportImage: iconUrl('export-png.svg'),
  heartInfo: iconUrl('heart-info.svg'),
  hideAngles: iconUrl('hide-angles.svg'),
  hideGrid: iconUrl('hide-grid.svg'),
  hideGuides: iconUrl('hide-guides.svg'),
  hideJoints: iconUrl('hide-joints.svg'),
  hideLengths: iconUrl('hide-lengths.svg'),
  invisible: iconUrl('eye-closed.svg'),
  image: iconUrl('image.svg'),
  imageUpload: iconUrl('image-upload.svg'),
  jointTool: iconUrl('joint-tool.svg'),
  kinematicsOff: iconUrl('kinematics-off.svg'),
  kinematicsOn: iconUrl('kinematics-on.svg'),
  lengthLocked: iconUrl('length-locked.svg'),
  lengthUnlocked: iconUrl('length-unlocked.svg'),
  lockSmall: iconUrl('lock-small.png'),
  newPage: iconUrl('new-page.svg'),
  panTool: iconUrl('grab.svg'),
  pen: iconUrl('pen.svg'),
  pointerTool: iconUrl('cursor.svg'),
  posLocked: iconUrl('pos-locked.svg'),
  posUnlocked: iconUrl('pos-unlocked.svg'),
  recenter: iconUrl('recenter.svg'),
  roomTool: iconUrl('draw-room.svg'),
  rotate: iconUrl('rotate.svg'),
  rulerCursor: iconUrl('ruler-cursor.svg'),
  rulerTool: iconUrl('ruler.svg'),
  showAngles: iconUrl('show-angles.svg'),
  showGrid: iconUrl('show-grid.svg'),
  showJoints: iconUrl('show-joints.svg'),
  showGuides: iconUrl('show-guides.svg'),
  showLengths: iconUrl('show-lengths.svg'),
  snapGeomOff: iconUrl('snap-geom-off.svg'),
  snapGeomOn: iconUrl('snap-geom-on.svg'),
  snapGlobalOff: iconUrl('snap-global-off.svg'),
  snapGlobalOn: iconUrl('snap-global-on.svg'),
  snapGridOff: iconUrl('grid-snap-off.svg'),
  snapGridOn: iconUrl('grid-snap-on.svg'),
  snapLocalOff: iconUrl('snap-local-off.svg'),
  snapLocalOn: iconUrl('snap-local-on.svg'),
  snapOff: iconUrl('snap-off.svg'),
  snapOn: iconUrl('snap-on.svg'),
  visible: iconUrl('eye-open.svg'),
};

type KeysOfToType<M extends { [key: string]: unknown }, T> = {
  [Property in keyof M]: T;
};


type IconImages = KeysOfToType<typeof Icons, HTMLImageElement>;

const IconImages: IconImages = ((): IconImages => {
  const result: { [key: string]: HTMLImageElement } = {};
  for (const key of Object.keys(Icons)) {
    const image = new Image();
    image.src = (Icons[key as keyof (typeof Icons)] as URL).toString();
    result[key] = image;
  }
  return result as unknown as IconImages;
})();

