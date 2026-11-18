/* Palm: during a slow push-in his right arm swings up from his side into the open palm (Qwen
   in-betweens warped by optical flow, fx/pose-flow.js). Four tool icons rise out of
   the palm and orbit in a tilted ring with a thin red halo, then a rift opens from the palm
   and swallows the frame. */
import { EYE_X_PCT, EYE_Y_PCT, PALM_X_PCT, PALM_Y_PCT, PUSH_INTRO, PUSH_PALM, RAISE_FLOW } from '../config.js';
import { createEyeFire } from '../fx/eye-fire.js';
import { createPortal } from '../fx/portal.js';
import { createPoseFlow } from '../fx/pose-flow.js';
import { DEFAULT_OPTS, beat, easeInOut, easeIn, easeOut, fade, holdUntil, qs, qsa, setAnchor, span, track } from '../timeline-utils.js';

export const DURATION = 13;
const ORBIT_TILT = 0.22;
const ORBIT_ROLL = -0.2;
const ORBIT_RADIUS = 20; /* in --u units (1u = about 1svh); scales with the camera push (see unit() below) */
const ORBIT_LIFT = 20;
/* The raised hand sits a hand-width off his body, so the ring (centred above the palm) reaches behind his
   head and shoulder: it is drawn BEHIND the figure (css/hero.css .hx-orbit) like a ring around him, and
   never covers his face or coat. */
const ORBIT_SHIFT_X = 0;
const ORBIT_TURNS = 2.5;
/* The push frames face and palm together: it scales about the point halfway between his eyes and
   the palm and nudges the frame down, so his hair stays in shot at every aspect ratio. */
const PALM_SHIFT_Y_PCT = 21;
const FRAME_Y_PCT = (EYE_Y_PCT + PALM_Y_PCT) / 2;
const PORTAL_CENTER = Object.freeze({ x: 0.5, y: 0.55 });
const TAU = Math.PI * 2;
/* streak: 0, as in eyes.js - the anamorphic streak is wide enough at this canvas's designed width
   (2x fig-w, css/hero.css) to read as a bar across the whole face rather than a glint on the eyes
   (docs/PALM-EYES.md). */
const EYE_FIRE_START = Object.freeze({ x: 0.5, y: 0.5, streak: 0 });
const PUSH = Object.freeze({ at: 1, for: 7 });
const DIVE = Object.freeze({ at: 9.4, for: 3 });
const RISE = Object.freeze({ at: 3.4, for: 2.4 });
const SPIN = Object.freeze({ at: 3.4, for: 8 });
const PORTAL = Object.freeze({ at: 9.2, for: 3.3 });
const DIVE_SCALE = 1.5;
/* The arm raise (stand -> in-betweens -> palm), finishing just as the icons rise out of the palm. */
const RAISE = Object.freeze({ at: 1.9, for: 1.7 });

/* Icons and halo are sized in screen units, divided by the camera scale they sit inside. */
function createOrbit(el) {
  const icons = qsa(el, '.hx-icon');
  const halos = qsa(el, '.hx-halo');
  const state = { rise: 0, spin: 0, scale: PUSH_INTRO };
  /* Position/radius, NOT divided by the camera scale: the camera's own scale() transform (a parent
     of .hx-orbit) multiplies this back in, so the ring's radius and lift grow with the push-in just
     like the figure underneath it does, instead of staying a fixed screen size while the hand grows
     to meet it (docs/ORBIT-FRAMING.md - that mismatch is what let icons land on the hand/coat). */
  const unit = (n) => `calc(var(--u) * ${n.toFixed(4)})`;
  const rotate = (x, y) => ({ x: x * Math.cos(ORBIT_ROLL) - y * Math.sin(ORBIT_ROLL), y: x * Math.sin(ORBIT_ROLL) + y * Math.cos(ORBIT_ROLL) });
  function paint() {
    const rise = easeOut(state.rise);
    const radius = ORBIT_RADIUS * rise;
    const cy = -ORBIT_LIFT * rise;
    const cx = ORBIT_SHIFT_X * rise;
    icons.forEach((icon, i) => {
      const theta = (i * TAU) / icons.length + state.spin;
      const depth = (Math.sin(theta) + 1) / 2;
      const pos = rotate(radius * Math.cos(theta), radius * ORBIT_TILT * Math.sin(theta));
      const s = (0.7 + 0.3 * depth) * Math.min(1, rise * 1.6) / state.scale;
      icon.style.transform = `translate(${unit(pos.x + cx)}, ${unit(pos.y + cy)}) translate(-50%, -50%) scale(${s.toFixed(3)})`;
      icon.style.opacity = Math.min(1, rise * 2.5 * (0.6 + 0.4 * depth)).toFixed(3);
      icon.style.zIndex = String(3 + Math.round(depth * 4));
    });
    halos.forEach((halo, i) => {
      const grow = 1.18 + i * 0.24;
      halo.style.width = unit(2 * radius * grow);
      halo.style.height = unit(2 * radius * ORBIT_TILT * grow);
      halo.style.transform = `translate(${unit(cx)}, ${unit(cy)}) translate(-50%, -50%) rotate(${ORBIT_ROLL}rad)`;
      halo.style.opacity = (Math.min(1, rise * 2) * (i === 0 ? 0.95 : 0.4)).toFixed(3);
    });
  }
  return {
    setRise(p) { state.rise = p; paint(); },
    setSpin(p) { state.spin = p * ORBIT_TURNS * TAU; paint(); },
    setScale(s) { state.scale = s; paint(); },
  };
}

