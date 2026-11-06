/* Hand-off: black flames with a red edge burn the desk scene away, leaving the page colour
   (black in dark mode, paper in light mode) for the story section to arrive in. Copy about
   music and audio appears in the ash.
   Order matters for a smooth exit: the desk line has already left (desk.js), the front climbs
   at a steady speed, the burn layer fades over an empty frame, and only then does the music
   line rise. */
import { createBurn } from '../fx/burn.js';
import { DEFAULT_OPTS, beat, holdUntil, qs, track } from '../timeline-utils.js';

export const DURATION = 8;
const BURN_AT = 0.4;
const BURN_FOR = 5;
/* The front clears the top of the frame at about 88% of the burn; the rest is solid page colour,
   so the desk is hidden and the burn layer fades from there instead of holding an empty frame. */
const FRONT_CLEAR = 0.88;
const BURN_DONE = BURN_AT + BURN_FOR * FRONT_CLEAR;
export const FADE_AT = BURN_DONE;
const FADE_FOR = 1.2;
const LINE_IN_AT = BURN_DONE + 0.75; /* the burn layer is about 80% gone here */

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
  /* The burn layer fades onto the pin's own page colour, which it already matches. */
  tl.to(burnEl, { opacity: 0, duration: FADE_FOR, ease: 'power2.inOut' }, FADE_AT);
  beat(tl, beatEl, LINE_IN_AT);
  holdUntil(tl, DURATION);
  return { fx: [burn], gl: [burn] };
}
