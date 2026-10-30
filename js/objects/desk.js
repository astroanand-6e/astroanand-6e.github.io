// The desk: a light-oak desk with the four figures and Anand, on a specimen floor base (units: 1 = 10 cm).
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { create as createFlx4 } from './ddj-flx4.js';
import { create as createMacbook } from './macbook.js';
import { create as createDualsense } from './dualsense.js';
import { create as createMic } from './mic.js';
import { create as createCharacter } from './character.js';

const PLINTH_T = 0.15;
const PLINTH_RADIUS = 0.6;
const PLINTH_BEVEL = 0.03;
const PLINTH_FLOAT = 0.2;
const INSET_GAP = 0.3;
const INSET_LIFT = 0.003;
const PLINTH_COLORS = { paper: 0xece5d8, ink: 0x16181e };
const OAK = { paper: 0xd9c4a3, ink: 0xa8906f };
const LEG_COLOR = 0x2b2b30;
const STOOL_COLOR = 0x3a3b42;
const SHADOW_PAD = 1.1;
const HALF_PI = Math.PI / 2;
// Layout is authored in "content" space: floor at y = 0, desk long axis along x, camera side at +z.
const LAYOUT_YAW = 0.5;
const DESK = { x0: -3.4, x1: 8.6, z0: -2.8, z1: 2.8, top: 6.8, thick: 0.28, leg: 0.2, inset: 0.35, radius: 0.3, bevel: 0.04 };
const STOOL = { x: -5.3, z: 0, seat: 3.98, radius: 1.5, seatThick: 0.3, pole: 0.18, base: 1.25 };
const PLINTH_RECT = { x0: -7.4, x1: 9.5, z0: -5.5, z1: 3.8 };
const PLACEMENTS = {
  flx4: { x: 4.6, z: -0.1, yaw: Math.PI },
  macbook: { x: -1.4, z: 0.2, yaw: -0.7 },
  dualsense: { x: 1.3, z: 1.5, yaw: -0.3 },
  mic: { x: 1.1, z: -1.9, yaw: 0 },
};
const SPOTS = {
  seat: { x: -5.25, z: 0, yaw: HALF_PI },
  stand: { x: 4.6, z: -3.75, yaw: 0.45 },
  speak: { x: 1.1, z: -3.75, yaw: 0.35 },
};
const STAND_ENVELOPE = { w: 3.4, h: 16.4, d: 3.2 };
const KEYS = { left: [-0.8, 0.14, -0.3], right: [0.8, 0.14, -0.3] };
const JOG = [-1.54, 0.8, -0.19];
const FADER = { x: 0.22, y: 0.75, z: 1.17 };
const MIC_HEAD = [0, 2.3, 0.2];
const CREASE = 0.7;
const SPREAD = 0.12;
const EXPLODE_RATE = 7;
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
  const addPart = (parent, parts, obj, label, pos, explode) => {
    obj.position.copy(pos);
    const offset = Array.isArray(explode) ? explode : [pos.x * SPREAD, explode, pos.z * SPREAD];
    if (mark) mark(obj, { explode: offset, label });
    else Object.assign(obj.userData, { home: pos.clone(), explode: new THREE.Vector3(...offset), label });
    parent.add(obj);
    parts.push(obj);
    return obj;
  };
  return { owned, mat, outline, addPart, exploder: (parts) => (mark ? () => {} : makeExploder(parts)) };
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
function buildInsetFrame(w, d, lineMaterial) {
  if (!lineMaterial) return null;
  const outline = roundedRect(w - 2 * INSET_GAP, d - 2 * INSET_GAP, Math.max(PLINTH_RADIUS - INSET_GAP, 0.1));
  const points = outline.getPoints(10).map((p) => new THREE.Vector3(p.x, PLINTH_T + INSET_LIFT, p.y));
  const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMaterial);
  frame.raycast = () => {};
  frame.userData.isOutline = true;
  return frame;
}

// Slim oak top on four thin dark legs, plus a round stool; everything sits on the floor (y = 0).
function buildFurniture(kit, oakMat) {
  const furniture = new THREE.Group();
  furniture.name = 'furniture';
  const width = DESK.x1 - DESK.x0;
  const depth = DESK.z1 - DESK.z0;
  const top = new THREE.Mesh(slab(width, DESK.thick, depth, DESK.radius, DESK.bevel), oakMat);
  top.position.set((DESK.x0 + DESK.x1) / 2, DESK.top - DESK.thick, (DESK.z0 + DESK.z1) / 2);
  kit.outline(top);
  furniture.add(top);
  const legMat = kit.mat('ink', LEG_COLOR);
  const legH = DESK.top - DESK.thick;
  const legGeo = new THREE.BoxGeometry(DESK.leg, legH, DESK.leg);
  [DESK.x0 + DESK.inset, DESK.x1 - DESK.inset].forEach((x) => {
    [DESK.z0 + DESK.inset, DESK.z1 - DESK.inset].forEach((z) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, legH / 2, z);
      kit.outline(leg);
      furniture.add(leg);
    });
  });
  const stoolMat = kit.mat('ink', STOOL_COLOR);
  const stool = new THREE.Group();
  stool.position.set(STOOL.x, 0, STOOL.z);
  const parts = [
    [new THREE.CylinderGeometry(STOOL.radius, STOOL.radius, STOOL.seatThick, 40), STOOL.seat - STOOL.seatThick / 2],
    [new THREE.CylinderGeometry(STOOL.pole, STOOL.pole, STOOL.seat - STOOL.seatThick, 16), (STOOL.seat - STOOL.seatThick) / 2],
    [new THREE.CylinderGeometry(STOOL.base, STOOL.base, 0.14, 40), 0.07],
  ];
  parts.forEach(([geo, y]) => {
    const mesh = new THREE.Mesh(geo, stoolMat);
    mesh.position.y = y;
    kit.outline(mesh);
    stool.add(mesh);
  });
  furniture.add(stool);
  return furniture;
}

