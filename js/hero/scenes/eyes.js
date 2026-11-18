/* Eyes: a close-up. The world flips to a red-sky genjutsu look flooding out from his eyes:
   red gradient sky, a black moon, drifting black cloud bands, a domain-warp ripple. Both irises
   ignite into red pinwheel irises (fx/eye-iris.js). The portrait then dissolves into the crows
   that the next scene releases. */
import { createGenjutsu } from '../fx/genjutsu.js';
import { createIris } from '../fx/eye-iris.js';
import { DEFAULT_OPTS, beat, easeInOut, easeOut, fade, holdUntil, qs, qsa, span, track } from '../timeline-utils.js';

export const DURATION = 14;
/* Where the sky floods out from, in screen uv (y up). Tune with the real portrait. */
const SKY_CENTER = Object.freeze({ x: 0.5, y: 0.52 });
const FLIP = Object.freeze({ at: 1.6, for: 3.2 });
const MOON = Object.freeze({ at: 3, for: 4 });
/* The irises light as the sky turns, and finish spinning in before the copy rises. */
const IGNITE = Object.freeze({ at: 2.2, for: 2.4 });

function paintSky(sky, t) {
  sky.set({ flip: easeInOut(span(t, FLIP.at, FLIP.at + FLIP.for)), moon: easeOut(span(t, MOON.at, MOON.at + MOON.for)), time: t });
}

export function buildScene(tl, el, opts = DEFAULT_OPTS) {
  const fig = qs(el, '.hx-figure');
  const beatEl = qs(el, '.hx-beat');
  const sky = createGenjutsu(qs(el, '[data-fx="genjutsu"]'), { scale: opts.glScale, maxDpr: opts.maxDpr, center: SKY_CENTER });
  const iris = createIris(qsa(el, '.hx-iris'));

  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'none' }, 0);
  /* The face arrives out of the palm's rift (the scenes overlap, config.js), fully opaque before
     the sky starts to flood: a half-faded face over the red sky read as a red smear on the mouth.
     50% 45% is the rift's centre (palm.js PORTAL_CENTER, uv y-up 0.55), where his crown sits as it opens. */
  tl.fromTo(el, { clipPath: 'circle(0% at 50% 45%)' }, { clipPath: 'circle(78% at 50% 45%)', duration: 1.6, ease: 'power2.in' }, 0);
  tl.set(el, { clipPath: 'none' }, 1.61);
  /* power2.out, not power1.out: every other arrival in the film (fire, plate, dj stage) settles on
     this curve, and the figure's own scale-in on the next line already uses it. */
  tl.fromTo(fig, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power2.out' }, 0.05);
  tl.fromTo(fig, { scale: 1.14, transformOrigin: '50% 45%' }, { scale: 1, duration: 5.5, ease: 'power2.out' }, 0.05);
  tl.fromTo(fig, { '--rim': 0 }, { '--rim': 1, duration: 2.6, ease: 'power2.inOut' }, 1.6);
  track(tl, 0, DURATION, (p) => {
    const t = p * DURATION;
    paintSky(sky, t);
    iris.render(span(t, IGNITE.at, IGNITE.at + IGNITE.for), t - IGNITE.at);
  }, 'none');
  beat(tl, beatEl, 4.2, 8.8);
  tl.to(fig, { opacity: 0, scale: 1.05, duration: 1.4, ease: 'power1.in' }, 9);
  fade(tl, el, 0, 13, 1);
  holdUntil(tl, DURATION);
  return { fx: [sky, iris], gl: [sky.fx] };
}
