// The desk: four figures resting on a thin specimen plinth (units: 1 = 10 cm).
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { create as createFlx4 } from './ddj-flx4.js';
import { create as createMacbook } from './macbook.js';
import { create as createDualsense } from './dualsense.js';
import { create as createMic } from './mic.js';

const PLINTH_T = 0.15;
const PLINTH_MARGIN = 0.55;
const PLINTH_RADIUS = 0.6;
const PLINTH_BEVEL = 0.03;
const PLINTH_FLOAT = 0.2;
const INSET_GAP = 0.3;
const INSET_LIFT = 0.003;
const PLINTH_COLORS = { paper: 0xece5d8, ink: 0x16181e };
const SHADOW_PAD = 1.1;
const SIDE_DEAD_ZONE = 0.05;
const CABLE_R = 0.03;
const CABLE_SEGMENTS = 56;
const PLUG = { w: 0.14, h: 0.11, d: 0.14, y: 0.28 };
const PORT_INSET = 0.75;
// Half the FLX4 chassis depth (DEPTH 2.72 in ddj-flx4.js). Its bounding box also
// holds the USB cable, which sticks out past the rear panel.
const FLX4_HALF_DEPTH = 1.36;
const PLACEMENTS = {
  flx4: { x: 0, z: 0.9, yaw: 0 },
  macbook: { x: -2.4, z: -1.65, yaw: 0.35 },
  dualsense: { x: 3.9, z: 2.0, yaw: -0.44 },
  mic: { x: 3.7, z: -1.2, yaw: 0 },
};
const DESK_ANCHORS = [
  'jog wheel',
  '16 performance pads',
  '3-band eq',
  'crossfader',
  'm5 pro · 14 in',
  'game library / code',
  'light bar',
  'dynamic mic',
];
const SPREAD = 0.12;
const EXPLODE_RATE = 7;
const CREASE = 0.7;
const FALLBACK = { dark: 0x2b2825, ink: 0x1c1a17, white: 0xfbfaf5, silver: 0xc7cacc, paper: 0xf4efe6, sakura: 0xd47589 };

function makeExploder(parts) {
  let k = 0;
  return (dt, state) => {
    if (typeof state?.exploded !== 'boolean') return;
    const target = state.exploded ? 1 : 0;
    if (k === target) return;
    k += (target - k) * (1 - Math.exp(-EXPLODE_RATE * dt));
    if (Math.abs(target - k) < 1e-3) k = target;
    for (const p of parts) p.position.copy(p.userData.home).addScaledVector(p.userData.explode, k);
  };
}

// Shared theme-aware roles come from ctx.materials; explode is owned by ctx.parts when present.
function makeKit(ctx) {
  const owned = [];
  const cache = new Map();
  const mats = ctx?.materials;
  const mark = typeof ctx?.parts?.mark === 'function' ? ctx.parts.mark : null;
  const mat = (role, color) => {
    const base = mats?.[role];
    if (base && color === undefined) return base;
    const key = `${role}:${color}`;
    if (cache.has(key)) return cache.get(key);
    const m = base?.clone ? base.clone() : new THREE.MeshToonMaterial();
    m.color.setHex(color ?? FALLBACK[role] ?? 0xffffff);
    owned.push(m);
    cache.set(key, m);
    return m;
  };
  const outline = (mesh, deg) => {
    if (typeof mats?.makeOutline === 'function') mats.makeOutline(mesh, deg);
    return mesh;
  };
  const lines = (geometry) => {
    if (!mats?.line) return null;
    const segments = new THREE.LineSegments(geometry, mats.line);
    segments.raycast = () => {};
    segments.userData.isOutline = true;
    return segments;
  };
  const addPart = (parent, parts, obj, label, pos, explode) => {
    obj.position.copy(pos);
    const offset = Array.isArray(explode) ? explode : [pos.x * SPREAD, explode, pos.z * SPREAD];
    if (mark) {
      mark(obj, { explode: offset, label });
    } else {
      Object.assign(obj.userData, { home: pos.clone(), explode: new THREE.Vector3(...offset), label });
    }
    parent.add(obj);
    parts.push(obj);
    return obj;
  };
  const exploder = (parts) => (mark ? () => {} : makeExploder(parts));
  return { owned, mat, outline, lines, addPart, exploder };
}

function disposeAll(group, owned) {
  group.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.isInstancedMesh) o.dispose();
  });
  for (const m of owned) m.dispose();
}

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const x = w / 2;
  const y = d / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x, y - r);
  s.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  s.lineTo(-x + r, y);
  s.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-x, -y + r);
  s.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Flat slab on y in [0, h] with a 45-degree chamfer, so outlines trace the bevel.
function slab(w, h, d, radius, bevel) {
  const shape = roundedRect(w - 2 * bevel, d - 2 * bevel, Math.max(radius - bevel, 0.01));
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: h - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 8,
  });
  raw.rotateX(-Math.PI / 2).translate(0, bevel, 0);
  const smooth = toCreasedNormals(raw, CREASE);
  raw.dispose();
  return smooth;
}


// Hairline frame inset from the plinth edge, like a specimen plate border.
function buildInsetFrame(kit, w, d, lineMaterial) {
  if (!lineMaterial) return null;
  const outline = roundedRect(w - 2 * INSET_GAP, d - 2 * INSET_GAP, Math.max(PLINTH_RADIUS - INSET_GAP, 0.1));
  const points = outline.getPoints(10).map((p) => new THREE.Vector3(p.x, PLINTH_T + INSET_LIFT, p.y));
  const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMaterial);
  frame.raycast = () => {};
  frame.userData.isOutline = true;
  return frame;
}

