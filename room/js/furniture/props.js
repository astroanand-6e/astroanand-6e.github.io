// The things on and around the desk, organized: a tall steel bottle, a dark mug on a coaster, a notepad with
// a pen squared to the edge, one tidy cable run down the right column, and a round thermostat on the back wall.
import * as THREE from 'three';
import { ROOM, DESK, RISER, PALETTE, TEAL } from '../config.js';
import { paint } from '../geo.js';
import { TRAY_BOTTOM, CABLE_X, CABLE_Z } from './desk.js';

export const MUG = Object.freeze({ x: 3.7, z: -7.9, rim: 0.52, height: 0.85 });
const BOTTLE = Object.freeze({ x: 4.9, z: RISER.z, r: 0.44, h: 3.1 });
const NOTEPAD = Object.freeze({ x: 2.55, z: -5.6, w: 1.4, d: 2 });
const CABLE_R = 0.055;
const CABLE_COLOR = 0xd9dcde;
const THERMOSTAT = Object.freeze({ x: 9.6, y: 13.4, r: 1.15 });
const SIDEWAYS = Math.PI / 2;

function tube(baker, points, radius, color) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  baker.add(new THREE.TubeGeometry(curve, 40, radius, 8), { color, outline: false, own: true });
}

function bakeBottle(baker, deskShadows) {
  const { x, z, r, h } = BOTTLE;
  const y = RISER.top;
  baker.cyl(r, r, h, { color: 0xaab1b6, pos: [x, y, z] }, 32);
  baker.cyl(r * 0.68, r, 0.36, { color: 0xaab1b6, pos: [x, y + h, z] }, 32);
  baker.cyl(r * 0.68, r * 0.68, 0.46, { color: 0x24272c, pos: [x, y + h + 0.36, z] }, 24);
  baker.add(new THREE.TorusGeometry(0.2, 0.045, 8, 16), { color: 0x24272c, outline: false, own: true, pos: [x, y + h + 0.95, z] });
  deskShadows.add({ x, z, w: 1.5, d: 1.5, y: y + 0.03, strength: 0.8 });
}

function bakeMug(baker, deskShadows) {
  const { x, z, rim, height } = MUG;
  const y = DESK.top;
  baker.cyl(0.8, 0.8, 0.07, { color: 0xc9b79d, pos: [x, y, z] }, 32);
  baker.cyl(rim, rim * 0.88, height, { color: 0x25282f, pos: [x, y + 0.07, z] }, 32);
  baker.cyl(rim * 0.84, rim * 0.84, 0.02, { color: 0x3b2a22, outline: false, pos: [x, y + 0.07 + height - 0.07, z] }, 24);
  baker.add(new THREE.TorusGeometry(0.27, 0.07, 8, 16, Math.PI), {
    color: 0x25282f, outline: false, own: true, pos: [x + rim - 0.02, y + 0.07 + height * 0.5, z], rot: [0, 0, -SIDEWAYS],
  });
  deskShadows.add({ x, z, w: 1.9, d: 1.9, y: y + 0.03, strength: 0.8 });
}

function bakeNotepad(baker, deskShadows) {
  const { x, z, w, d } = NOTEPAD;
  const y = DESK.top;
  baker.rbox(w, 0.2, d, 0.05, { color: 0xefe9db, pos: [x, y, z] });
  baker.box(w, 0.045, 0.34, { color: 0x2c6e72, pos: [x, y + 0.2, z - d / 2 + 0.17] });
  baker.add(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 10), { color: 0x1d2a4a, pos: [x - w / 2 - 0.45, y + 0.07, z], rot: [SIDEWAYS, 0, 0], own: true });
  deskShadows.add({ x, z, w: w + 0.6, d: d + 0.6, y: y + 0.03, strength: 0.6 });
}

/** Desk-mounted props and the top end of the cable (it rides with the tray). */
export function bakeDeskProps(baker, deskShadows) {
  bakeBottle(baker, deskShadows);
  bakeMug(baker, deskShadows);
  bakeNotepad(baker, deskShadows);
  tube(baker, [
    [DESK.x + 6.0, TRAY_BOTTOM + 0.18, DESK.z - 2.4],
    [CABLE_X + 1.0, TRAY_BOTTOM + 0.05, DESK.z - 1.4],
    [CABLE_X + 0.2, TRAY_BOTTOM - 0.04, CABLE_Z],
    [CABLE_X, TRAY_BOTTOM - 0.2, CABLE_Z],
  ], CABLE_R, CABLE_COLOR);
}

/** Fixed props: clips on the column, the floor run to the outlet, and the thermostat. */
export function bakeRoomProps(baker) {
  [1.4, 3.3, 5.1].forEach((y) => baker.box(0.2, 0.14, 0.24, { color: PALETTE.metal, outline: false, pos: [CABLE_X, y, CABLE_Z + 0.02] }));
  tube(baker, [
    [CABLE_X, 0.08, CABLE_Z], [CABLE_X, 0.07, CABLE_Z - 1], [CABLE_X + 0.5, 0.07, ROOM.z0 + 0.6], [CABLE_X + 0.5, 0.07, ROOM.z0 + 0.34],
  ], CABLE_R, CABLE_COLOR);
  baker.box(1.0, 1.4, 0.12, { color: PALETTE.trim, pos: [CABLE_X + 0.5, 0.5, ROOM.z0 + 0.06] });
  const { x, y, r } = THERMOSTAT;
  const z = ROOM.z0;
  baker.add(new THREE.CylinderGeometry(r, r, 0.4, 40), { color: 0xf5f3ee, pos: [x, y, z + 0.2], rot: [SIDEWAYS, 0, 0], own: true });
  baker.add(new THREE.TorusGeometry(r * 0.72, 0.05, 8, 40), { color: 0xb9bcbf, outline: false, own: true, pos: [x, y, z + 0.42] });
  baker.add(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.06, 32), { color: 0xe4e2dd, pos: [x, y, z + 0.43], rot: [SIDEWAYS, 0, 0], own: true });
  baker.sphere(0.07, { color: TEAL, outline: false, pos: [x, y - r * 0.82, z + 0.43] });
}

/** The vertical run of cable: a unit tube stretched from the floor to the tray as the desk moves. */
export function createCableRun({ mats, rig }) {
  const geometry = paint(new THREE.CylinderGeometry(CABLE_R, CABLE_R, 1, 10).translate(0, 0.5, 0), CABLE_COLOR);
  const mesh = new THREE.Mesh(geometry, mats.furniture);
  const floor = 0.08;
  mesh.position.set(CABLE_X, floor, CABLE_Z);
  mesh.raycast = () => {};
  const topAtSit = TRAY_BOTTOM - 0.2;
  return {
    mesh,
    update() {
      mesh.scale.y = Math.max(0.01, topAtSit + rig.position.y - floor);
    },
    dispose: () => geometry.dispose(),
  };
}
