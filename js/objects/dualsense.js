// Gamepad figure: sky-blue shell fading to glossy black at the back (units: 1 = 10 cm).
// Plain round buttons only: no logos, no face-button symbols.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const SHELL_H = 0.46;
const TOP = SHELL_H;
const BEVEL = 0.03;
const CREASE = 0.35;
const OUTLINE_STEPS = 220;
const FADE_FROM = -0.3; // fully black behind this z
const FADE_TO = 0.02; // fully blue in front of it
const FADE_CUTS = 12;
const COLORS = { blue: 0x56b3d3, black: 0x1b1e24, key: 0x08090b, frame: 0x4b4f57, ps: 0x93d6ee, mute: 0x8c939a, glow: 0x7fd3f0 };
const PAD = { z: -0.285, w: 0.68, d: 0.3, frame: 0.014, frameH: 0.022, faceH: 0.012 };
const BAR = { x: 0.375, w: 0.022, h: 0.012, len: 0.27 };
const STICK = { x: 0.28, z: 0, segments: 128, ridges: 32, ridgeDepth: 0.022, ridgeFrom: 0.09 };
const STICK_PROFILE = [[0, 0], [0.115, 0], [0.115, 0.03], [0.105, 0.052], [0.095, 0.062], [0.075, 0.056], [0.04, 0.047], [0, 0.044]];
const CLUSTER = { x: 0.51, z: -0.25 };
const ARM = { w: 0.092, len: 0.098, gap: 0.022, cut: 0.03, h: 0.034 };
const FACE = { radius: 0.06, offset: 0.112, h: 0.03 };
const DETAILS_Z = -0.17;
const DOTS = { rows: [-0.088, -0.06], count: 6, radius: 0.009, gap: 0.028 };
const GLOW_SPEED = 2;
const GLOW_STILL = 0.9;
const SHADOW_RADIUS = 1.4;
const EXPLODE_RATE = 7;
// Part lifts (y only) so each layer rises straight up: shell, light bar, touchpad, sticks, buttons.
const LIFT = { shell: 0.5, bar: 0.9, pad: 1.25, stick: 1.6, buttons: 1.95 };

