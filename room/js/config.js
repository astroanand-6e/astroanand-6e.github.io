// Shared dimensions and palette. 1 unit = 10 cm; y is up, the back wall is z = z0, the left wall is x = x0.
export const ROOM = Object.freeze({ x0: -15, x1: 15, z0: -12, z1: 12, height: 24, wall: 0.9, slab: 1.2 });

// A sit-and-stand desk. Everything is placed at sitting height (74 cm); the rig lifts it to 112 cm.
export const DESK = Object.freeze({ x: -1, z: -8, w: 14, d: 7, top: 7.4, topT: 0.35, standTop: 11.2 });
// The riser runs along the back of the desk; the monitor stands on it and the keyboard slides under its lip.
export const RISER = Object.freeze({
  x: -1, w: 13.2, d: 2.6, t: 0.28, lift: 1.15, top: DESK.top + 1.15 + 0.28, z: DESK.z - DESK.d / 2 + 1.3,
});
// The door hinges on its back jamb and swings into the room, so the opening stays in view.
export const DOOR = Object.freeze({ hingeZ: 0.3, w: 8.4, h: 20.5, openDeg: 98, frame: 0.55, thick: 0.5, ajar: 0.3 });
export const SWITCH = Object.freeze({ z: 10.8, y: 12.2 });
export const EYE_HEIGHT = 15.4;

export const SAKURA = 0xd47589;
export const SAKURA_NIGHT = 0xf4a7b9;
export const TEAL = 0x21d6cf;

export const PALETTE = Object.freeze({
  wall: 0xe6e2da,
  slab: 0xd2c7b2,
  floor: 0xe0d2b8,
  trim: 0xf6f3ec,
  ink: 0x2b2825,
  steel: 0x9aa0a5,
  metal: 0x15161a,
  deskWood: 0x1c1b1a,
  door: 0xbf9d72,
  chair: 0x5d6677,
  chairDark: 0x3f4654,
  paper: 0xf4efe6,
});
