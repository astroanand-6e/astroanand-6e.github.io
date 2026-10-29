// MacBook Pro 14 (M5 Pro, Silver) figure (units: 1 = 10 cm). Screen alternates a generic game library and code.
// Deck layout is measured from Apple's top-down keyboard and port diagrams (apple.com/macbook-pro/specs).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE_W = 3.126;
const BASE_D = 2.212;
const BASE_H = 0.095;
const FOOT_H = 0.006;
const LID_T = 0.058;
const BEVEL = 0.018;
const CORNER = 0.12;
const CREASE = 0.7;
const OPEN_ANGLE = (105 * Math.PI) / 180;
const HINGE = { r: 0.04, len: 2.4, y: BASE_H + 0.022, z: -BASE_D / 2 + 0.035 };
const WELL = { w: 2.79, d: 1.14, z: -0.366, r: 0.05, depth: 0.016 };
const PAD = { w: 1.3, d: 0.82, z: 0.64, r: 0.06, h: 0.008 };
const KEY = { pitch: 0.19, row: 0.184, gap: 0.024, depth: 0.164, arrowGap: 0.012, h: 0.03, y: BASE_H + 0.001, touchId: 13 };
const GRILLE = { cols: 4, rows: 36, pitch: 0.03, x: BASE_W / 2 - 0.085, span: 1.06, dot: 0.0095 };
const PORT_Y = (FOOT_H + BASE_H) / 2 + 0.004;
// [side, z, width along the edge, height]: MagSafe, 2 Thunderbolt, jack (left) | HDMI, Thunderbolt, SD (right).
const PORTS = [
  [-1, -0.816, 0.17, 0.026], [-1, -0.626, 0.085, 0.026], [-1, -0.476, 0.085, 0.026], [-1, -0.346, 0.04, 0.04],
  [1, -0.816, 0.15, 0.05], [1, -0.626, 0.085, 0.026], [1, -0.376, 0.27, 0.03]];
const ones = (n) => Array(n).fill(1);
// Key widths in units; 'ud' is the half-height up/down arrow pair. 78 keys in all, as on the ANSI model.
const KEY_ROWS = [
  [1.5, ...ones(12), 1],
  [...ones(13), 1.5],
  [1.5, ...ones(12), 1],
  [1.75, ...ones(11), 1.75],
  [2.25, ...ones(10), 2.25],
  [1, 1, 1, 1.25, 5, 1.25, 1, 1, 'ud', 1],
];
// [body, trackpad]; both themes light warm (ink adds a pink rim), so the base tints are pre-cooled to render as neutral silver.
const SILVER = { paper: [0xd5dce6, 0xdfe5ef], ink: [0x98aab0, 0xb0c4cc] };
const KEY_BLACK = 0x2b2c31;
const WELL_BLACK = 0x0b0c0e;
const HINGE_GREY = 0x45474b;
const BEZEL_COLOR = 0x0b0b0d;
const BEZEL_CSS = '#0b0b0d';
const GLASS = { inset: 0.05, r: 0.1 };
const SCREEN = { w: 3.025, h: 1.965, gap: 0.065, cornerPx: 12 };
const CANVAS_W = 512;
const CANVAS_H = 332;
const SWAP_SECONDS = 4;
const SHADOW_RADIUS = 2.4;
const EXPLODE_RATE = 7;
const FALLBACK = { dark: 0x2b2825, ink: 0x1c1a17, white: 0xfbfaf5, silver: 0xc7cacc, paper: 0xf4efe6, sakura: 0xd47589 };
const TILE_COLORS = ['#e4637c', '#f2a65a', '#6bbf8a', '#5aa9e6', '#9b7fe6', '#e8d36a', '#4fc3c3', '#d9777f'];
const CODE_LINES = [
  [['def ', '#e4637c'], ['train', '#6bbf8a'], ['(model, loader):', '#d6d6d6']],
  [['    for ', '#e4637c'], ['x, y ', '#d6d6d6'], ['in ', '#e4637c'], ['loader:', '#d6d6d6']],
  [['        loss = ', '#d6d6d6'], ['criterion', '#5aa9e6'], ['(model(x), y)', '#d6d6d6']],
  [['        loss.', '#d6d6d6'], ['backward', '#5aa9e6'], ['()', '#d6d6d6']],
  [['        opt.', '#d6d6d6'], ['step', '#5aa9e6'], ['()', '#d6d6d6']],
  [['    ', '#d6d6d6'], ['# encode, listen, decode', '#7a7f8a']],
  [['    return ', '#e4637c'], ['model', '#d6d6d6']],
  [['', '#d6d6d6']],
  [['class ', '#e4637c'], ['Probe', '#f2a65a'], ['(nn.Module):', '#d6d6d6']],
  [['    def ', '#e4637c'], ['forward', '#6bbf8a'], ['(self, h):', '#d6d6d6']],
  [['        return ', '#e4637c'], ['self.head(h.mean(1))', '#d6d6d6']],
];

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
  const tag = mark ?? ((o, { explode, label }) => Object.assign(o.userData, { home: o.position.clone(), explode: new THREE.Vector3(...explode), label }));
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
    mats?.makeOutline?.(mesh, deg);
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
    tag(obj, { explode, label });
    parent.add(obj);
    parts.push(obj);
    return obj;
  };
  const exploder = (parts) => (mark ? () => {} : makeExploder(parts));
  return { owned, mat, outline, lines, addPart, exploder };
}

