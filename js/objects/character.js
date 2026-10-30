// Anand: a stylized toon figure with a joint hierarchy, posed by springs and a two-bone arm solver (units: 1 = 10 cm).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  BODY, POSE_JOINTS, BPM, Channels, resolvePose, pickActivity, solveElbow, aimJoint, animatedHand,
} from './character-poses.js';

const HALF_PI = Math.PI / 2;
const OUTLINE_W = 0.026;
const HIP_DROP = 0.2;
const BEAT_HZ = BPM / 60;
const GAZE_LIMIT = 1.25;
const HEAD_GAZE_SHARE = 0.55;
const BREATH_HZ = 0.24;
const SETTLE_PASSES = 3;
const ROOT_FAST_S = 0.22;
const ROOT_SLOW_S = 1.1;
const COLORS = {
  skin: 0xa8744f, hair: 0x1d1511, jacket: 0x1c2a4c, collar: 0x2b3c66, zip: 0x8791a6, trouser: 0x24252c,
  shoe: 0xf4f2ec, sole: 0xd5d2c8, eye: 0x120d0b, lip: 0xc98a78, phones: 0x2d2f36, accent: 0xd47589,
};
const NECK_PHONES = { pos: [0, 2.05, -0.1], rotX: -1.35, scale: 0.82 };
const EARS_PHONES = { pos: [0, 0.2, -0.05], scale: 1 };
const FALLBACK_ENV = {
  spots: { seat: { x: 0, z: 0, yaw: 0 }, stand: { x: 0, z: 0, yaw: 0 }, speak: { x: 0, z: 0, yaw: 0 } },
};

function ellipsoid(rx, ry, rz) {
  return new THREE.SphereGeometry(1, 22, 16).scale(rx, ry, rz);
}

function limb(r, length) {
  return new THREE.CapsuleGeometry(r, Math.max(length - 2 * r, 0.01), 6, 16).translate(0, -length / 2, 0);
}

function hullOf(geometry) {
  const hull = geometry.clone();
  const p = hull.attributes.position;
  const n = hull.attributes.normal;
  for (let i = 0; i < p.count; i += 1) {
    p.setXYZ(i, p.getX(i) + n.getX(i) * OUTLINE_W, p.getY(i) + n.getY(i) * OUTLINE_W, p.getZ(i) + n.getZ(i) * OUTLINE_W);
  }
  return hull;
}

