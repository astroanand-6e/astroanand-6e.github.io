import * as THREE from 'three';
import { STATIONS, importStation } from './stations.js';

const FOCUS_PADDING = 1.08;
const FADE_INNER = 6;
const FADE_OUTER = 11;
const MIN_VISIBLE_SCALE = 0.02;

function boxCorners(box) {
  const { min, max } = box;
  return [min.x, max.x].flatMap((x) =>
    [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => new THREE.Vector3(x, y, z))),
  );
}

/**
 * Lazily imports station modules and mounts them. Each station is
 * wrapper (world slot) > pivot (drag yaw) > floater (idle bob) > object.
 * A failed import is remembered, and only retry() tries it again, so a file
 * that appears later is picked up when its chapter becomes active.
 */
export function createStationLoader({ scene, ctx, partSystem, labels, shadows, isReduced }) {
  const records = new Map();
  const loading = new Set();
  const failed = new Set();
  const attempts = new Map();
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();
  let isDisposed = false;

  function mount(index, obj) {
    const def = STATIONS[index];
    const wrapper = new THREE.Group();
    wrapper.position.set(...def.position);
    const pivot = new THREE.Group();
    const floater = new THREE.Group();
    floater.add(obj.group);
    pivot.add(floater);
    wrapper.add(pivot);
    scene.add(wrapper);
    wrapper.updateMatrixWorld(true);

    // Bounds are taken from the assembled pose, before parts are exploded.
    box.setFromObject(obj.group).getBoundingSphere(sphere);
    const center = sphere.center.clone().sub(wrapper.position);
    const radius = sphere.radius * FOCUS_PADDING;
    const footprint = box.clone().translate(wrapper.position.clone().negate());
    shadows.add(pivot, footprint);
    const corners = boxCorners(footprint);

    partSystem.register(def.id, obj.parts || [], pivot, {
      exploded: partSystem.isExploded() || !isReduced(),
    });
    labels.setStation(def.id, obj.anchors || []);
    const record = {
      def,
      index,
      obj,
      wrapper,
      pivot,
      floater,
      focus: { center, radius, corners },
      hasIntro: false,
      labelsReadyAt: Infinity,
    };
    records.set(def.id, record);
  }

  async function load(index) {
    const def = STATIONS[index];
    loading.add(def.id);
    try {
      const mod = await importStation(def, attempts.get(def.id) || 0);
      if (!isDisposed) mount(index, mod.create(ctx));
    } catch (error) {
      failed.add(def.id);
      attempts.set(def.id, (attempts.get(def.id) || 0) + 1);
      window.dispatchEvent(new CustomEvent('stage-error', { detail: { id: def.id, error } }));
    } finally {
      loading.delete(def.id);
    }
  }

  function isIdle(def) {
    return def && !records.has(def.id) && !loading.has(def.id);
  }

  return {
    records,
    /** Loads a station once; stations that failed wait for retry(). */
    ensure(index) {
      const def = STATIONS[index];
      if (isIdle(def) && !failed.has(def.id)) load(index);
    },
    /** Forces another attempt at a station whose module was missing or broken. */
    retry(index) {
      const def = STATIONS[index];
      if (!isIdle(def) || !failed.has(def.id)) return;
      failed.delete(def.id);
      load(index);
    },
    /**
     * Specimens materialise as the camera nears them and shrink away as it
     * leaves; presence (0..1) scales them all, so the index chapter shows none.
     */
    updateVisibility(cameraFocus, worldCenter, presence = 1) {
      records.forEach((record) => {
        worldCenter.copy(record.wrapper.position).add(record.focus.center);
        const reach = worldCenter.distanceTo(cameraFocus);
        const scale = (1 - THREE.MathUtils.smoothstep(reach, FADE_INNER, FADE_OUTER)) * presence;
        record.wrapper.visible = scale > MIN_VISIBLE_SCALE;
        record.wrapper.scale.setScalar(Math.max(scale, MIN_VISIBLE_SCALE));
      });
    },
    dispose() {
      isDisposed = true;
      records.forEach(({ def, obj, wrapper }) => {
        partSystem.unregister(def.id);
        scene.remove(wrapper);
        obj.dispose();
      });
      records.clear();
    },
  };
}