/* Camera: a push toward the palm, then a dive into the rift. One driver, so the icons can read the scale. */
function cameraScale(t) {
  const push = easeInOut(span(t, PUSH.at, PUSH.at + PUSH.for));
  const dive = easeIn(span(t, DIVE.at, DIVE.at + DIVE.for));
  return (1 + (PUSH_PALM - 1) * push) * (1 + (DIVE_SCALE - 1) * dive);
}

export function buildScene(tl, el, opts = DEFAULT_OPTS) {
  const fig = qs(el, '.hx-figure');
  const cam = qs(el, '.hx-cam');
  const standImg = qs(el, '.hx-pose-stand');
  const palmImg = qs(el, '.hx-pose-palm');
  const beatEl = qs(el, '.hx-beat');
  setAnchor(fig, 'palm', PALM_X_PCT, PALM_Y_PCT);
  setAnchor(fig, 'eye', EYE_X_PCT, EYE_Y_PCT);

  const fire = createEyeFire(qs(el, '[data-fx="eye-fire"]'), [{ ...EYE_FIRE_START, scale: 1 }]);
  const portal = createPortal(qs(el, '[data-fx="portal"]'), { scale: opts.glScale, maxDpr: opts.maxDpr, center: PORTAL_CENTER, seconds: PORTAL.for });
  const orbit = createOrbit(el);
  const frames = [standImg, ...qsa(el, '.hx-pose-src'), palmImg];
  const pose = createPoseFlow(qs(el, '[data-fx="pose-blend"]'), frames, RAISE_FLOW);

  tl.set(fig, { scale: PUSH_INTRO, transformOrigin: '50% 22%' }, 0);
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'none' }, 0);
  track(tl, 0.8, 1.6, (p) => fire.render(1 - p), 'power2.in');

  cam.style.transformOrigin = `${PALM_X_PCT}% ${FRAME_Y_PCT}%`;
  track(tl, 0, DURATION, (p) => {
    const t = p * DURATION;
    const shift = easeInOut(span(t, PUSH.at, PUSH.at + PUSH.for));
    const s = cameraScale(t);
    cam.style.transform = `translate(${((50 - PALM_X_PCT) * shift).toFixed(3)}%, ${(PALM_SHIFT_Y_PCT * shift).toFixed(3)}%) scale(${s.toFixed(4)})`;
    orbit.setScale(s * PUSH_INTRO);
  });
  /* The canvas draws every pose once the raise starts; the stand <img> covers p = 0. */
  track(tl, RAISE.at, RAISE.for, (p) => {
    pose.render(p);
    standImg.style.opacity = p > 0 ? '0' : '1';
  }, 'none');

  track(tl, RISE.at, RISE.for, orbit.setRise, 'power2.out');
  track(tl, SPIN.at, SPIN.for, orbit.setSpin, 'none');
  beat(tl, beatEl, 4.2, 9.2);
  track(tl, PORTAL.at, PORTAL.for, portal.render, 'power2.inOut');
  fade(tl, fig, 0, 11.6, 0.8);
  tl.set(el, { opacity: 0 }, DURATION);
  holdUntil(tl, DURATION);
  return { fx: [fire, portal, pose], gl: [portal] };
}