function makeKit(ctx) {
  const owned = [];
  const cache = new Map();
  const gradient = ctx?.materials?.gradient ?? null;
  const lineMat = new THREE.MeshBasicMaterial({ color: ctx?.materials?.line?.color ?? 0x1c1a17, side: THREE.BackSide });
  owned.push(lineMat);
  const toon = (key) => {
    if (!cache.has(key)) {
      const m = new THREE.MeshToonMaterial({
        color: COLORS[key], gradientMap: gradient, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      cache.set(key, m);
      owned.push(m);
    }
    return cache.get(key);
  };
  const syncLine = () => {
    const line = ctx?.materials?.line;
    if (line) lineMat.color.copy(line.color);
  };
  return { owned, toon, lineMat, syncLine };
}

function addMesh(kit, parent, geometry, colorKey, pos = [0, 0, 0], { rot, hull = true } = {}) {
  const mesh = new THREE.Mesh(geometry, kit.toon(colorKey));
  mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  if (hull) {
    const outline = new THREE.Mesh(hullOf(geometry), kit.lineMat);
    outline.raycast = () => {};
    outline.userData.isOutline = true;
    mesh.add(outline);
  }
  parent.add(mesh);
  return mesh;
}

function buildHead(kit, head) {
  const m = (geo, color, pos, opts) => addMesh(kit, head, geo, color, pos, opts);
  m(ellipsoid(1.08, 1.28, 1.12), 'skin', [0, 0.15, 0]);
  [1, -1].forEach((s) => {
    m(ellipsoid(0.2, 0.3, 0.2), 'skin', [s * 1.06, 0.1, -0.05]);
    m(ellipsoid(0.1, 0.12, 0.06), 'eye', [s * 0.43, 0.33, 1.02], { hull: false });
    m(new THREE.CapsuleGeometry(0.05, 0.36, 3, 8), 'hair', [s * 0.45, 0.62, 1.0], { rot: [0, 0, HALF_PI + s * 0.12], hull: false });
    m(new THREE.CapsuleGeometry(0.1, 0.34, 4, 10), 'hair', [s * 0.24, -0.2, 1.22], { rot: [0, 0, HALF_PI - s * 0.3], hull: false });
  });
  m(ellipsoid(0.2, 0.25, 0.22), 'skin', [0, -0.02, 1.1]);
  m(ellipsoid(1.14, 0.88, 1.12), 'hair', [0, -0.5, 0.12]);
  const smile = new THREE.TorusGeometry(0.3, 0.045, 6, 18, Math.PI * 0.7).rotateZ(1.5 * Math.PI - Math.PI * 0.35);
  m(smile, 'lip', [0, -0.42, 1.27], { hull: false });
  m(ellipsoid(1.22, 1.1, 1.3), 'hair', [0, 0.8, -0.3]);
  m(ellipsoid(0.95, 0.6, 0.9), 'hair', [0, 1.5, 0.35], { rot: [-0.45, 0, 0] });
  m(ellipsoid(1.05, 0.95, 0.85), 'hair', [0, 1.0, -0.85]);
}

function buildArm(kit, joints, chest, side) {
  const tag = side > 0 ? 'L' : 'R';
  const make = (name, parent, pos) => {
    const g = new THREE.Group();
    g.name = `${name}${tag}`;
    g.position.set(...pos);
    parent.add(g);
    joints[g.name] = g;
    return g;
  };
  const shoulder = make('shoulder', chest, [side * BODY.shoulderX, BODY.shoulderY, 0]);
  addMesh(kit, shoulder, ellipsoid(0.52, 0.5, 0.5), 'jacket');
  const arm = make('arm', shoulder, [0, 0, 0]);
  addMesh(kit, arm, limb(0.4, BODY.upperArm), 'jacket');
  const elbow = make('elbow', arm, [0, -BODY.upperArm, 0]);
  addMesh(kit, elbow, ellipsoid(0.38, 0.38, 0.38), 'jacket');
  addMesh(kit, elbow, limb(0.35, BODY.foreArm), 'jacket');
  const hand = make('hand', elbow, [0, -BODY.foreArm, 0]);
  addMesh(kit, hand, new RoundedBoxGeometry(0.78, 1.0, 0.44, 3, 0.18), 'skin', [0, -0.45, 0]);
  const thumb = make('thumb', hand, [-side * 0.42, -0.15, 0.06]);
  addMesh(kit, thumb, limb(0.15, 0.62), 'skin');
}

function buildLeg(kit, joints, hips, side) {
  const tag = side > 0 ? 'L' : 'R';
  const make = (name, parent, pos) => {
    const g = new THREE.Group();
    g.name = `${name}${tag}`;
    g.position.set(...pos);
    parent.add(g);
    joints[g.name] = g;
    return g;
  };
  const thigh = make('thigh', hips, [side * BODY.hipX, -HIP_DROP, 0]);
  addMesh(kit, thigh, limb(0.58, BODY.thigh), 'trouser');
  const knee = make('knee', thigh, [0, -BODY.thigh, 0]);
  addMesh(kit, knee, ellipsoid(0.52, 0.52, 0.52), 'trouser');
  addMesh(kit, knee, limb(0.46, BODY.shin), 'trouser');
  const ankle = make('ankle', knee, [0, -BODY.shin, 0]);
  addMesh(kit, ankle, new RoundedBoxGeometry(0.95, 0.62, 2.5, 3, 0.26), 'shoe', [0, -0.34, 0.62]);
  addMesh(kit, ankle, new RoundedBoxGeometry(1.0, 0.2, 2.6, 2, 0.08), 'sole', [0, -0.6, 0.62], { hull: false });
}

function buildBody(kit) {
  const root = new THREE.Group();
  root.name = 'anand';
  const joints = {};
  const make = (name, parent, pos) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    parent.add(g);
    joints[name] = g;
    return g;
  };
  const hips = make('hips', root, [0, 8.5, 0]);
  addMesh(kit, hips, new RoundedBoxGeometry(2.3, 1.2, 1.5, 3, 0.4), 'trouser');
  const spine = make('spine', hips, [0, BODY.spineY, 0]);
  addMesh(kit, spine, ellipsoid(1.25, 1.0, 0.8), 'jacket', [0, 0.35, 0]);
  const chest = make('chest', spine, [0, BODY.chestY, 0]);
  addMesh(kit, chest, ellipsoid(1.45, 1.5, 0.95), 'jacket', [0, 0.9, 0]);
  const zipPoints = [-0.5, 0.2, 0.9, 1.6, 2.2].map((y) => new THREE.Vector3(0, y, 0.97 * Math.sqrt(Math.max(1 - ((y - 0.9) / 1.5) ** 2, 0.02)) + 0.01));
  addMesh(kit, chest, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(zipPoints), 12, 0.03, 5), 'zip', [0, 0, 0], { hull: false });
  const neck = make('neck', chest, [0, BODY.neckY, 0]);
  addMesh(kit, neck, new THREE.CylinderGeometry(0.42, 0.5, 0.95, 14).translate(0, 0.37, 0), 'skin');
  addMesh(kit, neck, new THREE.TorusGeometry(0.62, 0.2, 8, 20).rotateX(HALF_PI), 'collar', [0, 0, 0]);
  buildHead(kit, make('head', neck, [0, BODY.headY, 0]));
  [1, -1].forEach((s) => {
    buildArm(kit, joints, chest, s);
    buildLeg(kit, joints, hips, s);
  });
  return { root, joints };
}

