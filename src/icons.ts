const iconUrl = (name: string): URL => {
  const path = window.location.pathname.startsWith('/')
    ? window.location.pathname.substring(1)
    : window.location.pathname;
  const subpath = path.length > 0 ? `${path}/icons/${name}` : `icons/${name}`;
  return new URL(`${window.location.protocol}//${window.location.host}/${subpath}`);
};

const Icons = {
  pointerTool: iconUrl('cursor.svg'),
  panTool: iconUrl('grab.svg'),
  roomTool: iconUrl('draw-room.svg'),
  jointTool: iconUrl('joint.svg'),
  rulerTool: iconUrl('ruler.svg'),
  rulerCursor: iconUrl('ruler-cursor.svg'),
  angleLocked: iconUrl('angle-locked.svg'),
  angleUnlocked: iconUrl('angle-unlocked.svg'),
  posLocked: iconUrl('pos-locked.svg'),
  posUnlocked: iconUrl('pos-unlocked.svg'),
  axisLocked: iconUrl('axis-locked.svg'),
  axisUnlocked: iconUrl('axis-unlocked.svg'),
  lengthLocked: iconUrl('length-locked.svg'),
  lengthUnlocked: iconUrl('length-unlocked.svg'),
  axisX: iconUrl('axis-x.svg'),
  axisY: iconUrl('axis-y.svg'),
  visible: iconUrl('eye-open.svg'),
  invisible: iconUrl('eye-closed.svg'),
  hideAngles: iconUrl('hide-angles.svg'),
  showAngles: iconUrl('show-angles.svg'),
  hideGrid: iconUrl('hide-grid.svg'),
  showGrid: iconUrl('show-grid.svg'),
  hideGuides: iconUrl('hide-guides.svg'),
  showGuides: iconUrl('show-guides.svg'),
  hideLengths: iconUrl('hide-lengths.svg'),
  showLengths: iconUrl('show-lengths.svg'),
  kinematicsOn: iconUrl('kinematics-on.svg'),
  kinematicsOff: iconUrl('kinematics-off.svg'),
  recenter: iconUrl('recenter.svg'),
  snapOn: iconUrl('snap-on.svg'),
  snapOff: iconUrl('snap-off.svg'),
  snapLocalOn: iconUrl('snap-local-on.svg'),
  snapLocalOff: iconUrl('snap-local-off.svg'),
  snapGlobalOn: iconUrl('snap-global-on.svg'),
  snapGlobalOff: iconUrl('snap-global-off.svg'),
  //snapGuidesOn: iconUrl('snap-guides-on.svg'),
  //snapGuidesOff: iconUrl('snap-guides-off.svg'),
  snapGeomOff: iconUrl('snap-geom-off.svg'),
  snapGeomOn: iconUrl('snap-geom-on.svg'),
  snapGridOff: iconUrl('grid-snap-off.svg'),
  snapGridOn: iconUrl('grid-snap-on.svg'),
};
