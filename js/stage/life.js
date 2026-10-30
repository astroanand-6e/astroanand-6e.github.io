import * as THREE from 'three';
import { CriticalSpring } from './motion.js';

const MAX_YAW = THREE.MathUtils.degToRad(4);
const MAX_PITCH = THREE.MathUtils.degToRad(2);
const PARALLAX_SMOOTH_SECONDS = 0.45;
const FLOAT_FRACTION = 0.005;
const FLOAT_RADIANS_PER_SECOND = 1.15;
// Theme-switch resonance: a damped bounce when the wavefront reaches the stage.
const KICK_FRACTION = 0.014;
const KICK_RADIANS_PER_SECOND = 15;
const KICK_DECAY_PER_SECOND = 5.5;
const KICK_SECONDS = 1.2;

/**
 * Idle life: pointer parallax (camera yaw +-4deg, pitch +-2deg through a
 * spring) and a slow float bob worth 0.5% of the object's size. Both are
 * disabled when reduced motion is requested.
 */
export function createLife() {
  const yaw = new CriticalSpring(0, PARALLAX_SMOOTH_SECONDS);
  const pitch = new CriticalSpring(0, PARALLAX_SMOOTH_SECONDS);
  const out = { yaw: 0, pitch: 0 };

  function onMove(event) {
    if (event.pointerType === 'touch') return;
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = (event.clientY / window.innerHeight) * 2 - 1;
    yaw.target = THREE.MathUtils.clamp(x, -1, 1) * MAX_YAW;
    pitch.target = THREE.MathUtils.clamp(-y, -1, 1) * MAX_PITCH;
  }

  function onLeave() {
    yaw.target = 0;
    pitch.target = 0;
  }

  let kickAt = -Infinity;
  function onWave(event) {
    kickAt = performance.now() + ((event.detail && event.detail.delayMs) || 0);
  }

  function kickOffset(size) {
    const since = (performance.now() - kickAt) / 1000;
    if (since <= 0 || since >= KICK_SECONDS) return 0;
    return -Math.sin(since * KICK_RADIANS_PER_SECOND) * Math.exp(-since * KICK_DECAY_PER_SECOND) * size * KICK_FRACTION;
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('theme-wave', onWave);

  return {
    /** Returns { yaw, pitch } in radians (a reused object). */
    parallax(dt, isReducedMotion) {
      if (isReducedMotion) {
        yaw.snap(0);
        pitch.snap(0);
      } else {
        yaw.step(dt);
        pitch.step(dt);
      }
      out.yaw = yaw.value;
      out.pitch = pitch.value;
      return out;
    },
    /** Vertical bob offset (scene units) for an object of the given size. */
    bob(time, size, isReducedMotion) {
      if (isReducedMotion) return 0;
      return Math.sin(time * FLOAT_RADIANS_PER_SECOND) * size * FLOAT_FRACTION + kickOffset(size);
    },
    dispose() {
      window.removeEventListener('theme-wave', onWave);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    },
  };
}