// Right half of the top-view outline (x, z) from back-centre round to the grip notch; the left half mirrors it.
const OUTLINE = [
  [0, -0.5], [0.22, -0.5], [0.36, -0.495], [0.48, -0.47], [0.615, -0.42], [0.73, -0.29], [0.785, -0.12], [0.8, 0.106],
  [0.79, 0.296], [0.75, 0.46], [0.7, 0.55], [0.645, 0.6], [0.595, 0.615], [0.55, 0.595], [0.52, 0.54], [0.49, 0.44], [0.43, 0.32],
  [0.345, 0.235], [0.18, 0.2], [0, 0.19],
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

// Shared outline helper comes from ctx.materials; explode is owned by ctx.parts when present.
function makeKit(ctx) {
  const owned = [];
  const mats = ctx?.materials;
  const mark = typeof ctx?.parts?.mark === 'function' ? ctx.parts.mark : null;
  // Own toon clone: every hue is baked into vertex colors, so theme swaps leave the pad alone.
  const paintedMaterial = () => {
    const m = mats?.white?.clone ? mats.white.clone() : new THREE.MeshToonMaterial();
    m.color.set(0xffffff);
    m.vertexColors = true;
    owned.push(m);
    return m;
  };
  // Meshes get the shared hairline outline; pass `edges` to supply the line geometry yourself.
  const mesh = (geometry, material, deg, edges) => {
    const m = new THREE.Mesh(geometry, material);
    if (edges && mats?.line) {
      const line = new THREE.LineSegments(edges, mats.line);
      line.raycast = () => {};
      line.userData.isOutline = true;
      line.matrixAutoUpdate = false;
      m.add(line);
    } else if (typeof mats?.makeOutline === 'function') {
      mats.makeOutline(m, deg);
    }
    return m;
  };
  const addPart = (parent, parts, obj, label, pos, lift) => {
    obj.position.copy(pos);
    const offset = [0, lift, 0];
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
  return { owned, paintedMaterial, mesh, addPart, exploder };
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

function mergeAndDispose(list) {
  const merged = mergeGeometries(list);
  list.forEach((g) => g.dispose());
  if (!merged) throw new Error('dualsense: geometry attributes do not match');
  return merged;
}

// Bakes one flat vertex color into a geometry.
function paint(geometry, hex) {
  const color = new THREE.Color(hex);
  const data = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) color.toArray(data, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geometry;
}

// Extrudes a plan-view shape (shape y = -z) upward over y in [0, h]; the cap is inset by the bevel.
function extrudeUp(shape, h, bevel, segments = 1) {
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: h - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: segments,
    curveSegments: 10,
  });
  return raw.rotateX(-Math.PI / 2).translate(0, bevel, 0);
}

// Splits every triangle (flat xyz list) along the plane z = level, so vertex colors can follow a gradient.
function sliceZ(pos, level) {
  const out = [];
  const cut = (a, b) => {
    const t = (level - a[2]) / (b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, level];
  };
  for (let i = 0; i < pos.length; i += 9) {
    const v = [0, 3, 6].map((o) => [pos[i + o], pos[i + o + 1], pos[i + o + 2]]);
    const above = v.map((p) => p[2] > level);
    const count = above.filter(Boolean).length;
    if (count === 0 || count === 3) {
      out.push(...pos.slice(i, i + 9));
      continue;
    }
    const lone = above.indexOf(count === 1);
    const a = v[lone];
    const b = v[(lone + 1) % 3];
    const c = v[(lone + 2) % 3];
    const ab = cut(a, b);
    const ac = cut(a, c);
    out.push(...a, ...ab, ...ac, ...ab, ...b, ...c, ...ab, ...c, ...ac);
  }
  return out;
}

function outlineShape() {
  const right = OUTLINE.map(([x, z]) => new THREE.Vector3(x, -z, 0));
  const left = OUTLINE.slice(1, -1).reverse().map(([x, z]) => new THREE.Vector3(-x, -z, 0));
  const curve = new THREE.CatmullRomCurve3([...right, ...left], true, 'centripetal');
  const points = curve.getSpacedPoints(OUTLINE_STEPS).slice(0, -1).map((p) => new THREE.Vector2(p.x, p.y));
  return new THREE.Shape(points);
}

// Contour rings only: edges inside the flat caps come from sliver triangles and are unreliable.
function ringEdges(geometry) {
  const all = new THREE.EdgesGeometry(geometry, 30);
  const p = all.attributes.position;
  const margin = BEVEL * 0.15;
  const onRing = (i) => p.getY(i) > margin && p.getY(i) < SHELL_H - margin;
  const keep = [];
  for (let i = 0; i < p.count; i += 2) {
    if (!onRing(i) || !onRing(i + 1)) continue;
    keep.push(p.getX(i), p.getY(i), p.getZ(i), p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1));
  }
  all.dispose();
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
}

// Sky blue in front, fading smoothly to black across the back third (mixed in linear space).
function buildShell() {
  const raw = extrudeUp(outlineShape(), SHELL_H, BEVEL, 2);
  let pos = Array.from(raw.attributes.position.array);
  raw.dispose();
  for (let i = 0; i < FADE_CUTS; i++) pos = sliceZ(pos, FADE_FROM + ((FADE_TO - FADE_FROM) * i) / (FADE_CUTS - 1));
  const flat = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const shell = toCreasedNormals(flat, CREASE);
  const p = shell.attributes.position;
  const black = new THREE.Color(COLORS.black);
  const blue = new THREE.Color(COLORS.blue);
  const mixed = new THREE.Color();
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.smoothstep(p.getZ(i), FADE_FROM, FADE_TO);
    mixed.lerpColors(black, blue, t).toArray(colors, i * 3);
  }
  return shell.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// Rounded rectangle, small corners at the back (shape +y) and large ones at the front.
