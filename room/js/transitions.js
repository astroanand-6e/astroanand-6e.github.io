// Leaving the room: the camera flies to a focus pose (top-down on the decks, or into the MacBook screen),
// the page veils to its background, then the browser navigates. Escape or the back button cancels.
import * as THREE from 'three';
import { createPose, poseLookingAt } from './frame.js';
import { easeInOutCubic } from './ease.js';
import { ROUTES } from './routes.js';

const FOCUS_FOV = 18;
// Chassis footprint of the DJ controller figure (js/objects/ddj-flx4.js), top surface height.
const FLX4 = Object.freeze({ w: 4.83, d: 2.72, top: 0.62 });
const DECKS_FILL = Object.freeze({ width: 0.88, height: 0.82 });
const SCREEN_OVERSCAN = 1.05;
const FLIGHT_S = Object.freeze({ decks: 1.25, game: 1.5 });
const HOLD_MS = 140;
const RETURN_KEY = 'room:from';
const TONES = Object.freeze({ decks: 'paper', game: 'screen' });
const DESTINATION = Object.freeze({ decks: ROUTES.decks, game: ROUTES.game });

const tanHalf = (fov) => Math.tan(THREE.MathUtils.degToRad(fov) / 2);

function decksPose(world, camera) {
  const holder = world.gear.holders.flx4;
  holder.updateWorldMatrix(true, false);
  const center = holder.localToWorld(new THREE.Vector3(0, FLX4.top, 0));
  const back = new THREE.Vector3(0, 0, -1).transformDirection(holder.matrixWorld);
  const tanV = tanHalf(FOCUS_FOV);
  const distance = Math.max(
    FLX4.w / 2 / (DECKS_FILL.width * tanV * camera.aspect),
    FLX4.d / 2 / (DECKS_FILL.height * tanV),
  );
  const position = center.clone().add(new THREE.Vector3(0, distance, 0));
  return poseLookingAt(createPose(), position, center, FOCUS_FOV, back);
}

function screenPose(world, camera) {
  const mesh = world.gear.screenMesh;
  mesh.updateWorldMatrix(true, false);
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const center = mesh.localToWorld(box.getCenter(new THREE.Vector3()));
  const facing = new THREE.Vector3(0, -1, 0).transformDirection(mesh.matrixWorld);
  const up = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
  const tanV = tanHalf(FOCUS_FOV);
  const distance = Math.max(size.x / 2 / (tanV * camera.aspect), size.z / 2 / tanV) / SCREEN_OVERSCAN;
  return poseLookingAt(createPose(), center.clone().addScaledVector(facing, distance), center, FOCUS_FOV, up);
}

export function createTransitions({ rig, world, camera, ui, interaction, lock }) {
  let kind = null;
  let token = 0;
  let isLeaving = false;

  const poseFor = (which) => (which === 'decks' ? decksPose(world, camera) : screenPose(world, camera));

  function remember(which) {
    try { sessionStorage.setItem(RETURN_KEY, which); } catch (error) { /* private mode: no return flight */ }
  }

  function navigate(which) {
    isLeaving = true;
    remember(which);
    window.location.assign(DESTINATION[which]);
  }

  /** Fly in, hold a beat, veil the page, leave. */
  async function enter(which) {
    if (kind) return;
    kind = which;
    const mine = ++token;
    lock(true);
    ui.hideHint();
    ui.showBack(true, cancel);
    const finished = await rig.flyTo(poseFor(which), { duration: FLIGHT_S[which], ease: easeInOutCubic });
    if (!finished || mine !== token) return;
    await ui.wait(HOLD_MS);
    if (mine !== token) return;
    await ui.cover(TONES[which]);
    if (mine !== token) return;
    navigate(which);
  }

  /** Back to the overview from a focus (Escape or the back button). */
  async function cancel() {
    if (!kind || isLeaving) return;
    token += 1;
    kind = null;
    ui.showBack(false);
    ui.uncover();
    await rig.release({ duration: 0.9 });
    lock(false);
  }

  /** Arriving from another page (or restored from the back-forward cache): pull back from where we left. */
  async function returnFrom(which) {
    ui.cover(TONES[which], { instant: true });
    rig.apply(poseFor(which));
    rig.setMode('hold');
    lock(true);
    await ui.wait(60);
    ui.uncover();
    await rig.release({ duration: 1.25, ease: easeInOutCubic });
    lock(false);
  }

  function readReturn() {
    try {
      const which = sessionStorage.getItem(RETURN_KEY);
      sessionStorage.removeItem(RETURN_KEY);
      return which === 'decks' || which === 'game' ? which : null;
    } catch (error) {
      return null;
    }
  }

  /** After a bfcache restore the page is still focused on whatever we flew into. */
  function reset() {
    isLeaving = false;
    token += 1;
    const which = kind;
    kind = null;
    ui.showBack(false);
    if (which) returnFrom(which);
    else ui.uncover({ instant: true });
  }

  return { enter, cancel, reset, returnFrom, readReturn, poseFor, isBusy: () => kind !== null };
}
