/* Intro: him standing in front of his name. Scrolling ignites his eyes (flare plus iris),
   while the camera pushes in slowly. buildScene(tl, el) only adds tweens to tl. */
import { EYE_X_PCT, EYE_Y_PCT, PUSH_INTRO } from '../config.js';
import { createEyeFire } from '../fx/eye-fire.js';
import { DEFAULT_OPTS, fade, holdUntil, qs, setAnchor, track } from '../timeline-utils.js';

export const DURATION = 10;
/* Light mode: the hero fades from light to dark over the first stretch of scroll. */
const LIGHTS_OUT_AT = 0.15;
const LIGHTS_OUT_FOR = 1.1;
const IRIS_SCALE = 1;
/* The fx canvas is centred on the eye anchor (--eye-x/--eye-y), so the point is its middle. */
const EYE_POINT = Object.freeze({ x: 0.5, y: 0.5, scale: IRIS_SCALE });

export function buildScene(tl, el, opts = DEFAULT_OPTS) {
  const fig = qs(el, '.hx-figure');
  const name = qs(el, '.hx-name');
  const top = qs(el, '.hx-intro-top');
  const foot = qs(el, '.hx-intro-foot');
  const cue = qs(el, '.hx-cue');
  setAnchor(fig, 'eye', EYE_X_PCT, EYE_Y_PCT);

  const fire = createEyeFire(qs(el, '[data-fx="eye-fire"]'), [EYE_POINT]);

  const pin = el.closest('.hx-pin') || el;
  tl.fromTo(pin, { '--hx-night': 0 }, { '--hx-night': 1, duration: LIGHTS_OUT_FOR, ease: 'power2.inOut' }, LIGHTS_OUT_AT);
  tl.fromTo(fig, { scale: 1, transformOrigin: '50% 22%' }, { scale: PUSH_INTRO, duration: 9, ease: 'power1.inOut' }, 0);
  tl.fromTo(name, { scale: 1, yPercent: 0 }, { scale: 1.1, yPercent: -7, duration: 9, ease: 'none' }, 0);
  track(tl, 1.2, 3.6, fire.render, 'power2.out');
  fade(tl, cue, 0, 0.4, 1);
  tl.to(foot, { opacity: 0, y: -24, duration: 1.2, ease: 'power1.in' }, 7.4);
  tl.to(top, { opacity: 0, duration: 1.2, ease: 'power1.in' }, 8.2);
  tl.set(el, { opacity: 0 }, DURATION);
  holdUntil(tl, DURATION);
  return { fx: [fire], gl: [] };
}