function padOutline(path, hw, hd, rb, rf) {
  path.moveTo(-hw + rb, hd);
  path.lineTo(hw - rb, hd);
  path.quadraticCurveTo(hw, hd, hw, hd - rb);
  path.lineTo(hw, -hd + rf);
  path.quadraticCurveTo(hw, -hd, hw - rf, -hd);
  path.lineTo(-hw + rf, -hd);
  path.quadraticCurveTo(-hw, -hd, -hw, -hd + rf);
  path.lineTo(-hw, hd - rb);
  path.quadraticCurveTo(-hw, hd, -hw + rb, hd);
  return path;
}

// Dark-grey frame with the glossy black pad sunk slightly below its rim.
function buildTouchpad() {
  const hw = PAD.w / 2;
  const hd = PAD.d / 2;
  const ring = padOutline(new THREE.Shape(), hw + PAD.frame, hd + PAD.frame, 0.04, 0.12);
  ring.holes.push(padOutline(new THREE.Path(), hw, hd, 0.03, 0.11));
  const frame = paint(extrudeUp(ring, PAD.frameH, 0.003), COLORS.frame);
  const face = paint(extrudeUp(padOutline(new THREE.Shape(), hw - 0.002, hd - 0.002, 0.03, 0.11), PAD.faceH, 0.003), COLORS.key);
  return mergeAndDispose([frame, face]);
}

// Origin sits at the pad centre; one strip on each side of the touchpad.
function buildLightBar() {
  const strip = new RoundedBoxGeometry(BAR.w, BAR.h, BAR.len, 2, 0.005);
  const pair = [-1, 1].map((s) => strip.clone().translate(s * BAR.x, BAR.h / 2, 0));
  strip.dispose();
  return mergeAndDispose(pair);
}

// Concave-topped cap with a ridged rim: lathe profile, rim radius wobbled, then creased normals.
function buildStick() {
  const lathe = new THREE.LatheGeometry(STICK_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), STICK.segments);
  const p = lathe.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    if (Math.hypot(x, z) < STICK.ridgeFrom) continue;
    const k = 1 + STICK.ridgeDepth * Math.cos(Math.atan2(x, z) * STICK.ridges);
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  const smooth = toCreasedNormals(lathe, 0.9);
  lathe.dispose();
  return paint(smooth, COLORS.blue);
}

// Flat disc with a small rounded lip.
function puck(radius, height, segments = 24) {
  const lip = Math.min(0.01, height * 0.5);
  const profile = [[0, 0], [radius, 0], [radius, height - lip], [radius - lip, height], [0, height]];
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// Four separate arrow-shaped buttons around the cluster centre.
function buildDpad() {
  const hw = ARM.w / 2;
  const arrow = new THREE.Shape();
  arrow.moveTo(-hw + ARM.cut, 0);
  arrow.lineTo(hw - ARM.cut, 0);
  arrow.lineTo(hw, ARM.cut);
  arrow.lineTo(hw, ARM.len * 0.5);
  arrow.lineTo(0.012, ARM.len);
  arrow.lineTo(-0.012, ARM.len);
  arrow.lineTo(-hw, ARM.len * 0.5);
  arrow.lineTo(-hw, ARM.cut);
  arrow.closePath();
  const base = extrudeUp(arrow, ARM.h, 0.006).translate(0, 0, -ARM.gap);
  const arms = [0, 1, 2, 3].map((k) => paint(base.clone().rotateY((k * Math.PI) / 2), COLORS.key));
  base.dispose();
  return mergeAndDispose(arms);
}

function buildFaceButtons() {
  const disc = puck(FACE.radius, FACE.h);
  const pieces = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dz]) =>
    paint(disc.clone().translate(dx * FACE.offset, 0, dz * FACE.offset), COLORS.key));
  disc.dispose();
  return mergeAndDispose(pieces);
}

// Capsule lying along z, w wide, len long, h tall.
function pill(w, len, h) {
  return new THREE.CapsuleGeometry(w / 2, len - w, 4, 10).rotateX(Math.PI / 2).scale(1, h / w, 1).translate(0, h / 2 - 0.002, 0);
}

