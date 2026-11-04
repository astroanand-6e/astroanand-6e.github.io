// Perspective camera with a fitted 3/4 overview, clamped look-around, pointer drift and eased flights.
import * as THREE from 'three';
import { CriticalSpring } from '../../js/stage/motion.js';
import { ROOM } from './config.js';
import { copyPose, createPose, fitFrame, poseLookingAt } from './frame.js';
import { easeInOutCubic, lerp } from './ease.js';

const deg = THREE.MathUtils.degToRad;
const LOOK_SMOOTH_S = 0.3;
const DRIFT_SMOOTH_S = 0.55;
const MAX_LOOK_YAW = deg(25);
const MAX_LOOK_PITCH = deg(6);
const DRIFT_YAW = deg(1.8);
const DRIFT_PITCH = deg(1);
const TALL_ASPECT = 0.95;
const NEAR = 0.3;
const FAR = 700;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function roomPoints() {
  const { x0, x1, z0, z1, height, wall, slab } = ROOM;
  const lx = x0 - wall;
  const bz = z0 - wall;
  return [
    V(lx, -slab, bz), V(x1, -slab, bz), V(x1, -slab, z1), V(lx, -slab, z1),
    V(lx, height, bz), V(x1, height, bz), V(lx, height, z1),
  ];
}

// Portrait screens crop to the desk, the window above it and the floor in front.
function deskPoints() {
  const x = [-13.5, 5];
  const y = [0, 24.5];
  const z = [-15.5, -1];
  return x.flatMap((px) => y.flatMap((py) => z.map((pz) => V(px, py, pz))));
}

const VIEWS = {
  wide: { yaw: deg(38), pitch: deg(30), fov: 24, pad: { top: 0.085, bottom: 0.06, left: 0.035, right: 0.035 }, points: roomPoints },
  tall: { yaw: deg(27), pitch: deg(35), fov: 30, pad: { top: 0.085, bottom: 0.08, left: 0.02, right: 0.02 }, points: deskPoints },
};

export function createCameraRig({ camera, reducedMotion = false }) {
  const lookYaw = new CriticalSpring(0, LOOK_SMOOTH_S);
  const lookPitch = new CriticalSpring(0, LOOK_SMOOTH_S);
  const driftX = new CriticalSpring(0, DRIFT_SMOOTH_S);
  const driftY = new CriticalSpring(0, DRIFT_SMOOTH_S);
  const scratch = createPose();
  const lastPose = createPose();
  const dir = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const flight = { t: 1, duration: 1, from: createPose(), to: createPose(), ease: easeInOutCubic, arc: 0, resolve: null };
  const state = { mode: 'overview', overview: null, override: null, reduced: reducedMotion };

  function apply(pose) {
    camera.position.copy(pose.position);
    camera.quaternion.copy(pose.quaternion);
    if (Math.abs(camera.fov - pose.fov) > 1e-4) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    if (pose !== lastPose) copyPose(lastPose, pose);
  }

  function orbit(pose, view, yaw, pitch) {
    dir.set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    eye.copy(view.target).addScaledVector(dir, view.distance);
    return poseLookingAt(pose, eye, view.target, view.fov);
  }

  function resize(width, height) {
    const aspect = width / height;
    camera.aspect = aspect;
    const config = aspect < TALL_ASPECT ? VIEWS.tall : VIEWS.wide;
    const fit = fitFrame({ points: config.points(), yaw: config.yaw, pitch: config.pitch, fov: config.fov, aspect, pad: config.pad });
    state.overview = { ...fit, yaw: config.yaw, pitch: config.pitch, fov: config.fov };
    camera.updateProjectionMatrix();
    if (state.mode === 'overview' && !state.override) apply(orbit(scratch, state.overview, config.yaw, config.pitch));
  }

  const overviewPose = (out = createPose()) => orbit(out, state.overview, state.overview.yaw, state.overview.pitch);
  const currentPose = (out = createPose()) => {
    copyPose(out, lastPose);
    out.position.copy(camera.position);
    out.quaternion.copy(camera.quaternion);
    out.fov = camera.fov;
    return out;
  };

  function flyTo(pose, { duration = 1.2, ease = easeInOutCubic, arc = 0 } = {}) {
    if (flight.resolve) flight.resolve(false);
    copyPose(flight.to, pose);
    currentPose(flight.from);
    Object.assign(flight, { t: 0, duration: state.reduced ? 0 : duration, ease, arc });
    state.mode = 'flight';
    return new Promise((resolve) => {
      flight.resolve = resolve;
      if (flight.duration === 0) stepFlight(0);
    });
  }

  // The camera glides between look-at points: target eases, distance eases in log space (a steady zoom
  // feel) and the orientation slerps, so the subject stays in frame instead of the camera cutting corners.
  function stepFlight(dt) {
    flight.t = flight.duration === 0 ? 1 : Math.min(1, flight.t + dt / flight.duration);
    const e = flight.ease(flight.t);
    const { from, to } = flight;
    scratch.target.lerpVectors(from.target, to.target, e);
    scratch.distance = Math.exp(lerp(Math.log(from.distance), Math.log(to.distance), e));
    scratch.quaternion.slerpQuaternions(from.quaternion, to.quaternion, e);
    scratch.fov = lerp(from.fov, to.fov, e);
    forward.set(0, 0, -1).applyQuaternion(scratch.quaternion);
    scratch.position.copy(scratch.target).addScaledVector(forward, -scratch.distance);
    scratch.position.y += flight.arc * Math.sin(Math.PI * e);
    apply(scratch);
    if (flight.t < 1) return;
    state.mode = 'hold';
    const done = flight.resolve;
    flight.resolve = null;
    if (done) done(true);
  }

  /** Back to the overview from wherever the camera is. */
  function release(options) {
    return flyTo(overviewPose(), options).then((finished) => {
      if (finished) state.mode = 'overview';
      return finished;
    });
  }

  function update(dt) {
    if (state.override) {
      state.override(dt);
      return;
    }
    if (state.mode === 'flight') {
      stepFlight(dt);
      return;
    }
    if (state.mode === 'hold') return;
    [lookYaw, lookPitch, driftX, driftY].forEach((s) => s.step(dt));
    const o = state.overview;
    apply(orbit(scratch, o, o.yaw + lookYaw.value + driftX.value * DRIFT_YAW, o.pitch + lookPitch.value + driftY.value * DRIFT_PITCH));
  }

  return {
    camera,
    resize,
    update,
    apply,
    flyTo,
    release,
    overviewPose,
    currentPose,
    mode: () => state.mode,
    setMode: (mode) => { state.mode = mode; },
    setOverride: (fn) => { state.override = fn; },
    look(dYaw, dPitch) {
      lookYaw.target = THREE.MathUtils.clamp(lookYaw.target + dYaw, -MAX_LOOK_YAW, MAX_LOOK_YAW);
      lookPitch.target = THREE.MathUtils.clamp(lookPitch.target + dPitch, -MAX_LOOK_PITCH, MAX_LOOK_PITCH);
    },
    drift(nx, ny) {
      if (state.reduced) return;
      driftX.target = THREE.MathUtils.clamp(nx, -1, 1);
      driftY.target = THREE.MathUtils.clamp(-ny, -1, 1);
    },
    setReducedMotion(value) { state.reduced = value; },
    near: NEAR,
    far: FAR,
  };
}