function anchorOn(part, local, label, side) {
  const object3D = new THREE.Object3D();
  object3D.position.copy(local);
  part.add(object3D);
  return { object3D, label, side };
}

function disposeAll(group, owned) {
  group.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.isInstancedMesh) o.dispose();
  });
  for (const m of owned) m.dispose();
}

// Rounded rectangle in the XY plane, centred on x = 0 and y = cy (consecutive arcs join themselves).
function roundedRect(w, d, r, cy = 0) {
  const [x, y] = [w / 2 - r, d / 2 - r];
  const shape = new THREE.Shape();
  [[x, cy + y], [-x, cy + y], [-x, cy - y], [x, cy - y]].forEach(([cx, cz], i) => {
    shape.absarc(cx, cz, r, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2, false);
  });
  return shape;
}

// Flat slab on y in [0, h] with a 45-degree chamfer, so outlines trace the bevel. An optional well is
// cut clean through; the bevel pinches holes, so it is cut one bevel larger to land on size.
function slab(w, h, d, radius, bevel, well) {
  const shape = roundedRect(w - 2 * bevel, d - 2 * bevel, Math.max(radius - bevel, 0.01));
  if (well) shape.holes.push(roundedRect(well.w + 2 * bevel, well.d + 2 * bevel, well.r + bevel, -well.z));
  const opts = { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 };
  const raw = new THREE.ExtrudeGeometry(shape, opts);
  raw.rotateX(-Math.PI / 2).translate(0, bevel, 0);
  const smooth = toCreasedNormals(raw, CREASE);
  raw.dispose();
  return smooth;
}

function mergeAndDispose(list) {
  const merged = mergeGeometries(list);
  list.forEach((g) => g.dispose());
  return merged;
}

function fillRound(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

function drawMenuBar(g, color) {
  g.fillStyle = color;
  g.fillRect(0, 0, CANVAS_W, 22);
  g.fillStyle = BEZEL_CSS;
  fillRound(g, CANVAS_W / 2 - 36, -8, 72, 22, 8);
}

function drawLibrary(g) {
  g.fillStyle = '#161923';
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawMenuBar(g, '#232733');
  g.fillStyle = '#2b3040';
  fillRound(g, 16, 36, 150, 16, 8);
  const [cols, tileW, tileH, gap] = [4, 108, 104, 16];
  const x0 = (CANVAS_W - (cols * tileW + (cols - 1) * gap)) / 2;
  for (let i = 0; i < cols * 2; i++) {
    const x = x0 + (i % cols) * (tileW + gap);
    const y = 66 + Math.floor(i / cols) * (tileH + 40);
    g.fillStyle = TILE_COLORS[i % TILE_COLORS.length];
    fillRound(g, x, y, tileW, tileH, 10);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    fillRound(g, x + 14, y + tileH * 0.58, tileW * 0.5, 10, 5);
    g.fillStyle = '#4a5064';
    fillRound(g, x, y + tileH + 9, tileW * 0.8, 8, 4);
  }
}

function drawCode(g) {
  g.fillStyle = '#12141b';
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawMenuBar(g, '#1f222c');
  g.font = '17px monospace';
  g.textBaseline = 'top';
  CODE_LINES.forEach((segments, row) => {
    let x = 22;
    for (const [text, color] of segments) {
      g.fillStyle = color;
      g.fillText(text, x, 44 + row * 24);
      x += g.measureText(text).width;
    }
  });
}

// 78 keys as {x, z, w, d}, centred in the well. Row 0 is the full-height function row.
function layoutKeys() {
  const keys = [];
  KEY_ROWS.forEach((row, r) => {
    const z = WELL.z + (r - (KEY_ROWS.length - 1) / 2) * KEY.row;
    let cursor = 0;
    for (const u of row) {
      const span = u === 'ud' ? 1 : u;
      const x = (cursor + span / 2 - 7.25) * KEY.pitch;
      const w = span * KEY.pitch - KEY.gap;
      cursor += span;
      if (u !== 'ud') keys.push({ x, z, w, d: KEY.depth });
      else for (const s of [-1, 1]) keys.push({ x, z: z + (s * (KEY.depth + KEY.arrowGap)) / 4, w, d: (KEY.depth - KEY.arrowGap) / 2 });
    }
  });
  return keys;
}

// All keys are one InstancedMesh (a unit rounded box scaled per key); outlines are one merged line set.
function buildKeys(kit, group) {
  const layout = layoutKeys();
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.12), kit.mat('dark', KEY_BLACK), layout.length);
  const edgeBase = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const edges = layout.map((k, i) => {
    m.compose(new THREE.Vector3(k.x, KEY.y, k.z), q, new THREE.Vector3(k.w, KEY.h, k.d));
    keys.setMatrixAt(i, m);
    return edgeBase.clone().applyMatrix4(m);
  });
  const touch = layout[KEY.touchId];
  const ring = new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.05, 0.05, 0.002, 20), 1);
  edges.push(ring.translate(touch.x, KEY.y + KEY.h / 2, touch.z));
  keys.instanceMatrix.needsUpdate = true;
  keys.frustumCulled = false;
  group.add(keys);
  edgeBase.dispose();
  const merged = mergeAndDispose(edges);
  const line = kit.lines(merged);
  if (line) group.add(line);
  else merged.dispose();
  return group;
}

