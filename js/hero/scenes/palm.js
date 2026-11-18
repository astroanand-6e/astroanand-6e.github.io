/* Palm ("Workflow"): during a slow push-in his right arm swings up into the open palm (the ChatGPT raise
   frames, in-betweens warped by optical flow, fx/pose-flow.js). A red vortex forms in the palm
   (fx/palm-swirl.js) and his four tools (VS Code, Claude, Codex, Hermes) rise out of it and swirl round
   it, faster and tighter, until the vortex pulls them into its core. The core flares, a comet of light
   climbs to his head and draws a crown there (fx/crown.js); the camera tilts onto the crown and dives
   as the rift (fx/portal.js) opens from it, and the eyes close-up rises inside the rift (scenes/eyes.js). */
import { EYE_X_PCT, EYE_Y_PCT, PALM_X_PCT, PALM_Y_PCT, PUSH_INTRO, PUSH_PALM, RAISE_FLOW } from '../config.js';
import { createCrown } from '../fx/crown.js';
import { createEyeFire } from '../fx/eye-fire.js';
import { createPalmSwirl } from '../fx/palm-swirl.js';
import { createPortal } from '../fx/portal.js';
import { createPoseFlow } from '../fx/pose-flow.js';
import { DEFAULT_OPTS, beat, easeInOut, easeIn, easeOut, fade, figW, holdUntil, lerp, qs, qsa, setAnchor, span, track } from '../timeline-utils.js';

export const DURATION = 13;
const TAU = Math.PI * 2;
/* The push frames face and palm together: it scales about the point halfway between his eyes and
   the palm and nudges the frame down, so his hair stays in shot at every aspect ratio. */
const PALM_SHIFT_Y_PCT = 21;
const FRAME_Y_PCT = (EYE_Y_PCT + PALM_Y_PCT) / 2;
const FIG_ORIGIN_Y = 0.22; /* the figure's own scale origin (50% 22%), set in buildScene */
/* The rift opens here (uv, y up: 45% down the screen); the camera brings the crown to this point first,
   and the eyes scene's clip circle grows from the same spot. */
const PORTAL_CENTER = Object.freeze({ x: 0.5, y: 0.55 });
/* The middle of the crown on palm.webp (768x1024), as a fraction of the figure box (fx/crown.js). */
const CROWN_CENTER = Object.freeze({ x: 369 / 768, y: 34 / 1024 });
/* The tool loop, in fractions of the figure's width: a tilted ring centred a little above the palm,
   inside the vortex disc (css/hero.css .hx-swirl is centred at the same lift). */
const LOOP = Object.freeze({ lift: 0.034, radius: 0.115, tilt: 0.36 });
/* streak: 0, as in eyes.js - the anamorphic streak is wide enough at this canvas's designed width
   (2x fig-w, css/hero.css) to read as a bar across the whole face rather than a glint on the eyes
   (docs/PALM-EYES.md). */
const EYE_FIRE_START = Object.freeze({ x: 0.5, y: 0.5, streak: 0 });
const DIVE_SCALE = 1.6;

/* Beats, in seconds into the scene. */
const PUSH = Object.freeze({ at: 1, for: 7 });
const RAISE = Object.freeze({ at: 1.9, for: 1.7 });   /* stand -> in-betweens -> palm */
const GATHER = Object.freeze({ at: 3.3, for: 1.2 });  /* the ember and the vortex form in the palm */
const SPIN = Object.freeze({ at: 3.3, for: 4.4 });    /* one accelerating swirl, vortex and icons together */
const EMERGE = Object.freeze({ at: 3.8, for: 1.3 });  /* the icons rise out of the palm onto the ring */
const PULL = Object.freeze({ at: 6.2, for: 1.5 });    /* the ring tightens and the core swallows them */
const FLARE = Object.freeze({ at: 7.4, for: 0.7 });
const EMBER_OUT = Object.freeze({ at: 7.95, for: 0.45 });
const SWIRL_OUT = Object.freeze({ at: 7.9, for: 0.8 }); /* the vortex dies as the light leaves the palm */
const TRAIL = Object.freeze({ at: 7.8, for: 1.1 });   /* the comet climbs to his head */
const CROWN = Object.freeze({ at: 8.75, for: 1.3 });
const PAN = Object.freeze({ at: 8.9, for: 1.2 });     /* the camera brings the crown to the rift's centre */
const GLOW = Object.freeze({ at: 9.6, for: 0.8 });
const DIVE = Object.freeze({ at: 9.7, for: 3 });
const PORTAL = Object.freeze({ at: 10.05, for: 2.9 });

