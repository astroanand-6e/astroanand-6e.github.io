// C-arm X-ray machine with an angiogram monitor (units: 1 = 10 cm). No logos or printed marks.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const RING_R = 1.15;
const RING_Y = 1.95;
const RING_START = (50 * Math.PI) / 180;
const RING_ARC = (260 * Math.PI) / 180;
const IMG = 320;
const GRID = 16;
const PATCH = IMG / GRID;
const MASKED_COUNT = Math.round(GRID * GRID * 0.75);
const [CANVAS_W, CANVAS_H, IMG_X] = [480, 320, 80];
const [VESSEL_STEP, VESSEL_MARGIN, VESSEL_SEED, ORDER_SEED] = [8, 14, 4242, 77];
const [MASK_SECONDS, GROW_SECONDS, REPAINT_S] = [0.6, 1.5, 1 / 30];
const [EXPLODE_RATE, SHADOW_RADIUS] = [7, 4.2];
const RIG_YAW = Math.PI / 4 - 0.3;
const [RIG_X, RIG_Z] = [-0.35, 0.4];
const TROLLEY = { x: 2.15, z: -0.3 };
const FALLBACK = { dark: 0x2b2825, white: 0xfbfaf5, silver: 0xc7cacc, paper: 0xf4efe6, sakura: 0xd47589, glass: 0xbcd4da };
const ROLE_ALIAS = { ink: 'dark' };
const INK = { vessel: '#2a2d31', mask: 'rgba(229,139,160,0.88)', hidden: '#0e1013', text: '#c9ccd0' };
const FONT = 'ui-monospace, Menlo, Consolas, monospace';

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

// Shared roles come from ctx.materials properties; explode is owned by ctx.parts when present.
function makeKit(ctx) {
  const owned = [];
  const cache = new Map();
  const mats = ctx && ctx.materials;
  const mark = typeof ctx?.parts?.mark === 'function' ? ctx.parts.mark : null;
  const mat = (name, color) => {
    const role = ROLE_ALIAS[name] ?? name;
    const base = mats?.[role] ?? null;
    if (base && color === undefined) return base;
    if (!base && color === undefined && cache.has(role)) return cache.get(role);
    const m = base?.clone ? base.clone() : new THREE.MeshToonMaterial();
    m.color?.set(color ?? FALLBACK[role] ?? 0xffffff);
    if (role === 'glass' && !base) Object.assign(m, { transparent: true, opacity: 0.42, depthWrite: false });
    owned.push(m);
    if (!base && color === undefined) cache.set(role, m);
    return m;
  };
  const basic = (params) => {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false, ...params });
    owned.push(m);
    return m;
  };
  const outline = (mesh) => {
    if (typeof mats?.makeOutline === 'function') mats.makeOutline(mesh);
    return mesh;
  };
  const addPart = (parent, parts, obj, label, pos, explode) => {
    obj.position.copy(pos);
    const offset = typeof explode === 'number' ? [0, explode, 0] : explode.toArray();
    if (mark) {
      mark(obj, { explode: offset, label });
    } else {
      obj.userData.home = obj.position.clone();
      obj.userData.explode = new THREE.Vector3(...offset);
      obj.userData.label = label;
    }
    parent.add(obj);
    parts.push(obj);
    return obj;
  };
  const exploder = (parts) => (mark ? () => {} : makeExploder(parts));
  return { owned, mat, basic, outline, addPart, exploder };
}

function anchorOn(part, local, label, side) {
  const marker = new THREE.Object3D();
  marker.position.copy(local);
  part.add(marker);
  return { object3D: marker, label, side };
}

function disposeAll(group, owned) {
  group.traverse((o) => o.geometry?.dispose?.());
  for (const m of owned) m.dispose();
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Branching coronary-like tree in image pixels; every point carries its path distance d from the root.
function growVessels(rand) {
  const branches = [];
  const grow = (x, y, angle, steps, width, d0, depth) => {
    const pts = [{ x, y, d: d0 }];
    let [cx, cy, a, d] = [x, y, angle, d0];
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.45;
      [cx, cy, d] = [cx + Math.cos(a) * VESSEL_STEP, cy + Math.sin(a) * VESSEL_STEP, d + VESSEL_STEP];
      if (cx < VESSEL_MARGIN || cx > IMG - VESSEL_MARGIN || cy < VESSEL_MARGIN || cy > IMG - 2) break;
      pts.push({ x: cx, y: cy, d });
    }
    branches.push({ pts, width });
    if (depth === 0 || pts.length < 3) return;
    for (const frac of [0.4, 0.7, 1]) {
      if (frac === 0.7 && rand() < 0.5) continue;
      const p = pts[Math.floor(frac * (pts.length - 1))];
      const side = rand() < 0.5 ? -1 : 1;
      grow(p.x, p.y, a + side * (0.45 + rand() * 0.5), Math.round(steps * 0.72), width * 0.66, p.d, depth - 1);
    }
  };
  grow(IMG / 2 - 14, IMG - 4, -Math.PI / 2 - 0.3, 18, 10, 0, 3);
  grow(IMG / 2 + 14, IMG - 4, -Math.PI / 2 + 0.4, 17, 9, 0, 3);
  return { branches, maxD: Math.max(...branches.flatMap((b) => b.pts.map((p) => p.d))) };
}

