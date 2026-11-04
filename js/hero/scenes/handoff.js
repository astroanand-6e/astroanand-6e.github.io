/* Hand-off: black flames with a red edge burn the desk scene away, leaving page black for the
   story section to arrive in. Copy about music and audio appears in the ash. */
import { createBurn } from '../fx/burn.js';
import { DEFAULT_OPTS, beat, holdUntil, qs, track } from '../timeline-utils.js';

export const DURATION = 8;
const BURN_AT = 0.4;
const BURN_FOR = 5.2;
const LIGHTS_ON_AT = 6.2;
const LIGHTS_ON_FOR = 1.4;

export function buildScene(tl, el, opts = DEFAULT_OPTS) {
  const beatEl = qs(el, '.hx-beat');
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0);
  const burn = createBurn(qs(el, '[data-fx="burn"]'), { scale: opts.glScale, maxDpr: opts.maxDpr, seconds: BURN_FOR });
  track(tl, BURN_AT, BURN_FOR, burn.render, 'power1.inOut');
  beat(tl, beatEl, 3.8);
  /* Lights back on: the burn layer fades and the hero returns to light (no-op in dark mode). */
  const pin = el.closest('.hx-pin') || el;
  tl.to(qs(el, '[data-fx="burn"]'), { opacity: 0, duration: LIGHTS_ON_FOR, ease: 'power2.inOut' }, LIGHTS_ON_AT);
  tl.fromTo(pin, { '--hx-night': 1 }, { '--hx-night': 0, duration: LIGHTS_ON_FOR, ease: 'power2.inOut', immediateRender: false }, LIGHTS_ON_AT);
  holdUntil(tl, DURATION);
  return { fx: [burn], gl: [burn] };
}