// Speaker grilles: staggered perforations in a tall strip either side of the keyboard.
function buildGrille(material) {
  const { cols, rows, pitch, x, span, dot } = GRILLE;
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(dot, 6).rotateX(-Math.PI / 2), material, 2 * cols * rows);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 2 * cols * rows; i++) {
    const [side, c, r] = [i < cols * rows ? -1 : 1, i % cols, Math.floor((i % (cols * rows)) / cols)];
    const dx = (c - (cols - 1) / 2) * pitch + ((r % 2) - 0.5) * (pitch / 2);
    mesh.setMatrixAt(i, m.makeTranslation(side * x + dx, BASE_H + 0.002, WELL.z + (r / (rows - 1) - 0.5) * span));
  }
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return mesh;
}

// One black mesh for the well floor, rubber feet and port insets.
function detailGeometry() {
  const floor = new THREE.ShapeGeometry(roundedRect(WELL.w + 0.04, WELL.d + 0.04, WELL.r, -WELL.z), 6);
  const list = [floor.rotateX(-Math.PI / 2).translate(0, BASE_H - WELL.depth + 0.001, 0)];
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) list.push(new THREE.CylinderGeometry(0.075, 0.075, FOOT_H, 14).translate(sx * 1.28, FOOT_H / 2, sz * 0.82));
  for (const [side, z, w, h] of PORTS) list.push(new THREE.BoxGeometry(0.008, h, w).translate((side * BASE_W) / 2, PORT_Y, z));
  return mergeAndDispose(list);
}

// Lid-space geometry: y is the lid normal (screen side is -y), z runs up the lid from the hinge.
function addLid(kit, group, parts, silver, screenMat) {
  const lidPart = (geometry, material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -OPEN_ANGLE;
    return mesh;
  };
  const hinge = new THREE.Vector3(0, HINGE.y, HINGE.z);
  const front = -LID_T / 2;
  const shellGeo = slab(BASE_W, LID_T, BASE_D, CORNER, BEVEL).translate(0, -LID_T / 2, BASE_D / 2);
  const glass = roundedRect(BASE_W - 2 * GLASS.inset, BASE_D - 2 * GLASS.inset, GLASS.r);
  const glassGeo = new THREE.ShapeGeometry(glass, 8).rotateX(Math.PI / 2).translate(0, front - 0.003, BASE_D / 2);
  const screenZ = BASE_D - SCREEN.gap - SCREEN.h / 2;
  const screenGeo = new THREE.PlaneGeometry(SCREEN.w, SCREEN.h).rotateX(Math.PI / 2).translate(0, front - 0.0065, screenZ);
  kit.addPart(group, parts, kit.outline(lidPart(shellGeo, silver)), 'lid', hinge, [0, 1.6, 0]);
  kit.addPart(group, parts, lidPart(glassGeo, kit.mat('dark', BEZEL_COLOR)), 'bezel', hinge, [0, 2.0, 0]);
  const screen = kit.addPart(group, parts, lidPart(screenGeo, screenMat), 'game library / code', hinge, [0, 2.4, 0]);
  return { screen, screenZ };
}

