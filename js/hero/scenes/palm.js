/* Palm: during a slow push-in his right arm swings up from his side into the open palm (the ChatGPT
   raise frames, in-betweens warped by optical flow, fx/pose-flow.js). A small red ember gathers in
   the palm and swells, then a rift opens from it and swallows the frame. */
import { EYE_X_PCT, EYE_Y_PCT, PALM_X_PCT, PALM_Y_PCT, PUSH_INTRO, PUSH_PALM, RAISE_FLOW } from '../config.js';
import { createEyeFire } from '../fx/eye-fire.js';
import { createPortal } from '../fx/portal.js';
import { createPoseFlow } from '../fx/pose-flow.js';
import { DEFAULT_OPTS, beat, easeInOut, easeIn, easeOut, fade, holdUntil, qs, qsa, setAnchor, span, track } from '../timeline-utils.js';

export const DURATION = 13;
/* The push frames face and palm together: it scales about the point halfway between his eyes and
   the palm and nudges the frame down, so his hair stays in shot at every aspect ratio. */
const PALM_SHIFT_Y_PCT = 21;
const FRAME_Y_PCT = (EYE_Y_PCT + PALM_Y_PCT) / 2;
const PORTAL_CENTER = Object.freeze({ x: 0.5, y: 0.55 });
/* streak: 0, as in eyes.js - the anamorphic streak is wide enough at this canvas's designed width
   (2x fig-w, css/hero.css) to read as a bar across the whole face rather than a glint on the eyes
   (docs/PALM-EYES.md). */
const EYE_FIRE_START = Object.freeze({ x: 0.5, y: 0.5, streak: 0 });
const PUSH = Object.freeze({ at: 1, for: 7 });
const DIVE = Object.freeze({ at: 9.4, for: 3 });
const EMBER = Object.freeze({ at: 3.4, for: 5.8 });
const PORTAL = Object.freeze({ at: 9.2, for: 3.3 });
const DIVE_SCALE = 1.5;
/* The arm raise (stand -> in-betweens -> palm), finishing just as the ember gathers in the palm. */
const RAISE = Object.freeze({ at: 1.9, for: 1.7 });

/* The ember: a slow gather that breathes a little, sized by the camera it sits inside. */
function createEmber(el) {
  return {
    render(p) {
      const grow = easeOut(Math.min(1, p * 1.6));
      const breathe = 1 + 0.06 * Math.sin(p * Math.PI * 6);
      el.style.opacity = Math.min(1, p * 3).toFixed(3);
      el.style.transform = `translate(-50%, -50%) scale(${(0.2 + 0.8 * grow * breathe).toFixed(3)})`;
    },
  };
}

/* Camera: a push toward the palm, then a dive into the rift. */
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
  const ember = createEmber(qs(el, '.hx-ember'));
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
  });
  /* The canvas draws every pose once the raise starts; the stand <img> covers p = 0. */
  track(tl, RAISE.at, RAISE.for, (p) => {
    pose.render(p);
    standImg.style.opacity = p > 0 ? '0' : '1';
  }, 'none');

  track(tl, EMBER.at, EMBER.for, ember.render, 'none');
  beat(tl, beatEl, 4.2, 9.2);
  track(tl, PORTAL.at, PORTAL.for, portal.render, 'power2.inOut');
  fade(tl, fig, 0, 11.6, 0.8);
  tl.set(el, { opacity: 0 }, DURATION);
  holdUntil(tl, DURATION);
  return { fx: [fire, portal, pose], gl: [portal] };
}