// Create/options pills, speaker dots, light-blue centre disc and grey mute pill in one draw call.
function buildDetails() {
  const at = (g, x, z) => g.translate(x, 0, z - DETAILS_Z);
  const pieces = [];
  const dot = new THREE.CylinderGeometry(DOTS.radius, DOTS.radius, 0.008, 8).translate(0, 0.002, 0);
  for (const z of DOTS.rows) {
    for (let i = 0; i < DOTS.count; i++) {
      pieces.push(paint(at(dot.clone(), (i - (DOTS.count - 1) / 2) * DOTS.gap, z), COLORS.key));
    }
  }
  dot.dispose();
  for (const s of [-1, 1]) {
    pieces.push(paint(at(pill(0.034, 0.075, 0.014).rotateY(-s * 0.18), s * 0.43, -0.43), COLORS.key));
  }
  pieces.push(paint(at(puck(0.04, 0.012), 0, 0), COLORS.ps));
  pieces.push(paint(at(pill(0.024, 0.075, 0.01).rotateY(Math.PI / 2), 0, 0.085), COLORS.mute));
  return mergeAndDispose(pieces);
}

function addBody(kit, group, parts, painted) {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const shellGeo = buildShell();
  const shell = kit.mesh(shellGeo, painted, 0, ringEdges(shellGeo));
  kit.addPart(group, parts, shell, 'shell', v(0, 0, 0), LIFT.shell);
  const touchpad = kit.mesh(buildTouchpad(), painted);
  kit.addPart(group, parts, touchpad, 'touchpad', v(0, TOP, PAD.z), LIFT.pad);
  const stickGeo = buildStick();
  const sticks = [-1, 1].map((s) =>
    kit.addPart(group, parts, kit.mesh(stickGeo, painted, 55), s < 0 ? 'left stick' : 'right stick', v(s * STICK.x, TOP, STICK.z), LIFT.stick));
  const dpad = kit.addPart(group, parts, kit.mesh(buildDpad(), painted), 'd-pad', v(-CLUSTER.x, TOP, CLUSTER.z), LIFT.buttons);
  const faces = kit.addPart(group, parts, kit.mesh(buildFaceButtons(), painted), 'face buttons', v(CLUSTER.x, TOP, CLUSTER.z), LIFT.buttons);
  kit.addPart(group, parts, kit.mesh(buildDetails(), painted), 'center buttons', v(0, TOP, DETAILS_Z), LIFT.buttons);
  return { touchpad, sticks, dpad, faces };
}

export function create(ctx) {
  const kit = makeKit(ctx);
  const group = new THREE.Group();
  group.name = 'dualsense';
  const parts = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);

  const controls = addBody(kit, group, parts, kit.paintedMaterial());

  // The light bar is unlit, so it keeps glowing in the ink theme.
  const glowBase = new THREE.Color(COLORS.glow);
  const glowMat = new THREE.MeshBasicMaterial({ color: glowBase, toneMapped: false });
  kit.owned.push(glowMat);
  const bar = kit.addPart(group, parts, new THREE.Mesh(buildLightBar(), glowMat), 'light bar', v(0, TOP, PAD.z), LIFT.bar);

  const anchors = [
    anchorOn(bar, v(BAR.x, BAR.h, 0), 'light bar', 'right'),
    anchorOn(controls.touchpad, v(0, PAD.frameH, 0), 'touchpad', 'left'),
    anchorOn(controls.sticks[0], v(0, 0.06, 0), 'analog stick', 'left'),
    anchorOn(controls.dpad, v(-0.12, ARM.h, 0), 'd-pad', 'left'),
    anchorOn(controls.faces, v(FACE.offset, FACE.h, 0), 'face buttons', 'right'),
  ];

  const explode = kit.exploder(parts);
  let clock = 0;

  function update(dt, state) {
    if (!state?.reducedMotion) clock += dt;
    const pulse = state?.reducedMotion ? GLOW_STILL : 0.75 + 0.25 * Math.sin(clock * GLOW_SPEED);
    glowMat.color.copy(glowBase).multiplyScalar(pulse);
    explode(dt, state);
  }

  const onPick = (part) => part?.userData?.label ?? null;

  group.userData.shadowRadius = SHADOW_RADIUS;
  return { group, parts, anchors, update, onPick, dispose: () => disposeAll(group, kit.owned) };
}