const phase = (t, b, ease = (x) => x) => ease(span(t, b.at, b.at + b.for));
/* Accelerating: about 4.5 turns, most of them near the end of the pull. */
const spinAngle = (t) => {
  const p = phase(t, SPIN);
  return TAU * (0.9 * p + 3.6 * Math.pow(p, 2.4));
};

/* The ember at the vortex's core: gathers, breathes, flares, then leaves with the comet. */
function createEmber(el) {
  return {
    render(t) {
      const gather = phase(t, GATHER);
      const opacity = Math.min(1, gather * 3) * (1 - phase(t, EMBER_OUT));
      el.style.opacity = opacity.toFixed(3);
      if (opacity <= 0) return;
      const size = (0.2 + 0.8 * easeOut(gather)) * (1 + 0.06 * Math.sin(t * 6)) * (1 + 1.3 * phase(t, FLARE, easeOut));
      el.style.transform = `translate(-50%, -50%) translateY(${figW(-LOOP.lift)}) scale(${size.toFixed(3)})`;
    },
  };
}

/* The four tool icons on a tilted ring round the vortex. Front-half icons draw over the vortex, back-half
   ones under it (z-index against .hx-swirl), and they scale with the camera like the hand they sit on. */
function createLoop(el) {
  const icons = qsa(el, '.hx-icon');
  let isHidden = true;
  return {
    render(t) {
      const emerge = phase(t, EMERGE, easeOut);
      const pull = phase(t, PULL, easeIn);
      const gone = span(pull, 0.72, 1);
      if (emerge <= 0 || gone >= 1) {
        if (!isHidden) icons.forEach((icon) => { icon.style.opacity = '0'; });
        isHidden = true;
        return;
      }
      isHidden = false;
      const spin = spinAngle(t);
      const rx = LOOP.radius * emerge * (1 - 0.94 * pull);
      const cy = -LOOP.lift * emerge;
      icons.forEach((icon, i) => {
        const theta = (i * TAU) / icons.length + spin;
        const depth = (Math.sin(theta) + 1) / 2;
        const s = (0.7 + 0.3 * depth) * (0.3 + 0.7 * emerge) * (1 - 0.8 * pull);
        icon.style.transform = `translate(${figW(rx * Math.cos(theta))}, ${figW(cy + rx * LOOP.tilt * Math.sin(theta))}) translate(-50%, -50%) scale(${s.toFixed(3)})`;
        icon.style.opacity = (Math.min(1, emerge * 3) * (0.6 + 0.4 * depth) * (1 - gone)).toFixed(3);
        icon.style.zIndex = Math.sin(theta) > 0 ? '6' : '3';
      });
    },
  };
}

