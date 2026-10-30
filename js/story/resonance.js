/**
 * Theme resonance. The theme reveal (css/base.css) is the wavefront; this adds
 * what it sets ringing: sakura ripples trailing it from the crossfader, and a
 * small damped kick on each visible block at the moment the front reaches it,
 * pushed away from the switch. A 'theme-wave' event lets the 3D stage bounce
 * in time. Runs only inside a view transition, so reduced motion never sees it.
 */

// Must match the reveal in css/base.css: easing curve and final radius overshoot.
const REVEAL_EASE = [0.45, 0, 0.25, 1];
const FRONT_OVERSHOOT = 1.45;
const EASE_SAMPLES = 120;

const RING_COUNT = 3;
const RING_STAGGER_MS = 110;
const RING_DURATION_FACTOR = 1.25;
const RING_PEAK_OPACITY = 0.55;

const KICK_PX = 3;
const KICK_MS = 620;
// Damped oscillation along the push direction, like a struck string settling.
const KICK_SHAPE = [0, 1, -0.55, 0.25, -0.08, 0];
const KICK_OFFSETS = [0, 0.16, 0.4, 0.64, 0.84, 1];
const MAX_RESONATORS = 60;
const RESONATOR_SELECTOR = [
  '.topbar a', '.topbar button', '.rail a',
  'main h1', 'main h2', 'main h3', 'main p', 'main figure', 'main picture',
  'main ul', 'main dl', 'main button', 'main a',
].join(', ');

function cubic(s, a, b) {
  return 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
}

const [X1, Y1, X2, Y2] = REVEAL_EASE;
const EASE_TABLE = Array.from({ length: EASE_SAMPLES + 1 }, (_, i) => {
  const s = i / EASE_SAMPLES;
  return { progress: cubic(s, X1, X2), radius: cubic(s, Y1, Y2) };
});

/** Time (0..1 of the reveal) at which the front reaches `fraction` of its final radius. */
function progressAt(fraction) {
  const hit = EASE_TABLE.find((point) => point.radius >= fraction);
  return hit ? hit.progress : 1;
}

function arrivalMs(distance, reach, durationMs) {
  return progressAt(distance / (reach * FRONT_OVERSHOOT)) * durationMs;
}

function centreOf(el) {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, box };
}

function isOnScreen(box) {
  return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0
    && box.top < window.innerHeight && box.left < window.innerWidth;
}

/** Visible blocks, outermost only, so nested elements don't double-kick. */
function pickResonators() {
  const visible = [...document.querySelectorAll(RESONATOR_SELECTOR)]
    .filter((el) => isOnScreen(el.getBoundingClientRect()));
  const chosen = new Set(visible);
  const outermost = visible.filter((el) => {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (chosen.has(parent)) return false;
    }
    return true;
  });
  return outermost.slice(0, MAX_RESONATORS);
}

function kick(el, origin, reach, durationMs) {
  const { x, y } = centreOf(el);
  const dx = x - origin.x;
  const dy = y - origin.y;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  const frames = KICK_SHAPE.map((k, i) => ({
    translate: `${(ux * k * KICK_PX).toFixed(2)}px ${(uy * k * KICK_PX).toFixed(2)}px`,
    offset: KICK_OFFSETS[i],
  }));
  return el.animate(frames, { duration: KICK_MS, delay: arrivalMs(distance, reach, durationMs), easing: 'ease-in-out' });
}

function ripple(origin, reach, durationMs) {
  const layer = document.createElement('div');
  layer.className = 'theme-ripple';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--rip-x', `${origin.x}px`);
  layer.style.setProperty('--rip-y', `${origin.y}px`);
  layer.style.setProperty('--rip-d', `${Math.ceil(reach * 2)}px`);
  const animations = Array.from({ length: RING_COUNT }, (_, i) => {
    const ring = document.createElement('i');
    layer.append(ring);
    return ring.animate([
      { transform: 'translate(-50%, -50%) scale(0.02)', opacity: 0 },
      { opacity: RING_PEAK_OPACITY, offset: 0.12 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
    ], {
      duration: durationMs * RING_DURATION_FACTOR,
      delay: i * RING_STAGGER_MS,
      easing: `cubic-bezier(${REVEAL_EASE.join(', ')})`,
      fill: 'both',
    });
  });
  document.body.append(layer);
  Promise.all(animations.map((a) => a.finished)).catch(() => {}).finally(() => layer.remove());
  return { animations, layer };
}

function emitStageWave(origin, reach, durationMs) {
  const slot = [...document.querySelectorAll('[data-stage-slot]')]
    .map(centreOf)
    .find(({ box }) => isOnScreen(box));
  if (!slot) return;
  const distance = Math.hypot(slot.x - origin.x, slot.y - origin.y);
  window.dispatchEvent(new CustomEvent('theme-wave', { detail: { delayMs: arrivalMs(distance, reach, durationMs) } }));
}

/**
 * Starts the resonance for one theme switch. Returns a handle whose cancel()
 * stops everything, used when the switch is clicked again mid-wave.
 */
export function resonate({ origin, reach, durationMs }) {
  const kicks = pickResonators().map((el) => kick(el, origin, reach, durationMs));
  const rings = ripple(origin, reach, durationMs);
  emitStageWave(origin, reach, durationMs);
  return {
    cancel() {
      kicks.forEach((a) => a.cancel());
      rings.animations.forEach((a) => a.cancel());
      rings.layer.remove();
    },
  };
}
