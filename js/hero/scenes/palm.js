/* Palm: a slow push-in hides the pose change from stand to palm. Four tool icons rise out of
   the palm and orbit in a tilted ring with a thin red halo, then a rift opens from the palm
   and swallows the frame. */
import { EYE_X_PCT, EYE_Y_PCT, PALM_X_PCT, PALM_Y_PCT, PUSH_INTRO, PUSH_PALM } from '../config.js';
import { createEyeFire } from '../fx/eye-fire.js';
import { createPortal } from '../fx/portal.js';
import { DEFAULT_OPTS, beat, easeOut, fade, figW, holdUntil, qs, qsa, setAnchor, track } from '../timeline-utils.js';

export const DURATION = 10;
const ORBIT_TILT = 0.32;
const ORBIT_ROLL = -0.2;
const ORBIT_RADIUS = 0.36;
const ORBIT_LIFT = 0.44;
const ORBIT_TURNS = 2.25;
const PALM_SHIFT_Y_PCT = 4;
const PORTAL_CENTER = Object.freeze({ x: 0.5, y: 0.44 });
const TAU = Math.PI * 2;
const EYE_FIRE_START = Object.freeze({ x: 0.5, y: 0.5 });

function createOrbit(el) {
  const icons = qsa(el, '.hx-icon');
  const halos = qsa(el, '.hx-halo');
  const state = { rise: 0, spin: 0 };
  const rotate = (x, y) => ({ x: x * Math.cos(ORBIT_ROLL) - y * Math.sin(ORBIT_ROLL), y: x * Math.sin(ORBIT_ROLL) + y * Math.cos(ORBIT_ROLL) });
  function paint() {
    const rise = easeOut(state.rise);
    const radius = ORBIT_RADIUS * rise;
    const cy = -ORBIT_LIFT * rise;
    icons.forEach((icon, i) => {
      const theta = (i * TAU) / icons.length + state.spin;
      const depth = (Math.sin(theta) + 1) / 2;
      const pos = rotate(radius * Math.cos(theta), radius * ORBIT_TILT * Math.sin(theta));
      const s = (0.55 + 0.45 * depth) * rise;
      icon.style.transform = `translate(${figW(pos.x)}, ${figW(pos.y + cy)}) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      icon.style.opacity = (rise * (0.5 + 0.5 * depth)).toFixed(3);
      icon.style.zIndex = String(3 + Math.round(depth * 4));
    });
    halos.forEach((halo, i) => {
      const grow = 1.16 + i * 0.22;
      halo.style.width = figW(2 * radius * grow);
      halo.style.height = figW(2 * radius * ORBIT_TILT * grow);
      halo.style.transform = `translate(${figW(0)}, ${figW(cy)}) translate(-50%, -50%) rotate(${ORBIT_ROLL}rad)`;
      halo.style.opacity = (rise * (i === 0 ? 0.95 : 0.4)).toFixed(3);
    });
  }
  return {
    setRise(p) { state.rise = p; paint(); },
    setSpin(p) { state.spin = p * ORBIT_TURNS * TAU; paint(); },
  };
}

export function buildScene(tl, el, opts = DEFAULT_OPTS) {
  const fig = qs(el, '.hx-figure');
  const cam = qs(el, '.hx-cam');
  const palmImg = qs(el, '.hx-pose-palm');
  const beatEl = qs(el, '.hx-beat');
  setAnchor(fig, 'palm', PALM_X_PCT, PALM_Y_PCT);
  setAnchor(fig, 'eye', EYE_X_PCT, EYE_Y_PCT);

  const fire = createEyeFire(qs(el, '[data-fx="eye-fire"]'), [{ ...EYE_FIRE_START, scale: 1 }]);
  const portal = createPortal(qs(el, '[data-fx="portal"]'), { scale: opts.glScale, maxDpr: opts.maxDpr, center: PORTAL_CENTER, seconds: 3 });
  const orbit = createOrbit(el);

  tl.set(fig, { scale: PUSH_INTRO, transformOrigin: '50% 22%' }, 0);
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'none' }, 0);
  track(tl, 0.8, 1.6, (p) => fire.render(1 - p), 'power2.in');

  tl.fromTo(cam, { scale: 1, xPercent: 0, yPercent: 0, transformOrigin: `${PALM_X_PCT}% ${PALM_Y_PCT}%` },
    { scale: PUSH_PALM, xPercent: 50 - PALM_X_PCT, yPercent: PALM_SHIFT_Y_PCT, duration: 6, ease: 'power2.inOut' }, 1);
  tl.to(cam, { scale: PUSH_PALM * 1.5, duration: 2.8, ease: 'power2.in' }, 6.8);
  tl.fromTo(palmImg, { opacity: 0, '--wipe': 100 }, { opacity: 1, '--wipe': 0, duration: 1.3, ease: 'power1.inOut' }, 2.5);

  track(tl, 3.8, 2.2, orbit.setRise, 'power2.out');
  track(tl, 3.8, 5.8, orbit.setSpin, 'none');
  beat(tl, beatEl, 4.4, 7.4);
  track(tl, 6.7, 2.8, portal.render, 'power2.inOut');
  fade(tl, fig, 0, 8.6, 0.8);
  tl.set(el, { opacity: 0 }, DURATION);
  holdUntil(tl, DURATION);
  return { fx: [fire, portal], gl: [portal] };
}