/* Camera: a push toward the palm, then a pan that brings the crown to the rift's centre, then a dive. */
function createCamera(scene, fig, cam) {
  const ox = PALM_X_PCT / 100;
  const oy = FRAME_Y_PCT / 100;
  let box = null;
  window.addEventListener('resize', () => { box = null; });
  const measure = () => box || (box = {
    w: scene.clientWidth, h: scene.clientHeight, left: fig.offsetLeft, top: fig.offsetTop, fw: fig.offsetWidth, fh: fig.offsetHeight,
  });
  /* The cam translation (fractions of the figure box) that puts the crown on the rift's centre at scale s,
     undoing the figure's own PUSH_INTRO scale about (50%, 22%). */
  function crownTarget(s) {
    const b = measure();
    const x = 0.5 + ((b.w * PORTAL_CENTER.x - b.left) / b.fw - 0.5) / PUSH_INTRO;
    const y = FIG_ORIGIN_Y + ((b.h * (1 - PORTAL_CENTER.y) - b.top) / b.fh - FIG_ORIGIN_Y) / PUSH_INTRO;
    return { x: x - ox - (CROWN_CENTER.x - ox) * s, y: y - oy - (CROWN_CENTER.y - oy) * s };
  }
  cam.style.transformOrigin = `${PALM_X_PCT}% ${FRAME_Y_PCT}%`;
  return {
    render(t) {
      const push = phase(t, PUSH, easeInOut);
      const s = (1 + (PUSH_PALM - 1) * push) * (1 + (DIVE_SCALE - 1) * phase(t, DIVE, easeIn));
      const pan = phase(t, PAN, easeInOut);
      const goal = pan > 0 ? crownTarget(s) : null;
      const tx = lerp(((50 - PALM_X_PCT) / 100) * push, goal ? goal.x : 0, pan);
      const ty = lerp((PALM_SHIFT_Y_PCT / 100) * push, goal ? goal.y : 0, pan);
      cam.style.transform = `translate(${(tx * 100).toFixed(3)}%, ${(ty * 100).toFixed(3)}%) scale(${s.toFixed(4)})`;
    },
  };
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
  const swirl = createPalmSwirl(qs(el, '[data-fx="swirl"]'), { maxDpr: opts.maxDpr });
  const crown = createCrown(qs(el, '.hx-crown-fx'));
  const camera = createCamera(el, fig, cam);
  const ember = createEmber(qs(el, '.hx-ember'));
  const loop = createLoop(el);
  const frames = [standImg, ...qsa(el, '.hx-pose-src'), palmImg];
  const pose = createPoseFlow(qs(el, '[data-fx="pose-blend"]'), frames, RAISE_FLOW);

  tl.set(fig, { scale: PUSH_INTRO, transformOrigin: `50% ${FIG_ORIGIN_Y * 100}%` }, 0);
  tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'none' }, 0);
  track(tl, 0.8, 1.6, (p) => fire.render(1 - p), 'power2.in');

  /* One driver for everything placed by time, so the swirl, icons, comet and camera never drift apart. */
  track(tl, 0, DURATION, (p) => {
    const t = p * DURATION;
    camera.render(t);
    ember.render(t);
    loop.render(t);
    swirl.set({
      build: phase(t, GATHER, easeOut) * (1 - phase(t, SWIRL_OUT, easeIn)),
      spin: spinAngle(t),
      pull: phase(t, PULL, easeIn),
      flare: phase(t, FLARE, easeOut) * (1 - phase(t, SWIRL_OUT)),
    });
    crown.renderTrail(phase(t, TRAIL));
    crown.renderCrown(phase(t, CROWN), phase(t, GLOW, easeOut));
  });
  /* The canvas draws every pose once the raise starts; the stand <img> covers p = 0. */
  track(tl, RAISE.at, RAISE.for, (p) => {
    pose.render(p);
    standImg.style.opacity = p > 0 ? '0' : '1';
  }, 'none');

  beat(tl, beatEl, 4.2, 8.5); /* gone before the camera pans up to the crown */
  track(tl, PORTAL.at, PORTAL.for, portal.render, 'power2.inOut');
  fade(tl, fig, 0, 11.6, 0.8);
  tl.set(el, { opacity: 0 }, DURATION);
  holdUntil(tl, DURATION);
  return { fx: [fire, portal, pose, swirl], gl: [portal, swirl] };
}
