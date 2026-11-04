// Camera framing helpers: orbit basis and a fit that keeps a set of world points inside a padded viewport.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const FIT_ITERATIONS = 7;
const START_DISTANCE = 100;

/** dir points from the target to the camera; right and up span the screen. */
export function orbitBasis(yaw, pitch) {
  const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
  const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
  const up = new THREE.Vector3().crossVectors(dir, right).normalize();
  return { dir, right, up };
}

/**
 * A pose is a camera position, orientation and vertical field of view (degrees), plus the point it
 * looks at and how far away that is (flights travel between look-at points, not between positions).
 */
export function createPose() {
  return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 30, target: new THREE.Vector3(), distance: 10 };
}

const lookMatrix = new THREE.Matrix4();
export function poseLookingAt(pose, position, target, fov, up = UP) {
  pose.position.copy(position);
  pose.target.copy(target);
  pose.distance = Math.max(position.distanceTo(target), 0.01);
  lookMatrix.lookAt(position, target, up);
  pose.quaternion.setFromRotationMatrix(lookMatrix);
  pose.fov = fov;
  return pose;
}

export function copyPose(to, from) {
  to.position.copy(from.position);
  to.quaternion.copy(from.quaternion);
  to.target.copy(from.target);
  to.distance = from.distance;
  to.fov = from.fov;
  return to;
}

export function poseFromOrbit(pose, { target, distance, yaw, pitch, fov }) {
  const { dir } = orbitBasis(yaw, pitch);
  const position = target.clone().addScaledVector(dir, distance);
  return poseLookingAt(pose, position, target, fov);
}

/**
 * Finds the target and distance that make `points` fill the viewport minus `pad`
 * (fractions of the viewport per side) for a fixed orbit direction and field of view.
 */
export function fitFrame({ points, yaw, pitch, fov, aspect, pad }) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const tanH = tanV * aspect;
  const { dir, right, up } = orbitBasis(yaw, pitch);
  const forward = dir.clone().negate();
  const target = new THREE.Vector3();
  points.forEach((p) => target.add(p));
  target.divideScalar(points.length);
  const want = {
    cx: pad.left - pad.right,
    cy: pad.bottom - pad.top,
    w: 2 - 2 * (pad.left + pad.right),
    h: 2 - 2 * (pad.top + pad.bottom),
  };
  const rel = new THREE.Vector3();
  const eye = new THREE.Vector3();
  let distance = START_DISTANCE;
  for (let i = 0; i < FIT_ITERATIONS; i += 1) {
    eye.copy(target).addScaledVector(dir, distance);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    points.forEach((p) => {
      rel.copy(p).sub(eye);
      const depth = rel.dot(forward);
      const x = rel.dot(right) / (depth * tanH);
      const y = rel.dot(up) / (depth * tanV);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    const scale = Math.min(want.w / (maxX - minX), want.h / (maxY - minY));
    target.addScaledVector(right, ((minX + maxX) / 2 - want.cx) * distance * tanH);
    target.addScaledVector(up, ((minY + maxY) / 2 - want.cy) * distance * tanV);
    distance /= scale;
  }
  return { target, distance };
}