// Hand, gaze and seat targets for the character, in content space (the parent of every figure).
function buildEnv(content, figures) {
  const at = (fig, local) => new THREE.Vector3(...local).applyMatrix4(fig.group.matrix);
  const screenPart = figures.macbook.parts.find((p) => p.userData.label === 'game library / code');
  const screen = new THREE.Box3().setFromObject(screenPart).getCenter(new THREE.Vector3());
  content.worldToLocal(screen);
  return {
    spots: SPOTS,
    keys: { left: at(figures.macbook, KEYS.left), right: at(figures.macbook, KEYS.right) },
    screen,
    mic: at(figures.mic, MIC_HEAD),
    mixer: {
      jog: at(figures.flx4, JOG),
      fader: (fade) => at(figures.flx4, [(fade - 0.5) * 2 * FADER.x, FADER.y, FADER.z]),
    },
    controller: figures.dualsense.group,
  };
}

export function create(ctx) {
  const kit = makeKit(ctx);
  const group = new THREE.Group();
  group.name = 'desk';
  const layout = new THREE.Group();
  layout.rotation.y = LAYOUT_YAW;
  const content = new THREE.Group();
  const plinthW = PLINTH_RECT.x1 - PLINTH_RECT.x0;
  const plinthD = PLINTH_RECT.z1 - PLINTH_RECT.z0;
  content.position.set(-(PLINTH_RECT.x0 + PLINTH_RECT.x1) / 2, PLINTH_FLOAT + PLINTH_T, -(PLINTH_RECT.z0 + PLINTH_RECT.z1) / 2);
  layout.add(content);
  group.add(layout);

  let theme = ctx?.materials?.theme === 'ink' ? 'ink' : 'paper';
  const oakMat = kit.mat('paper', OAK[theme]);
  content.add(buildFurniture(kit, oakMat));

  const builders = { flx4: createFlx4, macbook: createMacbook, dualsense: createDualsense, mic: createMic };
  const figures = Object.fromEntries(Object.entries(builders).map(([key, build]) => [key, build(ctx)]));
  for (const [key, fig] of Object.entries(figures)) {
    const { x, z, yaw } = PLACEMENTS[key];
    fig.group.position.set(x, DESK.top, z);
    fig.group.rotation.y = yaw;
    fig.group.updateMatrix();
    content.add(fig.group);
  }
  group.updateMatrixWorld(true);

  const character = createCharacter(ctx, buildEnv(content, figures));
  content.add(character.group);
  // Invisible envelope of the tallest pose (standing), so the stage frames the character in every activity.
  const envelope = new THREE.Mesh(new THREE.BoxGeometry(STAND_ENVELOPE.w, STAND_ENVELOPE.h, STAND_ENVELOPE.d));
  envelope.visible = false;
  envelope.raycast = () => {};
  envelope.position.set(SPOTS.stand.x, STAND_ENVELOPE.h / 2, SPOTS.stand.z);
  content.add(envelope);

  const parts = [];
  const plinth = new THREE.Mesh(slab(plinthW, PLINTH_T, plinthD, PLINTH_RADIUS, PLINTH_BEVEL), kit.mat('paper', PLINTH_COLORS[theme]));
  kit.outline(plinth);
  const frame = buildInsetFrame(plinthW, plinthD, ctx?.materials?.line);
  if (frame) plinth.add(frame);
  kit.addPart(layout, parts, plinth, 'specimen plinth', new THREE.Vector3(0, PLINTH_FLOAT, 0), [0, 0, 0]);
  const deskParts = [plinth];
  for (const fig of Object.values(figures)) parts.push(...fig.parts);
  parts.sort((a, b) => a.userData.explode.y - b.userData.explode.y);
  const explode = kit.exploder(deskParts);

  function update(dt, state) {
    for (const fig of Object.values(figures)) fig.update(dt, state);
    if (OAK[state?.theme] && state.theme !== theme) {
      theme = state.theme;
      oakMat.color.setHex(OAK[theme]);
      plinth.material.color.setHex(PLINTH_COLORS[theme]);
    }
    explode(dt, state);
    character.update(dt, state);
  }

  function onPick(part) {
    for (const fig of Object.values(figures)) {
      if (fig.parts.includes(part)) return fig.onPick(part);
    }
    return part?.userData?.label ?? null;
  }

  function dispose() {
    for (const fig of Object.values(figures)) {
      content.remove(fig.group);
      fig.dispose();
    }
    character.dispose();
    envelope.geometry.dispose();
    disposeAll(group, kit.owned);
  }

  group.userData.shadowRadius = (Math.hypot(plinthW, plinthD) / 2) * SHADOW_PAD;
  return { group, parts, anchors: [], figures, update, onPick, dispose };
}
