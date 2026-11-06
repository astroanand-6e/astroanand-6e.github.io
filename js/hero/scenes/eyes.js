/* Eyes: a close-up. The world flips to a red-sky genjutsu look flooding out from his eyes:
   red gradient sky, a black moon, drifting black cloud bands, a domain-warp ripple. The
   portrait then dissolves into the crows that the next scene releases. */
import { CLOSEUP_EYES } from '../config.js';
import { createEyeFire } from '../fx/eye-fire.js';
import { createGenjutsu } from '../fx/genjutsu.js';
import { DEFAULT_OPTS, beat, easeInOut, easeOut, fade, holdUntil, qs, setAnchor, span, track } from '../timeline-utils.js';

export const DURATION = 14;
/* Close-up: a faint glint on each iris only, so the face stays readable. */
const EYE_LOOK = Object.freeze({ scale: 0.42, glow: 0.4, streak: 0, thin: 0.45, iris: 0.6 }); /* no streak: it read as scratches on the lenses */
const FX_WIDTH_PCT = 160; /* fx canvas width as % of the figure; its height is half of that */
const FIGURE_ASPECT = 4 / 3;
/* Where the sky floods out from, in screen uv (y up). Tune with the real portrait. */
const SKY_CENTER = Object.freeze({ x: 0.5, y: 0.52 });

/* Eye positions (% of the portrait) to points in the fx canvas, which is centred on the eyes' midpoint. */
function eyePoints(mid) {
  const canvasH = FX_WIDTH_PCT / 2 / FIGURE_ASPECT; /* in % of figure height */
  return CLOSEUP_EYES.map((eye) => ({
    x: 0.5 + (eye.x - mid.x) / FX_WIDTH_PCT,
    y: 0.5 + (eye.y - mid.y) / canvasH,
    ...EYE_LOOK,
  }));
}

const FLIP = Object.freeze({ at: 1.6, for: 3.2 });
const MOON = Object.freeze({ at: 3, for: 4 });

function paintSky(sky, t) {
  sky.set({ flip: easeInOut(span(t, FLIP.at, FLIP.at + FLIP.for)), moon: easeOut(span(t, MOON.at, MOON.at + MOON.for)), time: t });
}

export function buildScene(tl, el, opts = DEFAULT_OPTS) {
  const fig = qs(el, '.hx-figure');
  const beatEl = qs(el, '.hx-beat');
  const sky = createGenjutsu(qs(el, '[data-fx="genjutsu"]'), { scale: opts.glScale, maxDpr: opts.maxDpr, center: SKY_CENTER });
  const mid = { x: (CLOSEUP_EYES[0].x + CLOSEUP_EYES[1].x) / 2, y: (CLOSEUP_EYES[0].y + CLOSEUP_EYES[1].y) / 2 };
  setAnchor(fig, 'eye', mid.x, mid.y);
  const fire = createEyeFire(qs(el, '[data-fx="eye-fire"]'), eyePoints(mid));

  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'none' }, 0);
  /* The face arrives out of the palm's rift (the scenes overlap, config.js), fully opaque before
     the sky starts to flood: a half-faded face over the red sky read as a red smear on the mouth. */
  tl.fromTo(el, { clipPath: 'circle(0% at 50% 55%)' }, { clipPath: 'circle(78% at 50% 55%)', duration: 1.6, ease: 'power2.in' }, 0);
  tl.set(el, { clipPath: 'none' }, 1.61);
  tl.fromTo(fig, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power1.out' }, 0.05);
  tl.fromTo(fig, { scale: 1.14, transformOrigin: '50% 45%' }, { scale: 1, duration: 5.5, ease: 'power2.out' }, 0.05);
  tl.fromTo(fig, { '--rim': 0 }, { '--rim': 1, duration: 2.6, ease: 'power2.inOut' }, 1.6);
  track(tl, 0, DURATION, (p) => paintSky(sky, p * DURATION), 'none');
  track(tl, 2.2, 2.6, fire.render, 'power2.out');
  beat(tl, beatEl, 4.2, 8.8);
  tl.to(fig, { opacity: 0, scale: 1.05, duration: 1.4, ease: 'power1.in' }, 9);
  fade(tl, el, 0, 13, 1);
  holdUntil(tl, DURATION);
  return { fx: [sky, fire], gl: [sky.fx] };
}
