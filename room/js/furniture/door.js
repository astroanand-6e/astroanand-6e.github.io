// The door on the left wall: white architrave (static bake) and a paneled leaf that swings inward on its back jamb.
import * as THREE from 'three';
import { ROOM, DOOR, PALETTE } from '../config.js';
import { createBaker, meshFromBake } from '../geo.js';
import { CriticalSpring } from '../../../js/stage/motion.js';

const PANEL_COLOR = 0xcfb088;
const HANDLE_COLOR = 0x8a8d90;
const OPEN_SMOOTH_S = 0.55;
const PIVOT_X = ROOM.x0 - ROOM.wall / 2;

export function bakeDoorFrame(baker) {
  const { hingeZ, w, h, frame } = DOOR;
  const trim = { color: PALETTE.trim };
  const depth = 0.34;
  const x = ROOM.x0 + depth / 2 - 0.04;
  baker.box(depth, h + frame, frame, { ...trim, pos: [x, 0, hingeZ - frame / 2] });
  baker.box(depth, h + frame, frame, { ...trim, pos: [x, 0, hingeZ + w + frame / 2] });
  baker.box(depth, frame, w + 2 * frame, { ...trim, pos: [x, h, hingeZ + w / 2] });
  baker.box(0.5, 0.14, w, { color: PALETTE.steel, pos: [PIVOT_X, 0, hingeZ + w / 2] });
}

function bakeLeaf(baker) {
  const { w, h, thick } = DOOR;
  const mid = w / 2;
  baker.box(thick, h, w, { color: PALETTE.door, pos: [0, 0, mid] });
  [-1, 1].forEach((side) => {
    const x = side * (thick / 2 + 0.03);
    [[h * 0.27, 4.9], [h * 0.73, 7.2]].forEach(([cy, ph]) => {
      baker.box(0.08, ph, w - 2.7, { color: PANEL_COLOR, pos: [x, cy - ph / 2, mid] });
    });
    const handle = { color: HANDLE_COLOR, pos: [side * (thick / 2 + 0.2), 10.2, w - 0.95] };
    baker.cyl(0.2, 0.2, 0.2, { ...handle, rot: [0, 0, -side * Math.PI / 2], pos: [side * (thick / 2 + 0.1), 10.2, w - 0.95] });
    baker.box(0.16, 0.16, 1.15, { ...handle, pos: [side * (thick / 2 + 0.3), 10.12, w - 1.45] });
  });
}

/** The leaf as its own mesh on a pivot, so intro and idle code can open and close it. */
export function createDoor({ mats }) {
  const baker = createBaker();
  bakeLeaf(baker);
  const leaf = meshFromBake(baker.build(), mats.door, mats.line);
  const pivot = new THREE.Group();
  pivot.name = 'door-pivot';
  pivot.position.set(PIVOT_X, 0, DOOR.hingeZ);
  pivot.add(leaf);

  const openAngle = THREE.MathUtils.degToRad(DOOR.openDeg);
  const swing = new CriticalSpring(0, OPEN_SMOOTH_S);

  function set(openness, { immediate = false } = {}) {
    swing.target = openness;
    if (immediate) swing.snap(openness);
    pivot.rotation.y = swing.value * openAngle;
  }

  function update(dt) {
    swing.step(dt);
    pivot.rotation.y = swing.value * openAngle;
  }

  return {
    group: pivot,
    set,
    update,
    openness: () => swing.value,
    dispose: () => leaf.traverse((n) => n.geometry && n.geometry.dispose()),
  };
}
