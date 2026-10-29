// Dynamic mic on a short desk stand with a shock mount (units: 1 = 10 cm). The desk adds the cable.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE_R = 0.55;
const BASE_H = 0.1;
const STEM_R = 0.04;
const STEM_TOP = 1.05;
const PLATE_H = 0.06;
const BODY_Y0 = STEM_TOP + PLATE_H;
const BODY_LEN = 0.78;
const BODY_R = 0.2;
const BAND_H = 0.07;
const GRILLE_LEN = 0.34;
const RING_Y = BODY_Y0 + 0.5;
const RING_R = 0.29;
const POST_R = 0.014;
const SPOKE_COUNT = 4;
const GRILLE_LATTICE_DEG = 5;
const SHADOW_RADIUS = 1.2;
const SPREAD = 0.12;
const EXPLODE_RATE = 7;
const FALLBACK = { dark: 0x2b2825, ink: 0x1c1a17, white: 0xfbfaf5, silver: 0xc7cacc, paper: 0xf4efe6, sakura: 0xd47589 };
const MOUNT_COLOR = 0x4a4b51;

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

function anchorOn(part, local, label, side) {
  const marker = new THREE.Object3D();
  marker.position.copy(local);
  part.add(marker);
  return { object3D: marker, label, side };
}

function disposeAll(group, owned) {
  group.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.isInstancedMesh) o.dispose();
  });
  for (const m of owned) m.dispose();
}

function mergeAndDispose(list) {
  const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
  list.forEach((g) => g.dispose());
  return merged;
}

// Cradle plate on the stem, two posts, a ring, and four elastic spokes reaching the body.
function buildMount() {
  const plate = new THREE.CylinderGeometry(0.3, 0.3, PLATE_H, 32).translate(0, STEM_TOP + PLATE_H / 2, 0);
  const ring = new THREE.TorusGeometry(RING_R, 0.02, 8, 40).rotateX(Math.PI / 2).translate(0, RING_Y, 0);
  const pieces = [plate, ring];
  const postLen = RING_Y - (STEM_TOP + PLATE_H);
  for (const s of [-1, 1]) {
    pieces.push(new THREE.CylinderGeometry(POST_R, POST_R, postLen, 8).translate(s * RING_R, STEM_TOP + PLATE_H + postLen / 2, 0));
  }
  for (let i = 0; i < SPOKE_COUNT; i++) {
    const len = RING_R - BODY_R;
    const spoke = new THREE.BoxGeometry(len, 0.012, 0.012).translate(BODY_R + len / 2, 0, 0).rotateY((i / SPOKE_COUNT) * Math.PI * 2 + Math.PI / 4);
    pieces.push(spoke.translate(0, RING_Y, 0));
  }
  return mergeAndDispose(pieces);
}

function buildGrille() {
  const cage = new THREE.CylinderGeometry(BODY_R, BODY_R, GRILLE_LEN, 24, 1, true).translate(0, GRILLE_LEN / 2, 0);
  const dome = new THREE.SphereGeometry(BODY_R, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, GRILLE_LEN, 0);
  return mergeAndDispose([cage, dome]);
}

export function create(ctx) {
  const kit = makeKit(ctx);
  const group = new THREE.Group();
  group.name = 'mic';
  const parts = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const origin = v(0, 0, 0);
  const bandTop = BODY_Y0 + BODY_LEN + BAND_H;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(BASE_R - 0.04, BASE_R, BASE_H, 40).translate(0, BASE_H / 2, 0), kit.mat('dark'));
  kit.outline(base);
  kit.addPart(group, parts, base, 'stand base', origin, [0, 0.6, 0]);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(STEM_R, STEM_R, STEM_TOP - BASE_H, 16), kit.mat('silver'));
  kit.outline(stem);
  kit.addPart(group, parts, stem, 'stem', v(0, (STEM_TOP + BASE_H) / 2, 0), [0, 0.9, 0]);

  const mount = new THREE.Mesh(buildMount(), kit.mat('ink', MOUNT_COLOR));
  kit.outline(mount);
  const shockMount = kit.addPart(group, parts, mount, 'shock mount', origin, [0, 1.2, 0]);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R, BODY_R, BODY_LEN, 32), kit.mat('dark'));
  kit.outline(body);
  kit.addPart(group, parts, body, 'mic body', v(0, BODY_Y0 + BODY_LEN / 2, 0), [0, 1.5, 0]);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R + 0.01, BODY_R + 0.01, BAND_H, 32), kit.mat('sakura'));
  kit.addPart(group, parts, band, 'grille band', v(0, BODY_Y0 + BODY_LEN + BAND_H / 2, 0), [0, 1.8, 0]);

  const grille = new THREE.Mesh(buildGrille(), kit.mat('silver'));
  kit.outline(grille, GRILLE_LATTICE_DEG);
  kit.addPart(group, parts, grille, 'dynamic mic', v(0, bandTop, 0), [0, 2.1, 0]);

  const toward = v(0.45, 0.55, 0.7).normalize().multiplyScalar(BODY_R);
  const anchors = [
    anchorOn(grille, v(toward.x, GRILLE_LEN + toward.y, toward.z), 'dynamic mic', 'right'),
    anchorOn(shockMount, v(-RING_R, RING_Y + 0.02, 0), 'shock mount', 'left'),
    anchorOn(band, v(-BODY_R - 0.01, 0, 0), 'grille band', 'left'),
    anchorOn(base, v(BASE_R - 0.2, BASE_H, 0.2), 'stand base', 'right'),
  ];

  const explode = kit.exploder(parts);
  const update = (dt, state) => explode(dt, state);
  const onPick = (part) => part?.userData?.label ?? null;

  group.userData.shadowRadius = SHADOW_RADIUS;
  return { group, parts, anchors, update, onPick, dispose: () => disposeAll(group, kit.owned) };
}