function strokeBranch(g, pts, front) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    if (a.d >= front) break;
    const f = Math.min(1, (front - a.d) / (b.d - a.d));
    g.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
    if (f < 1) break;
  }
  g.stroke();
}

// Flat C-shaped band (arc cross-section extruded) so its edges take the hairline outline.
function buildRingBand() {
  const [outer, inner, a0, a1] = [RING_R + 0.13, RING_R - 0.13, RING_START, RING_START + RING_ARC];
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, a0, a1, false);
  shape.absarc(0, 0, inner, a1, a0, true);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: false, curveSegments: 56 });
  return geo.translate(0, 0, -0.18);
}

function paintBase(g, tree, rand) {
  const bg = g.createRadialGradient(IMG / 2, IMG / 2, 20, IMG / 2, IMG / 2, IMG * 0.7);
  bg.addColorStop(0, '#c4c7c9');
  bg.addColorStop(1, '#7e8286');
  g.fillStyle = bg;
  g.fillRect(0, 0, IMG, IMG);
  g.fillStyle = 'rgba(40,44,48,0.12)';
  for (let i = 0; i < 5; i++) g.fillRect(40 + i * 56, 0, 18, IMG);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
    g.fillRect(rand() * IMG, rand() * IMG, 2, 2);
  }
  g.strokeStyle = INK.vessel;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const { pts, width } of tree.branches) {
    g.lineWidth = width;
    strokeBranch(g, pts, Infinity);
  }
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(IMG / 2, IMG / 2, IMG / 2 - 2, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
}

function paintScreen(g, base, tree, rank, maskK, growK) {
  g.fillStyle = '#07080a';
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
  g.drawImage(base, IMG_X, 0);
  g.save();
  g.translate(IMG_X, 0);
  g.strokeStyle = INK.mask;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const front = growK * (tree.maxD + VESSEL_STEP);
  if (growK > 0) {
    for (const { pts, width } of tree.branches) {
      g.lineWidth = width + 1.5;
      strokeBranch(g, pts, front);
    }
  }
  const hidden = Math.round(maskK * MASKED_COUNT);
  if (hidden > 0) {
    g.fillStyle = INK.hidden;
    for (let i = 0; i < rank.length; i++) {
      if (rank[i] < hidden) g.fillRect((i % GRID) * PATCH, Math.floor(i / GRID) * PATCH, PATCH, PATCH);
    }
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k <= GRID; k++) {
      g.rect(k * PATCH, 0, 0, IMG);
      g.rect(0, k * PATCH, IMG, 0);
    }
    g.stroke();
  }
  g.restore();
  g.fillStyle = INK.text;
  g.font = `600 14px ${FONT}`;
  g.textAlign = 'left';
  if (maskK > 0) g.fillText('MAE', 12, 28);
  if (growK > 0) g.fillText('SEG', CANVAS_W - 52, 28);
}

