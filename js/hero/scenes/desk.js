/* Desk: the portrait breaks into a flock of black crows that fly at the camera; as they pass,
   desk.webp opens up behind them from the centre. Crows are canvas particles with a fixed seed. */
import { SEED_CROWS } from '../config.js';
import { createCodeScreen } from '../fx/code-screen.js';
import { createCrows } from '../fx/crows.js';
import { DEFAULT_OPTS, beat, holdUntil, qs, track } from '../timeline-utils.js';

export const DURATION = 12;
const CROW_SECONDS = 5.2;
const REVEAL_AT = 2.2;
const REVEAL_FOR = 2.4;
const HOLD_FROM = 5.2; /* crows are gone; the desk holds, pushing in gently, until the burn */
/* The line leaves before the hand-off's flames reach it (the hand-off starts 2s before this
   scene ends; see SCENES in config.js), so the burn never cuts through the letters. */
const BEAT_IN = 5.4;
const BEAT_OUT = 9.3;
const CODE_AT = 3.4;
const CODE_FOR = 6.2;

export function buildScene(tl, el, opts = DEFAULT_OPTS) {
  const plate = qs(el, '.hx-desk-plate');
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0);
  const beatEl = qs(el, '.hx-beat');
  const source = qs(el, '.hx-crow-src img');
  const crows = createCrows(qs(el, '[data-fx="crows"]'), {
    count: opts.crowCount, seed: opts.seed ?? SEED_CROWS, getSource: () => source, maxDpr: opts.maxDpr, scale: 1,
  });

  tl.fromTo(plate, { clipPath: 'circle(0% at 50% 50%)', scale: 1.18 }, { clipPath: 'circle(80% at 50% 50%)', duration: REVEAL_FOR, ease: 'power2.in' }, REVEAL_AT);
  tl.to(plate, { scale: 1, duration: HOLD_FROM - REVEAL_AT, ease: 'power2.out' }, REVEAL_AT);
  tl.to(plate, { scale: 1.07, duration: DURATION - HOLD_FROM, ease: 'none' }, HOLD_FROM);
  track(tl, 0, CROW_SECONDS, crows.render, 'none');
  /* He codes: the monitor types as you scroll, then the test breaks and holds (fx/code-screen.js). */
  const code = createCodeScreen(plate);
  track(tl, CODE_AT, CODE_FOR, code.render, 'none');
  beat(tl, beatEl, BEAT_IN, BEAT_OUT);
  holdUntil(tl, DURATION);
  return { fx: [crows], gl: [] };
}
