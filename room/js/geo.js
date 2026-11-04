// Geometry helpers. Static furniture is baked into one vertex-coloured mesh plus one merged line set,
// so a whole room of objects costs two draw calls.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const EDGE_ANGLE = 30;
const CREASE = 0.7;
const CURVE_SEGMENTS = 8;
const ROUNDED_SEGMENTS = 3;
const ZERO = Object.freeze([0, 0, 0]);
const ONE = Object.freeze([1, 1, 1]);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Primitives sit on y = 0 and are centred on x and z.
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
export const cyl = (rTop, rBottom, h, seg = 24) => new THREE.CylinderGeometry(rTop, rBottom, h, seg).translate(0, h / 2, 0);
export const sphere = (r, wSeg = 16, hSeg = 12) => new THREE.SphereGeometry(r, wSeg, hSeg);
export function rbox(w, h, d, r = 0.12) {
  const radius = Math.min(r, w / 2, h / 2, d / 2) - 0.001;
  return new RoundedBoxGeometry(w, h, d, ROUNDED_SEGMENTS, Math.max(radius, 0.01)).translate(0, h / 2, 0);
}

export function roundedRectShape(w, d, r) {
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

/** Flat slab on y in [0, h] with a chamfered rim, so outlines trace the bevel. */
export function slab(w, h, d, radius, bevel) {
  const shape = roundedRectShape(w - 2 * bevel, d - 2 * bevel, Math.max(radius - bevel, 0.01));
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: h - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: CURVE_SEGMENTS,
  });
  raw.rotateX(-Math.PI / 2).translate(0, bevel, 0);
  const smooth = toCreasedNormals(raw, CREASE);
  raw.dispose();
  return smooth;
}

/** Bakes a flat colour into a geometry's vertex colours. */
export function paint(geometry, hex) {
  const color = new THREE.Color(hex);
  const data = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) color.toArray(data, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geometry;
}

export function lineSet(edges, material) {
  const lines = new THREE.LineSegments(edges, material);
  lines.raycast = () => {};
  lines.userData.isOutline = true;
  return lines;
}

/** Collects shapes (each with its own colour and optional outline) into one mesh and one line set. */
export function createBaker() {
  const fills = [];
  const outlines = [];
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const move = new THREE.Vector3();
  const size = new THREE.Vector3();
  const stack = [new THREE.Matrix4()];

  function add(source, options = {}) {
    const { color = 0xffffff, pos = ZERO, rot = ZERO, scale = ONE, outline = true, angle = EDGE_ANGLE, own = false } = options;
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    if (own) source.dispose();
    geometry.deleteAttribute('uv');
    if (geometry.attributes.uv1) geometry.deleteAttribute('uv1');
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    euler.set(rot[0], rot[1], rot[2], 'YXZ');
    quat.setFromEuler(euler);
    matrix.compose(move.set(pos[0], pos[1], pos[2]), quat, size.set(scale[0], scale[1], scale[2]));
    matrix.premultiply(stack[stack.length - 1]);
    geometry.applyMatrix4(matrix);
    paint(geometry, color);
    fills.push(geometry);
    if (outline) outlines.push(new THREE.EdgesGeometry(geometry, angle));
    return api;
  }

  const api = {
    add,
    box: (w, h, d, o) => add(box(w, h, d), { ...o, own: true }),
    cyl: (rTop, rBottom, h, o, seg) => add(cyl(rTop, rBottom, h, seg), { ...o, own: true }),
    rbox: (w, h, d, r, o) => add(rbox(w, h, d, r), { ...o, own: true }),
    sphere: (r, o) => add(sphere(r), { ...o, own: true }),
    /** Everything added until pop() is placed in a frame at pos, turned by yaw about y. */
    push(pos = ZERO, yaw = 0) {
      const frame = new THREE.Matrix4().makeRotationY(yaw).setPosition(pos[0], pos[1], pos[2]);
      stack.push(stack[stack.length - 1].clone().multiply(frame));
      return api;
    },
    pop() {
      if (stack.length > 1) stack.pop();
      return api;
    },
    /** A cylinder (or cone) running from point a to point b. */
    limb(a, b, radius, color, { radiusEnd = radius, seg = 12, outline = false } = {}) {
      const from = new THREE.Vector3(...a);
      const to = new THREE.Vector3(...b);
      const along = to.clone().sub(from);
      const length = along.length();
      const turn = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, along.normalize());
      const e = new THREE.Euler().setFromQuaternion(turn, 'YXZ');
      const mid = from.add(to).multiplyScalar(0.5);
      return add(new THREE.CylinderGeometry(radiusEnd, radius, length, seg), { color, pos: mid.toArray(), rot: [e.x, e.y, e.z], outline, own: true });
    },
    build() {
      if (!fills.length) throw new Error('baker: nothing to build');
      const geometry = mergeGeometries(fills);
      if (!geometry) throw new Error('baker: vertex attributes do not match');
      const edges = outlines.length ? mergeGeometries(outlines) : null;
      [...fills, ...outlines].forEach((g) => g.dispose());
      fills.length = 0;
      outlines.length = 0;
      return { geometry, edges };
    },
  };
  return api;
}

/** Turns baker output into a group of one mesh and (optionally) one outline set. */
export function meshFromBake({ geometry, edges }, material, lineMaterial) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  if (edges && lineMaterial) group.add(lineSet(edges, lineMaterial));
  return group;
}

/**
 * Gives a subtree its own clone of the shared outline material, so hovering one object can tint
 * only its hairlines. Returns the clone (the caller owns it).
 */
export function ownLines(root, sharedLine) {
  const own = sharedLine.clone();
  root.traverse((node) => {
    if (node.isLineSegments && node.material === sharedLine) node.material = own;
  });
  return own;
}

export function disposeTree(root) {
  root.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
  });
}
