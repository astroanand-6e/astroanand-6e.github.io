/* Hand-off: black flames with a red edge burn the desk scene away, leaving page black for the
   story section to arrive in. Copy about music and audio appears in the ash.
   Order matters for a smooth exit: the desk line has already left (desk.js), the front climbs
   at a steady speed, the lights come back on over an empty frame, and only then does the music
   line rise, so it never crosses the light/dark flip at mid grey. */
import { createBurn } from '../fx/burn.js';
import { DEFAULT_OPTS, beat, holdUntil, qs, track } from '../timeline-utils.js';

export const DURATION = 8;
const BURN_AT = 0.4;
const BURN_FOR = 5;
/* The front clears the top of the frame at about 88% of the burn; the rest is solid black,
   so the desk is hidden and the lights come on from there instead of holding an empty frame. */
const FRONT_CLEAR = 0.88;
const BURN_DONE = BURN_AT + BURN_FOR * FRONT_CLEAR;
export const LIGHTS_ON_AT = BURN_DONE;
const LIGHTS_ON_FOR = 1.2;
const LINE_IN_AT = BURN_DONE + 0.75; /* the flip is about 80% done here, so the line rises in its final colour */

export function buildScene(tl, el, opts = DEFAULT_OPTS) {
  const beatEl = qs(el, '.hx-beat');
  const burnEl = qs(el, '[data-fx="burn"]');
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0);
  const burn = createBurn(burnEl, { scale: opts.glScale, maxDpr: opts.maxDpr, seconds: BURN_FOR });
  /* Linear: an eased burn raced across the frame in a short flick of the wheel. */
  track(tl, BURN_AT, BURN_FOR, burn.render, 'none');
  /* The desk scene sits under the burn, so hide it once the flames have covered it. */
  const pin = el.closest('.hx-pin') || el;
  const desk = pin.querySelector('[data-hx-scene="desk"]');
  if (desk) tl.set(desk, { autoAlpha: 0 }, BURN_DONE);
  /* Lights back on: the burn layer fades and the hero returns to light (no-op in dark mode). */
  tl.to(burnEl, { opacity: 0, duration: LIGHTS_ON_FOR, ease: 'power2.inOut' }, LIGHTS_ON_AT);
  tl.fromTo(pin, { '--hx-night': 1 }, { '--hx-night': 0, duration: LIGHTS_ON_FOR, ease: 'power2.inOut', immediateRender: false }, LIGHTS_ON_AT);
  beat(tl, beatEl, LINE_IN_AT);
  holdUntil(tl, DURATION);
  return { fx: [burn], gl: [burn] };
}