function buildHeadphones(kit) {
  const g = new THREE.Group();
  g.name = 'headphones';
  const band = new THREE.TorusGeometry(1.38, 0.09, 8, 30, Math.PI).scale(1, 1.5, 1.05);
  addMesh(kit, g, band, 'phones', [0, 0, 0], { hull: false });
  [1, -1].forEach((s) => {
    addMesh(kit, g, new THREE.CylinderGeometry(0.62, 0.62, 0.4, 20).rotateZ(HALF_PI), 'phones', [s * 1.38, 0, 0]);
    addMesh(kit, g, new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20).rotateZ(HALF_PI), 'accent', [s * 1.6, 0, 0], { hull: false });
  });
  return g;
}

export function create(ctx, env = FALLBACK_ENV) {
  const kit = makeKit(ctx);
  const { root, joints: J } = buildBody(kit);
  const phones = buildHeadphones(kit);
  root.add(phones);
  const group = root;
  const spots = env.spots ?? FALLBACK_ENV.spots;
  const ch = new Channels();
  const clock = { t: 0 };
  let activity = null;
  let isFirst = true;

  const hands = { l: new THREE.Vector3(), r: new THREE.Vector3() };
  const v = Array.from({ length: 6 }, () => new THREE.Vector3());
  const m4 = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
  const q = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const homeCtrl = env.controller ? { pos: env.controller.position.clone(), quat: env.controller.quaternion.clone() } : null;
  const neckTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(NECK_PHONES.rotX, 0, 0));
  const heldTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.8, Math.PI, 0, 'YXZ'));

  // Root-space helpers: joint matrices relative to the root, so parent scale and rotation cancel.
  const rootInv = new THREE.Matrix4();
  const localInv = new THREE.Matrix4();
  const pointOn = (joint, x, y, z, out) => out.set(x, y, z).applyMatrix4(m4[0].multiplyMatrices(rootInv, joint.matrixWorld));
  const toRoot = (point, out) => out.copy(point).applyMatrix4(localInv);

  function announce(next) {
    if (next === activity) return;
    activity = next;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('activity-change', { detail: { value: next } }));
  }

  function aimPose(pose, isReduced) {
    POSE_JOINTS.forEach((name) => {
      const target = pose.joints[name] ?? [0, 0, 0];
      ['x', 'y', 'z'].forEach((axis, i) => ch.aim(`${name}.${axis}`, target[i]));
    });
    const spot = spots[pose.spot] ?? spots.seat;
    const goingBack = spot.z < ch.get('root.z') - 0.05;
    ch.aim('root.x', spot.x, 2 / (goingBack ? ROOT_SLOW_S : ROOT_FAST_S));
    ch.aim('root.z', spot.z, 2 / (goingBack ? ROOT_FAST_S : ROOT_SLOW_S));
    ch.aim('root.yaw', spot.yaw);
    ch.aim('ctrl', pose.ctrl);
    ch.aim('phones', pose.phones);
    ch.aim('nod', isReduced ? 0 : pose.nod);
    ['type', 'pad', 'mix', 'talk', 'head'].forEach((kind) => ch.aim(`w.${kind}`, pose.hands === kind ? 1 : 0));
    if (isReduced) ch.snap();
  }

  function applyPose(t, isReduced) {
    const beat = isReduced ? 0 : Math.sin(2 * Math.PI * BEAT_HZ * t);
    const bend = ch.get('nod') * 0.08 * (0.5 + 0.5 * beat);
    const breath = isReduced ? 0 : Math.sin(2 * Math.PI * BREATH_HZ * t);
    POSE_JOINTS.forEach((name) => {
      J[name].rotation.set(ch.get(`${name}.x`), ch.get(`${name}.y`), ch.get(`${name}.z`));
    });
    ['L', 'R'].forEach((s) => {
      J[`thigh${s}`].rotation.x -= bend;
      J[`knee${s}`].rotation.x += bend * 2;
      J[`thumb${s}`].rotation.x += ch.get('w.pad') * (0.35 + 0.28 * Math.sin(t * 8 + (s === 'L' ? 0 : 2)));
    });
    J.chest.rotation.x += 0.012 * breath + ch.get('nod') * 0.025 * beat;
    J.spine.rotation.x += 0.006 * breath;
    const drop = (s) => BODY.thigh * Math.cos(J[`thigh${s}`].rotation.x) + BODY.shin * Math.cos(J[`thigh${s}`].rotation.x + J[`knee${s}`].rotation.x);
    J.hips.position.y = BODY.ankleY + HIP_DROP + Math.min(drop('L'), drop('R'));
    ['L', 'R'].forEach((s) => {
      J[`ankle${s}`].rotation.x = -(J[`thigh${s}`].rotation.x + J[`knee${s}`].rotation.x);
    });
    root.position.set(ch.get('root.x'), 0, ch.get('root.z'));
    root.rotation.y = ch.get('root.yaw');
    root.updateMatrix();
    localInv.copy(root.matrix).invert();
    root.updateWorldMatrix(true, true);
    rootInv.copy(root.matrixWorld).invert();
  }

  function gazePoint(kind, out) {
    if (kind === 'screen' && env.screen) return toRoot(env.screen, out);
    if (kind === 'mic' && env.mic) return toRoot(env.mic, out);
    if (kind === 'mixer' && env.mixer) return toRoot(env.mixer.jog, out).lerp(toRoot(env.mixer.fader(0.5), v[5]), 0.5);
    return pointOn(J.head, 0, 0.4, 8, out);
  }

  function aimGaze(pose, isReduced) {
    pointOn(J.head, 0, 0.3, 0, v[0]);
    gazePoint(pose.gaze, v[1]).sub(v[0]);
    m4[1].multiplyMatrices(rootInv, J.chest.matrixWorld).decompose(v[2], q[0], v[3]);
    v[1].applyQuaternion(q[0].invert());
    const yaw = THREE.MathUtils.clamp(Math.atan2(v[1].x, v[1].z), -GAZE_LIMIT, GAZE_LIMIT);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(v[1].y, Math.hypot(v[1].x, v[1].z)), -0.7, 0.7);
    ch.aim('gaze.yaw', yaw);
    ch.aim('gaze.pitch', pitch);
    if (isReduced) ch.snap();
  }

  function applyGaze(t, isReduced) {
    const nod = isReduced ? 0 : ch.get('nod') * 0.075 * Math.sin(2 * Math.PI * BEAT_HZ * t);
    const yaw = ch.get('gaze.yaw');
    const pitch = ch.get('gaze.pitch');
    J.neck.rotation.set(J.neck.rotation.x + pitch * (1 - HEAD_GAZE_SHARE) * 0.7, J.neck.rotation.y + yaw * (1 - HEAD_GAZE_SHARE), J.neck.rotation.z);
    J.head.rotation.set(J.head.rotation.x + pitch * HEAD_GAZE_SHARE + nod, J.head.rotation.y + yaw * HEAD_GAZE_SHARE, J.head.rotation.z);
    J.neck.updateWorldMatrix(false, true);
  }

  // Held controller pose in root space, from the chest frame: face tilted toward the eyes.
  function heldPose(outPos, outQuat) {
    pointOn(J.chest, 0, 0.55, 2.2, outPos);
    m4[2].multiplyMatrices(rootInv, J.chest.matrixWorld).decompose(v[3], outQuat, v[4]);
    outQuat.multiply(heldTilt);
  }

  function aimHands(pose) {
    const set = (side, p) => ['x', 'y', 'z'].forEach((axis) => ch.aim(`hand${side}.${axis}`, p[axis]));
    const grip = (s, out) => out.set(s * 0.62, 0.12, 0.34).applyQuaternion(q[1]).add(v[5]);
    switch (pose.hands) {
      case 'type':
        set('L', toRoot(env.keys?.left ?? v[0].set(0.8, 6, 3), v[0]));
        set('R', toRoot(env.keys?.right ?? v[0].set(-0.8, 6, 3), v[0]));
        break;
      case 'pad':
        heldPose(v[5], q[1]);
        set('L', grip(1, v[0]));
        set('R', grip(-1, v[0]));
        break;
      case 'mix':
        set('L', toRoot(env.mixer?.jog ?? v[0].set(1, 7, 2), v[0]));
        set('R', toRoot(env.mixer?.fader?.(0.5) ?? v[0].set(0, 7, 2), v[0]));
        break;
      case 'talk':
        set('L', pointOn(J.chest, 1.5, -0.5, 2.7, v[0]));
        set('R', pointOn(J.chest, -1.5, -1.4, 1.8, v[0]));
        break;
      default:
        set('L', pointOn(J.head, 1.45, 0.8, 0, v[0]));
        set('R', pointOn(J.head, -1.45, 0.8, 0, v[0]));
    }
  }

  function solveArms(t) {
    ['L', 'R'].forEach((side) => {
      const s = side === 'L' ? 1 : -1;
      const arm = J[`arm${side}`];
      const elbow = J[`elbow${side}`];
      v[0].setFromMatrixPosition(m4[0].multiplyMatrices(rootInv, arm.matrixWorld));
      animatedHand(ch, side, t, v[1]);
      solveElbow(v[0], v[1], BODY.upperArm, BODY.foreArm + BODY.handReach, v[2].set(s * 0.7, -1, -0.45), v[3], v[4]);
      aimJoint(arm, v[0], v[3], v[2].set(0, 0, 1), rootInv);
      aimJoint(elbow, v[3], v[4], v[2].set(0, 1, 0), rootInv);
    });
  }

  function placeProps() {
    const k = ch.get('phones');
    const pk = THREE.MathUtils.clamp(k, 0, 1);
    pointOn(J.head, EARS_PHONES.pos[0], EARS_PHONES.pos[1], EARS_PHONES.pos[2], v[0]);
    pointOn(J.chest, ...NECK_PHONES.pos, v[1]);
    m4[0].multiplyMatrices(rootInv, J.head.matrixWorld).decompose(v[3], q[0], v[4]);
    m4[1].multiplyMatrices(rootInv, J.chest.matrixWorld).decompose(v[3], q[1], v[4]);
    q[1].multiply(neckTilt);
    phones.position.lerpVectors(v[1], v[0], pk);
    phones.quaternion.slerpQuaternions(q[1], q[0], pk);
    phones.scale.setScalar(THREE.MathUtils.lerp(NECK_PHONES.scale, EARS_PHONES.scale, pk));
    if (!env.controller || !homeCtrl) return;
    const held = THREE.MathUtils.clamp(ch.get('ctrl'), 0, 1);
    if (held < 1e-3) {
      env.controller.position.copy(homeCtrl.pos);
      env.controller.quaternion.copy(homeCtrl.quat);
      return;
    }
    heldPose(v[0], q[0]);
    v[0].applyMatrix4(root.matrix);
    q[0].premultiply(root.quaternion);
    env.controller.position.lerpVectors(homeCtrl.pos, v[0], held);
    env.controller.position.y += Math.sin(Math.PI * held) * 0.8;
    env.controller.quaternion.slerpQuaternions(homeCtrl.quat, q[0], held);
  }

  function frame(dt, state, tick) {
    const isReduced = !!state?.reducedMotion;
    if (!isReduced) clock.t += dt;
    const requested = pickActivity(state?.controls?.activity, clock.t, isReduced);
    announce(requested);
    const pose = resolvePose(requested, { isExploded: !!state?.exploded, isVoice: state?.chapter?.id === 'voice' });
    aimPose(pose, isReduced);
    ch.step(tick ? 0 : dt);
    if (isFirst) ch.snap();
    applyPose(clock.t, isReduced);
    aimGaze(pose, isReduced);
    applyGaze(clock.t, isReduced);
    aimHands(pose);
    solveArms(clock.t);
    placeProps();
    kit.syncLine();
  }

  function update(dt, state) {
    if (isFirst) {
      for (let i = 0; i < SETTLE_PASSES; i += 1) frame(0, state, true);
      isFirst = false;
    }
    frame(dt, state, false);
  }

  function dispose() {
    root.traverse((o) => o.geometry?.dispose?.());
    kit.owned.forEach((m) => m.dispose());
  }

  return { group, joints: J, update, dispose };
}
