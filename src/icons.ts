const iconUrl = (name: string): URL => {
  return new URL(name, `${window.location}/icons/${name}`);
};

const Icons = {
  pointerTool: iconUrl('icons/cursor.svg'),
  panTool: iconUrl('icons/grab.svg'),
  roomTool: iconUrl('icons/draw-room.svg'),
  jointTool: iconUrl('icons/joint.svg'),
  angleLocked: iconUrl('icons/angle-locked.svg'),
  angleUnlocked: iconUrl('icons/angle-unlocked.svg'),
};

