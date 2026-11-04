// A black sit-and-stand desk: one wood-grain slab on a two-column motor frame (fixed lower columns on flat
// feet, upper columns and crossbar that ride with the top), a slim cable tray under the back edge, and the
// riser shelf on top. Static parts bake into the room; mounted parts bake into the desk rig, which moves.
import * as THREE from 'three';
import { DESK, RISER, PALETTE } from '../config.js';
import { slab, lineSet } from '../geo.js';

const TOP_RADIUS = 0.5;
const TOP_BEVEL = 0.05;
const COLUMN = Object.freeze({ offset: DESK.w / 2 - 1.5, lowerW: 0.66, lowerD: 0.56, lowerTop: 6.3, upperW: 0.5, upperD: 0.4, upperLen: 5 });
const FOOT = Object.freeze({ w: 0.72, h: 0.26, d: 5.8 });
const UNDERSIDE = DESK.top - DESK.topT;
const TRAY = Object.freeze({ w: 12.6, d: 1.5, drop: 0.85, lip: 0.36 });
const GRAIN = Object.freeze({ w: 1024, h: 512, streaks: 190 });
const MAX_ANISOTROPY = 8;

export const TRAY_BOTTOM = UNDERSIDE - TRAY.drop;
export const CABLE_X = DESK.x + COLUMN.offset;
export const CABLE_Z = DESK.z + COLUMN.lowerD / 2 + 0.14;

/** Fixed lower columns and flat feet (they stay on the floor while the top moves). */
export function bakeDeskFrame(baker, floorShadows) {
  const metal = { color: PALETTE.metal };
  [-1, 1].forEach((s) => {
    const x = DESK.x + s * COLUMN.offset;
    baker.rbox(FOOT.w, FOOT.h, FOOT.d, 0.08, { ...metal, pos: [x, 0, DESK.z] });
    baker.rbox(COLUMN.lowerW, COLUMN.lowerTop - FOOT.h, COLUMN.lowerD, 0.07, { ...metal, pos: [x, FOOT.h, DESK.z] });
    floorShadows.add({ x, z: DESK.z, w: FOOT.w + 0.9, d: FOOT.d + 0.9, strength: 0.9 });
  });
  floorShadows.add({ x: DESK.x, z: DESK.z + 0.4, w: DESK.w + 1, d: DESK.d + 1.4, strength: 0.55 });
}

function bakeRiser(baker, deskShadows) {
  baker.rbox(RISER.w, RISER.t, RISER.d, 0.06, { color: PALETTE.deskWood, pos: [RISER.x, DESK.top + RISER.lift, RISER.z] });
  [-1, 1].forEach((s) => {
    baker.box(0.5, RISER.lift, RISER.d - 0.5, { color: PALETTE.metal, pos: [RISER.x + s * (RISER.w / 2 - 0.55), DESK.top, RISER.z] });
  });
  deskShadows.add({ x: RISER.x, z: RISER.z + 0.5, w: RISER.w + 0.4, d: RISER.d + 0.9, y: DESK.top + 0.03, strength: 0.85 });
}

/** Everything that rides with the top: upper columns, crossbar, cable tray, riser. */
export function bakeDeskMounted(baker, deskShadows) {
  const metal = { color: PALETTE.metal };
  [-1, 1].forEach((s) => {
    const x = DESK.x + s * COLUMN.offset;
    baker.rbox(COLUMN.upperW, COLUMN.upperLen, COLUMN.upperD, 0.06, { ...metal, pos: [x, UNDERSIDE - COLUMN.upperLen, DESK.z] });
    baker.rbox(1.5, 0.14, 2.6, 0.05, { ...metal, pos: [x, UNDERSIDE - 0.14, DESK.z] });
  });
  baker.rbox(COLUMN.offset * 2, 0.5, 0.42, 0.06, { ...metal, pos: [DESK.x, UNDERSIDE - 0.64, DESK.z - 1.4] });
  const trayZ = DESK.z - DESK.d / 2 + 1;
  baker.box(TRAY.w, 0.1, TRAY.d, { ...metal, pos: [DESK.x, TRAY_BOTTOM, trayZ] });
  [-1, 1].forEach((s) => baker.box(TRAY.w, TRAY.lip, 0.08, { ...metal, pos: [DESK.x, TRAY_BOTTOM, trayZ + s * (TRAY.d / 2 - 0.04)] }));
  [-5.2, 0, 5.2].forEach((x) => baker.box(0.14, TRAY.drop, 0.4, { ...metal, pos: [DESK.x + x, TRAY_BOTTOM, trayZ] }));
  bakeRiser(baker, deskShadows);
}

function grainTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = GRAIN.w;
  canvas.height = GRAIN.h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#1c1b1a';
  g.fillRect(0, 0, GRAIN.w, GRAIN.h);
  let s = 31;
  const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  g.lineWidth = 1.2;
  for (let i = 0; i < GRAIN.streaks; i += 1) {
    const y = rand() * GRAIN.h;
    const x = rand() * GRAIN.w;
    const length = 160 + rand() * 640;
    g.strokeStyle = rand() > 0.35 ? `rgba(120, 118, 114, ${0.05 + rand() * 0.09})` : `rgba(0, 0, 0, ${0.2 + rand() * 0.2})`;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + length * 0.3, y + (rand() - 0.5) * 6, x + length * 0.7, y + (rand() - 0.5) * 6, x + length, y + (rand() - 0.5) * 4);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(MAX_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

/** The slab itself: its own mesh so the grain can be a texture. Grain runs along the desk's length. */
export function createDeskTop({ renderer, mats }) {
  const geometry = slab(DESK.w, DESK.topT, DESK.d, TOP_RADIUS, TOP_BEVEL);
  const p = geometry.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 1) {
    uv[i * 2] = p.getX(i) / DESK.w + 0.5;
    uv[i * 2 + 1] = 0.5 - p.getZ(i) / DESK.d;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const texture = grainTexture(renderer);
  mats.deskTop.map = texture;
  mats.deskTop.needsUpdate = true;
  const group = new THREE.Group();
  group.name = 'desk-top';
  group.position.set(DESK.x, UNDERSIDE, DESK.z);
  const edges = new THREE.EdgesGeometry(geometry, 30);
  group.add(new THREE.Mesh(geometry, mats.deskTop), lineSet(edges, mats.line));
  return {
    group,
    dispose() {
      geometry.dispose();
      edges.dispose();
      texture.dispose();
    },
  };
}