function placeFigures(group, figures) {
  const bounds = new THREE.Box3();
  for (const [key, fig] of Object.entries(figures)) {
    const { x, z, yaw } = PLACEMENTS[key];
    fig.group.position.set(x, 0, z);
    fig.group.rotation.y = yaw;
    group.add(fig.group);
  }
  group.updateMatrixWorld(true);
  for (const fig of Object.values(figures)) bounds.expandByObject(fig.group, true);
  return bounds;
}

function boxOf(fig) {
  return new THREE.Box3().setFromObject(fig.group, true);
}

// XLR cable lying on the plinth from the mic base, curving behind the FLX4 into its rear panel.
function buildCable(kit, matTop, flxBox, micBox) {
  const portX = flxBox.max.x - PORT_INSET;
  const back = Math.max(flxBox.min.z, PLACEMENTS.flx4.z - FLX4_HALF_DEPTH);
  const micZ = (micBox.min.z + micBox.max.z) / 2;
  const rest = matTop + CABLE_R;
  const p = (x, y, z) => new THREE.Vector3(x, y, z);
  const curve = new THREE.CatmullRomCurve3([
    p(micBox.min.x + 0.06, matTop + 0.05, micZ),
    p(micBox.min.x - 0.3, rest, micZ + 0.05),
    p(micBox.min.x - 0.9, rest, micZ - 0.4),
    p(portX + 0.5, rest, back - 0.75),
    p(portX + 0.1, rest, back - 0.5),
    p(portX, matTop + 0.14, back - 0.3),
    p(portX, matTop + PLUG.y, back - 0.1),
  ], false, 'centripetal');
  const cable = new THREE.Group();
  cable.add(new THREE.Mesh(new THREE.TubeGeometry(curve, CABLE_SEGMENTS, CABLE_R, 8), kit.mat('ink')));
  const plug = new THREE.Mesh(new THREE.BoxGeometry(PLUG.w, PLUG.h, PLUG.d), kit.mat('silver'));
  plug.position.set(portX, matTop + PLUG.y, back - PLUG.d / 2 + 0.005);
  kit.outline(plug);
  cable.add(plug);
  return cable;
}

function pickAnchors(figures, rootGroup) {
  const split = figures.flx4.group.position.x;
  const wanted = new Map(DESK_ANCHORS.map((label, index) => [label, index]));
  const found = Object.values(figures).flatMap((fig) => fig.anchors.filter((a) => wanted.has(a.label)));
  found.sort((a, b) => wanted.get(a.label) - wanted.get(b.label));
  rootGroup.updateMatrixWorld(true);
  const world = new THREE.Vector3();
  return found.map((anchor) => {
    anchor.object3D.getWorldPosition(world);
    return { ...anchor, side: world.x < split - SIDE_DEAD_ZONE ? 'left' : 'right' };
  });
}

export function create(ctx) {
  const kit = makeKit(ctx);
  const group = new THREE.Group();
  group.name = 'desk';
  const parts = [];
  const builders = { flx4: createFlx4, macbook: createMacbook, dualsense: createDualsense, mic: createMic };
  const figures = Object.fromEntries(Object.entries(builders).map(([key, build]) => [key, build(ctx)]));

  const bounds = placeFigures(group, figures);
  const center = bounds.getCenter(new THREE.Vector3());
  const plinthW = bounds.max.x - bounds.min.x + 2 * PLINTH_MARGIN;
  const plinthD = bounds.max.z - bounds.min.z + 2 * PLINTH_MARGIN;
  const matTop = PLINTH_FLOAT + PLINTH_T;
  for (const fig of Object.values(figures)) {
    fig.group.position.set(fig.group.position.x - center.x, matTop, fig.group.position.z - center.z);
  }
  group.updateMatrixWorld(true);

  let theme = ctx?.materials?.theme === 'ink' ? 'ink' : 'paper';
  const plinthMat = kit.mat('paper', PLINTH_COLORS[theme]);
  const plinth = new THREE.Mesh(slab(plinthW, PLINTH_T, plinthD, PLINTH_RADIUS, PLINTH_BEVEL), plinthMat);
  kit.outline(plinth);
  const frame = buildInsetFrame(kit, plinthW, plinthD, ctx?.materials?.line);
  if (frame) plinth.add(frame);
  kit.addPart(group, parts, plinth, 'specimen plinth', new THREE.Vector3(0, PLINTH_FLOAT, 0), [0, 0, 0]);

  const cable = buildCable(kit, matTop, boxOf(figures.flx4), boxOf(figures.mic));
  kit.addPart(group, parts, cable, 'xlr cable', new THREE.Vector3(), [0, 0.6, 0]);

  const deskParts = [plinth, cable];
  for (const fig of Object.values(figures)) parts.push(...fig.parts);
  parts.sort((a, b) => a.userData.explode.y - b.userData.explode.y);
  const anchors = pickAnchors(figures, group);
  const explode = kit.exploder(deskParts);

  function update(dt, state) {
    for (const fig of Object.values(figures)) fig.update(dt, state);
    if (PLINTH_COLORS[state?.theme] && state.theme !== theme) {
      theme = state.theme;
      plinthMat.color.setHex(PLINTH_COLORS[theme]);
    }
    explode(dt, state);
  }

  function onPick(part) {
    for (const fig of Object.values(figures)) {
      if (fig.parts.includes(part)) return fig.onPick(part);
    }
    return part?.userData?.label ?? null;
  }

  function dispose() {
    for (const fig of Object.values(figures)) {
      group.remove(fig.group);
      fig.dispose();
    }
    disposeAll(group, kit.owned);
  }

  group.userData.shadowRadius = (Math.hypot(plinthW, plinthD) / 2) * SHADOW_PAD;
  return { group, parts, anchors, figures, update, onPick, dispose };
}
