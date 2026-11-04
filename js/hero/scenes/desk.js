/* Desk: the portrait breaks into a flock of black crows that fly at the camera; as they pass,
   desk.webp opens up behind them from the centre. Crows are canvas particles with a fixed seed. */
import { SEED_CROWS } from '../config.js';
import { createCrows } from '../fx/crows.js';
import { DEFAULT_OPTS, beat, holdUntil, qs, track } from '../timeline-utils.js';

export const DURATION = 10;
const CROW_SECONDS = 6.6;
const REVEAL_AT = 2.4;
const REVEAL_FOR = 2.4;

export function buildScene(tl, el, opts = DEFAULT_OPTS) {
  const plate = qs(el, '.hx-desk-plate');
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0);
  const beatEl = qs(el, '.hx-beat');
  const source = qs(el, '.hx-crow-src img');
  const crows = createCrows(qs(el, '[data-fx="crows"]'), {
    count: opts.crowCount, seed: opts.seed ?? SEED_CROWS, getSource: () => source, maxDpr: opts.maxDpr, scale: 1,
  });

  tl.fromTo(plate, { clipPath: 'circle(0% at 50% 50%)', scale: 1.18 }, { clipPath: 'circle(80% at 50% 50%)', duration: REVEAL_FOR, ease: 'power2.in' }, REVEAL_AT);
  tl.to(plate, { scale: 1, duration: 6, ease: 'power2.out' }, REVEAL_AT);
  track(tl, 0, CROW_SECONDS, crows.render, 'none');
  beat(tl, beatEl, 5.2);
  holdUntil(tl, DURATION);
  return { fx: [crows], gl: [] };
}