function addBase(kit, group, parts, silver, padSilver) {
  const origin = new THREE.Vector3();
  const black = kit.mat('dark', WELL_BLACK);
  const body = slab(BASE_W, BASE_H - FOOT_H, BASE_D, CORNER, BEVEL, WELL).translate(0, FOOT_H, 0);
  const chassis = kit.outline(new THREE.Mesh(body, silver));
  chassis.add(new THREE.Mesh(detailGeometry(), black), buildGrille(black));
  kit.addPart(group, parts, chassis, 'm5 pro · 14 in', origin, [0, 0.4, 0]);

  const keys = kit.addPart(group, parts, buildKeys(kit, new THREE.Group()), 'keyboard', origin, [0, 1.2, 0]);
  const padGeo = slab(PAD.w, PAD.h, PAD.d, PAD.r, 0.002).translate(0, BASE_H + 0.002 - PAD.h, 0);
  const pad = kit.outline(new THREE.Mesh(padGeo, padSilver));
  const trackpad = kit.addPart(group, parts, pad, 'trackpad', new THREE.Vector3(0, 0, PAD.z), [0, 0.8, 0]);

  const barrelGeo = new THREE.CylinderGeometry(HINGE.r, HINGE.r, HINGE.len, 20).rotateZ(Math.PI / 2);
  const barrel = kit.outline(new THREE.Mesh(barrelGeo, kit.mat('dark', HINGE_GREY)));
  const hinge = kit.addPart(group, parts, barrel, 'hinge', new THREE.Vector3(0, HINGE.y, HINGE.z), [0, 0.6, 0]);
  return { chassis, keys, trackpad, hinge };
}

export function create(ctx) {
  const kit = makeKit(ctx);
  const group = new THREE.Group();
  group.name = 'macbook';
  const parts = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const g2d = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Unlit material: the screen keeps its full brightness, so it glows against the ink theme.
  const screenMat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  kit.owned.push(screenMat);

  // Anodised aluminium on the real finish's cool grey; the two silvers follow the theme.
  const silver = kit.mat('silver', SILVER.paper[0]);
  const padSilver = kit.mat('silver', SILVER.paper[1]);
  let theme = null;
  const themeOf = (state) => ((ctx?.materials?.theme ?? state?.theme) === 'ink' ? 'ink' : 'paper');
  function applyTheme(next) {
    theme = next;
    silver.color.setHex(SILVER[next][0]);
    padSilver.color.setHex(SILVER[next][1]);
  }
  applyTheme(themeOf());

  const base = addBase(kit, group, parts, silver, padSilver);
  const lid = addLid(kit, group, parts, silver, screenMat);
  const screenY = -LID_T / 2 - 0.009;

  const anchors = [
    anchorOn(base.chassis, v(-1.0, BASE_H + 0.004, 0.7), 'm5 pro · 14 in', 'left'),
    anchorOn(lid.screen, v(-0.7, screenY, lid.screenZ + 0.25), 'game library / code', 'left'),
    anchorOn(base.keys, v(0.9, KEY.y + KEY.h / 2, WELL.z), 'keyboard', 'right'),
    anchorOn(base.trackpad, v(0.4, BASE_H + 0.004, 0), 'trackpad', 'right'),
    anchorOn(base.hinge, v(-1.0, HINGE.r, 0), 'hinge', 'left'),
  ];

  let clock = 0;
  let mode = -1;
  // The display is clipped to its rounded top corners; the cut-away pixels stay transparent, so they read black.
  function paint(next) {
    if (g2d) {
      g2d.save();
      g2d.beginPath();
      g2d.roundRect(0, 0, CANVAS_W, CANVAS_H, [SCREEN.cornerPx, SCREEN.cornerPx, 0, 0]);
      g2d.clip();
      (next === 0 ? drawLibrary : drawCode)(g2d);
      g2d.restore();
    }
    texture.needsUpdate = true;
    mode = next;
  }
  paint(0);

  const explode = kit.exploder(parts);

  function update(dt, state) {
    if (!state?.reducedMotion) clock += dt;
    const next = Math.floor(clock / SWAP_SECONDS) % 2;
    if (next !== mode) paint(next);
    const nextTheme = themeOf(state);
    if (nextTheme !== theme) applyTheme(nextTheme);
    explode(dt, state);
  }

  function onPick(part) {
    if (part?.userData?.label === 'game library / code') clock = (Math.floor(clock / SWAP_SECONDS) + 1) * SWAP_SECONDS;
    return part?.userData?.label ?? null;
  }

  function dispose() {
    texture.dispose();
    disposeAll(group, kit.owned);
  }

  group.userData.shadowRadius = SHADOW_RADIUS;
  return { group, parts, anchors, update, onPick, dispose };
}
