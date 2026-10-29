import * as THREE from 'three';
import { BouncySpring } from './motion.js';

const EXPLODE_STAGGER_S = 0.045;
const EXPLODE_SPREAD_S = 0.7;
const ASSEMBLE_STAGGER_S = 0.03;
const ASSEMBLE_SPREAD_S = 0.8;
const SPRING_SETTLE_S = 0.5;
const DEFAULT_LIFT = 1.4;
const ROTATION_AMPLITUDE = 0.34;
const ROTATION_SIZE_DAMP = 0.12;
const TILT_SHARE = 0.35;

function toVector3(value) {
  if (!value) return null;
  return Array.isArray(value) ? new THREE.Vector3(...value) : value.clone();
}

/** Helper handed to object modules as ctx.parts. */
export const partApi = {
  /** Tag an Object3D as an explodable part. explode may be Vector3 or [x,y,z]. */
  mark(object, { explode, label, home } = {}) {
    object.userData.home = toVector3(home) || object.position.clone();
    const offset = toVector3(explode);
    if (offset) object.userData.explode = offset;
    if (label) object.userData.label = label;
    return object;
  },
};

function defaultExplode(home) {
  const outward = new THREE.Vector3(home.x, 0, home.z);
  if (outward.lengthSq() > 1e-6) outward.normalize().multiplyScalar(1.2);
  return outward.setY(DEFAULT_LIFT);
}

const unit = (n) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** Deterministic small tilt per part; big parts turn less so they stay in frame. */
function explodeRotation(index, radius) {
  const amp = ROTATION_AMPLITUDE / (1 + ROTATION_SIZE_DAMP * radius);
  const signed = (seed) => (unit(index * 3.17 + seed) - 0.5) * 2 * amp;
  return new THREE.Vector3(signed(1) * TILT_SHARE, signed(7), signed(13) * TILT_SHARE);
}

/**
 * Owns explode/rebuild springs for every registered station's parts. Offsets
 * are position and a small rotation; rotation is applied as a removable delta
 * (beginFrame strips it, update re-adds it) so object modules that spin parts
 * themselves keep working.
 */
export function createPartSystem() {
  const stations = new Map();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const probe = new THREE.Box3();
  const size = new THREE.Vector3();
  const world = new THREE.Vector3();
  const delta = new THREE.Vector3();
  let exploded = false;
  let clock = 0;

  function register(id, partList, pivot, { exploded: startExploded = exploded } = {}) {
    pivot.updateWorldMatrix(true, true);
    const entries = partList.map((part, index) => {
      if (!part.userData.home) part.userData.home = part.position.clone();
      if (!part.userData.explode) part.userData.explode = defaultExplode(part.userData.home);
      probe.setFromObject(part).getSize(size);
      part.getWorldPosition(world);
      return {
        part,
        height: world.y,
        spring: new BouncySpring(startExploded ? 1 : 0),
        rotation: explodeRotation(index, size.length() / 2),
        applied: new THREE.Vector3(),
        rank: 0,
        startAt: 0,
        goal: startExploded ? 1 : 0,
        pending: false,
      };
    });
    [...entries].sort((a, b) => a.height - b.height).forEach((entry, rank) => {
      entry.rank = rank;
    });
    stations.set(id, { entries, pivot, partSet: new Set(partList) });
    entries.forEach((entry) => applyPosition(entry));
  }

  function unregister(id) {
    stations.delete(id);
  }

  function applyPosition({ part, spring }) {
    part.position.copy(part.userData.home).addScaledVector(part.userData.explode, spring.value);
  }

  function applyRotation(entry) {
    delta.copy(entry.rotation).multiplyScalar(entry.spring.value);
    entry.part.rotation.x += delta.x;
    entry.part.rotation.y += delta.y;
    entry.part.rotation.z += delta.z;
    entry.applied.copy(delta);
  }

  function schedule(entry, goal, offset, immediate) {
    entry.goal = goal;
    entry.startAt = clock + offset;
    entry.pending = true;
    if (!immediate) return;
    entry.spring.snap(goal);
    entry.pending = false;
    applyPosition(entry);
  }

  /** Explode (top parts first) or rebuild (bottom parts first), all stations. */
  function setExploded(next, { immediate = false, delay = 0 } = {}) {
    exploded = next;
    stations.forEach(({ entries }) => {
      const stagger = Math.min(EXPLODE_STAGGER_S, EXPLODE_SPREAD_S / entries.length);
      entries.forEach((entry) => {
        const order = next ? entries.length - 1 - entry.rank : entry.rank;
        schedule(entry, next ? 1 : 0, delay + order * stagger, immediate);
      });
    });
  }

  /**
   * Builds one station up from its exploded pose, bottom parts first.
   * Returns seconds until the last spring has effectively settled.
   */
  function assemble(id, { delay = 0 } = {}) {
    const station = stations.get(id);
    if (!station) return 0;
    const count = station.entries.length;
    const stagger = Math.min(ASSEMBLE_STAGGER_S, ASSEMBLE_SPREAD_S / Math.max(count, 1));
    station.entries.forEach((entry) => schedule(entry, 0, delay + entry.rank * stagger, false));
    return delay + Math.max(count - 1, 0) * stagger + SPRING_SETTLE_S;
  }

  /** Call before objects update: strips last frame's rotation offsets. */
  function beginFrame() {
    stations.forEach(({ entries }) => {
      entries.forEach(({ part, applied }) => {
        if (applied.x === 0 && applied.y === 0 && applied.z === 0) return;
        part.rotation.x -= applied.x;
        part.rotation.y -= applied.y;
        part.rotation.z -= applied.z;
        applied.set(0, 0, 0);
      });
    });
  }

  function update(dt) {
    clock += dt;
    stations.forEach(({ entries }) => {
      entries.forEach((entry) => {
        if (entry.pending && clock >= entry.startAt) {
          entry.spring.target = entry.goal;
          entry.pending = false;
        }
        if (entry.spring.isSettled && !entry.pending) {
          if (entry.spring.value !== entry.spring.target) {
            entry.spring.snap();
            applyPosition(entry);
          }
        } else {
          entry.spring.step(dt);
          applyPosition(entry);
        }
        if (entry.spring.value !== 0) applyRotation(entry);
      });
    });
  }

  /** Returns the part under the pointer (canvas-local px) for station id, or null. */
  function pick(id, camera, x, y, width, height) {
    const station = stations.get(id);
    if (!station) return null;
    ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(station.pivot, true);
    for (const hit of hits) {
      if (hit.object.userData.isOutline || !hit.object.visible) continue;
      for (let node = hit.object; node && node !== station.pivot; node = node.parent) {
        if (station.partSet.has(node)) return node;
      }
      return null;
    }
    return null;
  }

  return {
    register,
    unregister,
    setExploded,
    assemble,
    beginFrame,
    update,
    pick,
    isExploded: () => exploded,
  };
}
