// Room materials. The figures use the homepage materials (shared); the room adds its own toon
// materials on the same gradient ramp, so both follow the same paper / ink stepping.
import * as THREE from 'three';
import { createMaterials } from '../../js/stage/materials.js';
import { PALETTE } from './config.js';

const POLYGON_OFFSET = 1;
// Multipliers that cool and dim the room's base colours when the lights go out.
const NIGHT_TINT = Object.freeze({
  furniture: new THREE.Color(0.62, 0.7, 0.82),
  wall: new THREE.Color(0.46, 0.54, 0.64),
  floor: new THREE.Color(0.5, 0.58, 0.68),
  slab: new THREE.Color(0.44, 0.5, 0.6),
});
const DAY_TINT = new THREE.Color(1, 1, 1);

export function createRoomMaterials(theme) {
  const shared = createMaterials(theme);
  const base = {
    gradientMap: shared.gradient,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET,
    polygonOffsetUnits: POLYGON_OFFSET,
  };
  const toon = (extra) => new THREE.MeshToonMaterial({ ...base, ...extra });

  const mats = {
    shared,
    line: shared.line,
    furniture: toon({ vertexColors: true }),
    wall: toon({ color: PALETTE.wall }),
    slab: toon({ color: PALETTE.slab }),
    floor: toon({ color: 0xffffff }),
    door: toon({ vertexColors: true }),
    deskTop: toon({ color: 0xffffff }),
    poster: toon({ color: 0xffffff }),
  };

  const tinted = [
    ['furniture', 'furniture'],
    ['door', 'furniture'],
    ['deskTop', 'furniture'],
    ['poster', 'furniture'],
    ['wall', 'wall'],
    ['floor', 'floor'],
    ['slab', 'slab'],
  ];
  const baseColor = { wall: new THREE.Color(PALETTE.wall), slab: new THREE.Color(PALETTE.slab) };

  /** night: 0 (lights on) to 1 (lights out). Colours multiply with the lighting. */
  mats.setNight = (night) => {
    tinted.forEach(([name, tint]) => {
      mats[name].color.lerpColors(DAY_TINT, NIGHT_TINT[tint], night);
      if (baseColor[name]) mats[name].color.multiply(baseColor[name]);
    });
  };
  mats.setNight(theme === 'ink' ? 1 : 0);

  mats.dispose = () => {
    shared.dispose();
    tinted.forEach(([name]) => mats[name].dispose());
  };
  return mats;
}
