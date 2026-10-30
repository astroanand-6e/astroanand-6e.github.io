// Poses, spring blending and the two-bone arm solver for the desk character (units: 1 = 10 cm).
import * as THREE from 'three';

export const BODY = Object.freeze({
  thigh: 4.0,
  shin: 3.8,
  ankleY: 0.7,
  upperArm: 2.7,
  foreArm: 2.2,
  handReach: 0.5,
  hipX: 0.62,
  shoulderX: 1.55,
  shoulderY: 1.55,
  spineY: 0.5,
  chestY: 1.3,
  neckY: 2.3,
  headY: 0.75,
});

export const ACTIVITIES = ['coding', 'gaming', 'mixing'];
export const AUTO_CYCLE_S = 6;
export const BLEND_SMOOTH_S = 0.22;
export const BPM = 120;
const MAX_STEP_S = 0.05;
const HALF_PI = Math.PI / 2;

/** Joints driven by pose channels (arms are solved from hand targets instead). */
export const POSE_JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR',
  'thighL', 'thighR', 'kneeL', 'kneeR', 'thumbL', 'thumbR',
];

const SEATED_LEGS = {
  thighL: [-HALF_PI, -0.05, 0], thighR: [-HALF_PI, 0.05, 0],
  kneeL: [HALF_PI, 0, 0], kneeR: [HALF_PI, 0, 0],
};
const STANDING_LEGS = {
  thighL: [-0.07, -0.04, 0], thighR: [-0.1, 0.04, 0],
  kneeL: [0.14, 0, 0], kneeR: [0.18, 0, 0],
};

// spot: where the root stands; hands/gaze: what the arms and eyes aim at; ctrl: controller in hands (0/1);
// phones: 0 around the neck, 1 on the ears; nod: beat-synced head bob weight.
export const POSES = Object.freeze({
  coding: {
    spot: 'seat', hands: 'type', gaze: 'screen', ctrl: 0, phones: 0, nod: 0,
    joints: { ...SEATED_LEGS, spine: [0.14, 0, 0], chest: [0.06, 0, 0] },
  },
  gaming: {
    spot: 'seat', hands: 'pad', gaze: 'screen', ctrl: 1, phones: 0, nod: 0,
    joints: { ...SEATED_LEGS, spine: [-0.2, 0, 0], chest: [-0.08, 0, 0], head: [-0.04, 0, 0.05] },
  },
  mixing: {
    spot: 'stand', hands: 'mix', gaze: 'mixer', ctrl: 0, phones: 1, nod: 1,
    joints: { ...STANDING_LEGS, spine: [0.16, 0, 0], chest: [0.1, 0, 0] },
  },
  speaking: {
    spot: 'speak', hands: 'talk', gaze: 'mic', ctrl: 0, phones: 0, nod: 0.35,
    joints: { ...STANDING_LEGS, spine: [0.3, 0, 0], chest: [0.12, 0, 0], head: [0.05, 0, 0.06] },
  },
});

// Layered over whichever activity pose is active when the gear explodes.
const SURPRISED = {
  hands: 'head', gaze: 'ahead', ctrl: 0, nod: 0,
  joints: { spine: [-0.2, 0, 0], chest: [-0.12, 0, 0], head: [-0.16, 0, 0], shoulderL: [0, 0, 0.3], shoulderR: [0, 0, -0.3] },
};

/** Pose for this frame; `surprised` overrides arms, gaze and posture but keeps the activity's spot and legs. */
export function resolvePose(activity, { isExploded, isVoice }) {
  const base = POSES[isVoice ? 'speaking' : activity] ?? POSES.coding;
  if (!isExploded) return base;
  return { ...base, ...SURPRISED, joints: { ...base.joints, ...SURPRISED.joints } };
}

/** Activity requested by the HTML control, auto-cycling when unset or 'auto'. */
export function pickActivity(controlValue, clock, isReduced) {
  if (isReduced) return 'coding';
  if (ACTIVITIES.includes(controlValue)) return controlValue;
  return ACTIVITIES[Math.floor(clock / AUTO_CYCLE_S) % ACTIVITIES.length];
}

/** Named scalar channels, each a critically damped spring toward its target. */
export class Channels {
  constructor(smoothTime = BLEND_SMOOTH_S) {
    this.omega = 2 / smoothTime;
    this.map = new Map();
  }