export function create(ctx) {
  const kit = makeKit(ctx);
  const group = new THREE.Group();
  group.name = 'c-arm';
  const rig = new THREE.Group();
  rig.position.set(RIG_X, 0, RIG_Z);
  rig.rotation.y = RIG_YAW;
  group.add(rig);
  const parts = [];
  const anchors = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const rbox = (w, h, d, r, material) => kit.outline(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material));
  const cyl = (r0, r1, h, material, seg = 24) => kit.outline(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), material));
  const at = (obj, x, y, z) => {
    obj.position.set(x, y, z);
    return obj;
  };
  const casters = (w, d, y, material) => {
    const geo = new THREE.CylinderGeometry(0.09, 0.09, 0.07, 14).rotateX(Math.PI / 2);
    const wheels = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheels.push(at(new THREE.Mesh(geo, material), (sx * w) / 2, y, (sz * d) / 2));
    return wheels;
  };

  const cart = new THREE.Group();
  cart.add(at(rbox(1.1, 0.4, 1.3, 0.06, kit.mat('white')), 0, 0.38, 0), ...casters(0.8, 1.1, 0.09, kit.mat('ink')));
  kit.addPart(rig, parts, cart, 'cart', v(-1.75, 0, 0), 0);
  const column = rbox(0.5, 1.9, 0.45, 0.06, kit.mat('white'));
  column.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.02), kit.mat('ink')), 0, 0.3, 0.23));
  kit.addPart(rig, parts, column, 'column', v(-1.75, 1.53, 0), 0.6);

  const ring = new THREE.Group();
  const band = kit.outline(new THREE.Mesh(buildRingBand(), kit.mat('white')));
  ring.add(band, at(rbox(0.36, 0.3, 0.4, 0.04, kit.mat('silver')), -1.33, 0, 0), at(rbox(0.3, 0.9, 0.46, 0.05, kit.mat('ink')), -RING_R, 0, 0));
  kit.addPart(rig, parts, ring, 'c-arm', v(0, RING_Y, 0), 2.0);

  const source = new THREE.Group();
  source.add(cyl(0.3, 0.3, 0.55, kit.mat('white'), 28), at(cyl(0.22, 0.28, 0.14, kit.mat('silver'), 28), 0, 0.35, 0));
  const beamMat = kit.mat('glass', 0xe58ba0);
  beamMat.opacity = 0.22;
  beamMat.side = THREE.DoubleSide;
  source.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.17, 28, 1, true).rotateX(Math.PI), beamMat), 0, 1.0, 0));
  kit.addPart(rig, parts, source, 'x-ray source', v(0, 1.1, 0), 0.5);

  const detector = new THREE.Group();
  detector.add(rbox(0.95, 0.3, 0.95, 0.05, kit.mat('white')), at(cyl(0.18, 0.18, 0.2, kit.mat('silver')), 0, 0.25, 0));
  detector.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.012, 0.78), kit.mat('ink')), 0, -0.152, 0));
  kit.addPart(rig, parts, detector, 'detector', v(0, 2.8, 0), 3.0);

  const table = new THREE.Group();
  table.add(rbox(0.95, 0.12, 3.6, 0.04, kit.mat('white')), at(rbox(0.82, 0.07, 3.2, 0.03, kit.mat('paper')), 0, 0.095, 0));
  kit.addPart(rig, parts, table, 'patient table', v(0, 1.74, -1.1), 1.2);
  const tableBase = new THREE.Group();
  tableBase.add(at(rbox(1.5, 0.12, 0.9, 0.04, kit.mat('ink')), 0, 0.06, 0), at(cyl(0.2, 0.24, 1.5, kit.mat('silver')), 0, 0.87, 0));
  kit.addPart(rig, parts, tableBase, 'table base', v(0, 0, -2.3), 0);

  const trolleyRig = new THREE.Group();
  trolleyRig.position.set(TROLLEY.x, 0, TROLLEY.z);
  rig.add(trolleyRig);
  const trolley = new THREE.Group();
  trolley.add(at(rbox(1.0, 0.12, 0.9, 0.03, kit.mat('ink')), 0, 0.2, 0), ...casters(0.7, 0.6, 0.09, kit.mat('ink')));
  trolley.add(at(cyl(0.09, 0.09, 1.5, kit.mat('silver'), 16), 0, 0.96, -0.28));
  kit.addPart(trolleyRig, parts, trolley, 'trolley', v(0, 0, 0), 0);

  const encoder = new THREE.Group();
  const slabGeo = new RoundedBoxGeometry(0.8, 0.1, 0.5, 2, 0.02);
  for (let i = 0; i < 4; i++) encoder.add(kit.outline(at(new THREE.Mesh(slabGeo, kit.mat(i === 3 ? 'sakura' : 'white')), 0, i * 0.14, 0)));
  const tokenGeos = [];
  for (let i = 0; i < 16; i++) tokenGeos.push(new THREE.BoxGeometry(0.1, 0.05, 0.1).translate(((i % 4) - 1.5) * 0.15, 0.4, (Math.floor(i / 4) - 1.5) * 0.1));
  const tokens = mergeGeometries(tokenGeos);
  tokenGeos.forEach((geo) => geo.dispose());
  encoder.add(new THREE.Mesh(tokens, kit.mat('ink')));
  kit.addPart(trolleyRig, parts, encoder, 'vit encoder', v(0, 0.35, 0.18), 1.0);

  const monitor = rbox(1.75, 1.25, 0.2, 0.07, kit.mat('white'));
  kit.addPart(trolleyRig, parts, monitor, 'monitor', v(0, 2.2, -0.1), 1.9);

  const rand = mulberry32(VESSEL_SEED);
  const tree = growVessels(rand);
  const rank = new Array(GRID * GRID);
  const order = Array.from(rank.keys());
  const orderRand = mulberry32(ORDER_SEED);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(orderRand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((patch, i) => { rank[patch] = i; });

  const canvas = Object.assign(document.createElement('canvas'), { width: CANVAS_W, height: CANVAS_H });
  const base = Object.assign(document.createElement('canvas'), { width: IMG, height: IMG });
  const g2d = canvas.getContext('2d');
  const gBase = base.getContext('2d');
  if (gBase) paintBase(gBase, tree, rand);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Group();
  screen.add(rbox(1.62, 1.12, 0.04, 0.04, kit.mat('ink')));
  screen.add(at(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), kit.basic({ map: texture })), 0, 0, 0.022));
  kit.addPart(trolleyRig, parts, screen, 'masked patches', v(0, 2.2, 0.03), v(0, 2.7, 0.6));

  const sample = tree.branches[0].pts[Math.min(6, tree.branches[0].pts.length - 1)];
  const toPlane = (px, py) => v(((IMG_X + px) / CANVAS_W - 0.5) * 1.5, (0.5 - py / CANVAS_H) * 1.0, 0.04);
  anchors.push(anchorOn(source, v(0, 0, 0.3), 'x-ray source', 'left'));
  anchors.push(anchorOn(detector, v(0.2, 0, 0.48), 'detector', 'right'));
  anchors.push(anchorOn(table, v(0, 0.14, 1.1), 'patient table', 'left'));
  anchors.push(anchorOn(encoder, v(0.4, 0.2, 0.26), 'vit encoder', 'right'));
  anchors.push(anchorOn(screen, toPlane(4 * PATCH + 10, 3 * PATCH + 10), 'masked patches', 'left'));
  anchors.push(anchorOn(screen, toPlane(sample.x, sample.y), 'vessel mask', 'right'));

  let [maskK, growK, sinceRepaint] = [0, 0, 0];
  let [isGrowing, isDirty, isReduced, lastGrow] = [false, true, false, undefined];
  const repaint = () => {
    if (g2d && gBase) paintScreen(g2d, base, tree, rank, maskK, growK);
    texture.needsUpdate = true;
    [sinceRepaint, isDirty] = [0, false];
  };
  repaint();

  const explode = kit.exploder(parts);
  const startGrow = (value) => {
    const isOff = value === false || value === 0 || value === 'off' || value === 'reset';
    [growK, isGrowing, isDirty] = [isOff || !isReduced ? 0 : 1, !isOff && !isReduced, true];
  };

  function update(dt, state) {
    const reduced = Boolean(state?.reducedMotion);
    isReduced = reduced;
    const wantMask = state?.controls?.['vision-mae'] === 'mask' ? 1 : 0;
    const grow = state?.controls?.['vision-grow'];
    if (state?.lastControl?.action === 'vision-grow' || grow !== lastGrow) {
      lastGrow = grow;
      if (grow !== undefined) startGrow(grow);
    }
    if (maskK !== wantMask) {
      maskK = reduced ? wantMask : Math.min(1, Math.max(0, maskK + Math.sign(wantMask - maskK) * (dt / MASK_SECONDS)));
      if (Math.abs(wantMask - maskK) < 1e-4) maskK = wantMask;
      isDirty = true;
    }
    if (isGrowing) {
      growK = Math.min(1, growK + dt / GROW_SECONDS);
      if (growK >= 1) isGrowing = false;
      isDirty = true;
    }
    sinceRepaint += dt;
    if (isDirty && (reduced || sinceRepaint >= REPAINT_S)) repaint();
    explode(dt, state);
  }

  function onPick(part) {
    const label = part?.userData?.label ?? null;
    if (label === 'masked patches' || label === 'detector') startGrow(true);
    return label;
  }

  function dispose() {
    texture.dispose();
    disposeAll(group, kit.owned);
  }

  group.userData.shadowRadius = SHADOW_RADIUS;
  return { group, parts, anchors, update, onPick, dispose };
}
