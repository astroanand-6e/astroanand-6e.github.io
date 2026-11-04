// The walk-in: the camera starts outside the door at eye height, the door swings open, the camera walks
// through, then rises into the 3/4 overview. Any input skips to the end.
import * as THREE from 'three';
import { EYE_HEIGHT, DOOR, ROOM } from './config.js';
import { createPose, poseLookingAt } from './frame.js';
import { easeInOutCubic, easeInOutSine, smoothstep, lerp, clamp01 } from './ease.js';

const DURATION_S = 4.7;
const DOOR_OPEN_AT_S = 0.35;
const DOOR_SWING_S = 1.4;
// Once the visitor is inside, the door eases back toward ajar.
const DOOR_EASE_BACK_AT_S = 2.5;
const SKIP_GLIDE_S = 0.5;
const STEP_HZ = 1.75;
const BOB = Object.freeze({ lift: 0.1, sway: 0.05 });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const doorZ = DOOR.hingeZ + DOOR.w / 2;
const outside = ROOM.x0 - ROOM.wall;

// Position, look-at and field of view along the walk. The last key is the live overview pose.
const WALK = [
  { p: V(outside - 9.5, EYE_HEIGHT, doorZ), t: V(ROOM.x0 + 1, EYE_HEIGHT - 1.4, doorZ), fov: 56 },
  { p: V(outside - 1.6, EYE_HEIGHT, doorZ), t: V(-6, 11.5, -8), fov: 54 },
  { p: V(ROOM.x0 + 6.5, EYE_HEIGHT - 0.2, doorZ - 1.6), t: V(-1, 9.5, -9), fov: 47 },
  { p: V(-2, 24, 24), t: V(0, 8, -6), fov: 36 },
];

export function createIntro({ rig, door }) {
  const pose = createPose();
  const goal = createPose();
  let time = 0;
  let playing = false;
  let doorOpened = false;
  let doorEased = false;
  let resolve = null;
  let positionCurve = null;
  let targetCurve = null;

  function buildCurves() {
    rig.overviewPose(goal);
    const eye = goal.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(goal.quaternion);
    const aim = eye.clone().addScaledVector(dir, eye.distanceTo(V(0, 8, 0)));
    positionCurve = new THREE.CatmullRomCurve3([...WALK.map((k) => k.p), eye], false, 'centripetal');
    targetCurve = new THREE.CatmullRomCurve3([...WALK.map((k) => k.t), aim], false, 'centripetal');
  }

  function fovAt(u) {
    const keys = [...WALK.map((k) => k.fov), goal.fov];
    const f = u * (keys.length - 1);
    const i = Math.min(keys.length - 2, Math.floor(f));
    return lerp(keys[i], keys[i + 1], easeInOutSine(f - i));
  }

  function writePose() {
    const u = easeInOutCubic(clamp01(time / DURATION_S));
    const position = positionCurve.getPoint(u);
    const target = targetCurve.getPoint(u);
    const walking = 1 - smoothstep(0.3, 0.6, u);
    position.y += Math.sin(time * STEP_HZ * Math.PI * 2) * BOB.lift * walking;
    position.z += Math.cos(time * STEP_HZ * Math.PI) * BOB.sway * walking;
    poseLookingAt(pose, position, target, fovAt(u));
    rig.apply(pose);
  }

  function finish() {
    playing = false;
    rig.setOverride(null);
    rig.setMode('overview');
    if (resolve) resolve();
    resolve = null;
  }

  function tick(dt) {
    time += dt;
    if (!doorOpened && time >= DOOR_OPEN_AT_S) {
      doorOpened = true;
      door.set(1);
    }
    if (!doorEased && time >= DOOR_EASE_BACK_AT_S) {
      doorEased = true;
      door.set(DOOR.ajar);
    }
    writePose();
    if (time >= DURATION_S) finish();
  }

  /** Resolves when the intro ends, by time or by a skip. */
  function play() {
    buildCurves();
    time = 0;
    playing = true;
    doorOpened = false;
    doorEased = false;
    door.set(0, { immediate: true });
    rig.setOverride(tick);
    writePose();
    return new Promise((done) => { resolve = done; });
  }

  function skip() {
    if (!playing) return;
    playing = false;
    rig.setOverride(null);
    door.set(DOOR.ajar);
    rig.currentPose(pose);
    if (resolve) resolve();
    resolve = null;
    rig.flyTo(rig.overviewPose(), { duration: SKIP_GLIDE_S }).then((done) => { if (done) rig.setMode('overview'); });
  }

  /** Freezes the walk-in at `seconds` (used to inspect single frames). */
  function seek(seconds) {
    buildCurves();
    time = seconds;
    playing = true;
    resolve = null;
    const swing = seconds >= DOOR_EASE_BACK_AT_S + 0.6 ? DOOR.ajar : clamp01((seconds - DOOR_OPEN_AT_S) / DOOR_SWING_S);
    door.set(swing, { immediate: true });
    rig.setOverride(() => writePose());
    writePose();
  }

  return { play, skip, seek, isPlaying: () => playing };
}