  ensure(name) {
    let ch = this.map.get(name);
    if (!ch) {
      ch = { value: 0, vel: 0, target: 0, omega: this.omega };
      this.map.set(name, ch);
    }
    return ch;
  }

  aim(name, target, omega) {
    const ch = this.ensure(name);
    ch.target = target;
    if (omega) ch.omega = omega;
  }

  get(name) {
    return this.map.get(name)?.value ?? 0;
  }

  snap() {
    this.map.forEach((ch) => {
      ch.value = ch.target;
      ch.vel = 0;
    });
  }

  step(dt) {
    const h = Math.min(dt, MAX_STEP_S);
    this.map.forEach((ch) => {
      const x = ch.omega * h;
      const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const change = ch.value - ch.target;
      const temp = (ch.vel + ch.omega * change) * h;
      ch.vel = (ch.vel - ch.omega * temp) * decay;
      ch.value = ch.target + (change + temp) * decay;
    });
  }
}

const dir = new THREE.Vector3();
const perp = new THREE.Vector3();
const basisX = new THREE.Vector3();
const basisZ = new THREE.Vector3();
const basisY = new THREE.Vector3();
const basisM = new THREE.Matrix4();
const worldQ = new THREE.Quaternion();
const parentQ = new THREE.Quaternion();
const spare = { p: new THREE.Vector3(), s: new THREE.Vector3() };

/** Elbow position for a two-bone chain reaching `target`; returns the reachable end point in `reach`. */
export function solveElbow(shoulder, target, a, b, pole, elbow, reach) {
  dir.subVectors(target, shoulder);
  const raw = dir.length();
  if (raw < 1e-5) dir.set(0, 0, 1);
  else dir.divideScalar(raw);
  const d = THREE.MathUtils.clamp(raw, Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const along = (a * a - b * b + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(a * a - along * along, 0));
  perp.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
  perp.normalize();
  elbow.copy(shoulder).addScaledVector(dir, along).addScaledVector(perp, height);
  reach.copy(shoulder).addScaledVector(dir, d);
}

/**
 * Points a joint's -y axis along `to - from` (root space), rolled so its local +z leans toward `ref`.
 * `refWorld` is the inverse of the root's world matrix, used to read the parent's root-space rotation.
 */
export function aimJoint(joint, from, to, ref, refWorld) {
  basisY.subVectors(from, to).normalize();
  basisZ.copy(ref).addScaledVector(basisY, -ref.dot(basisY));
  if (basisZ.lengthSq() < 1e-4) basisZ.set(0, 0, 1).addScaledVector(basisY, -basisY.z);
  basisZ.normalize();
  basisX.crossVectors(basisY, basisZ);
  basisM.makeBasis(basisX, basisY, basisZ);
  worldQ.setFromRotationMatrix(basisM);
  joint.parent.updateWorldMatrix(true, false);
  basisM.multiplyMatrices(refWorld, joint.parent.matrixWorld);
  basisM.decompose(spare.p, parentQ, spare.s);
  joint.quaternion.copy(parentQ.invert().multiply(worldQ));
  joint.updateWorldMatrix(false, true);
}

/** Hand target (root space) = smoothed base channels plus fast per-activity motion that springs would filter out. */
export function animatedHand(ch, side, t, out) {
  const s = side === 'L' ? 1 : -1;
  const w = (kind) => ch.get(`w.${kind}`);
  const phase = side === 'L' ? 0 : 1.7;
  out.set(ch.get(`hand${side}.x`), ch.get(`hand${side}.y`), ch.get(`hand${side}.z`));
  out.y += w('type') * (0.22 + 0.1 * Math.max(0, Math.sin(t * 11 + phase)));
  out.x += w('type') * 0.12 * Math.sin(t * 4.3 + phase);
  out.y += w('mix') * 0.32;
  if (side === 'L') {
    out.x += w('mix') * 0.22 * Math.cos(t * 5.6);
    out.z += w('mix') * 0.22 * Math.sin(t * 5.6);
  } else {
    out.x += w('mix') * 0.28 * Math.sin(t * 1.9);
  }
  out.y += w('talk') * 0.35 * Math.sin(t * 3 + phase);
  out.x += w('talk') * 0.1 * s * Math.sin(t * 2.2);
  out.y += w('pad') * 0.05 * Math.sin(t * 8 + phase);
  return out;
}
