/* Hero tuning. Everything a person may want to adjust after the real images land lives here. */

/* Flip a key to true once its file exists in assets/hero/ (a 404 would log a console error). */
export const REAL_IMAGES = Object.freeze({ stand: true, palm: true, eyes: true, desk: true, 'raise-1': true, 'raise-1b': true, 'raise-2': true, 'raise-3': true });

export const IMAGE_PATH = 'assets/hero/';
/* assets/ is served immutable (vercel.json): bump this whenever a hero image file changes. */
export const IMAGE_VERSION = 3;
export const heroImage = (name) => `${IMAGE_PATH}${name}.webp?v=${IMAGE_VERSION}`;

/* EYE POSITION on stand.webp, as a percentage of the image box (0,0 = top left). Tune these two. */
export const EYE_X_PCT = 48.2;
export const EYE_Y_PCT = 13.7;

/* Other positions that need the real art: the raised palm on palm.webp, the two eyes on eyes.webp. */
export const PALM_X_PCT = 46.5;
export const PALM_Y_PCT = 32.7;
export const CLOSEUP_EYES = Object.freeze([{ x: 43.5, y: 34.9 }, { x: 56.2, y: 32.8 }]);

/* Image aspect ratios (width / height). */
export const ASPECT = Object.freeze({ stand: 3 / 4, palm: 3 / 4, eyes: 4 / 3, desk: 4 / 3, 'raise-1': 3 / 4, 'raise-1b': 3 / 4, 'raise-2': 3 / 4, 'raise-3': 3 / 4 });

/* Scenes in order. `overlap` is how many seconds the scene starts before the previous one ends. */
export const SCENES = Object.freeze([
  { id: 'intro', duration: 10, overlap: 0 },
  { id: 'palm', duration: 13, overlap: 1 },
  { id: 'eyes', duration: 14, overlap: 1 },
  { id: 'desk', duration: 12, overlap: 5 },
  { id: 'handoff', duration: 8, overlap: 2 },
]);

/* Scroll length per second of timeline, in viewport heights (about 300vh per scene). */
export const VH_PER_SECOND_DESKTOP = 36;
export const VH_PER_SECOND_MOBILE = 30;
export const SCRUB_SECONDS = 0.6;
export const MOBILE_QUERY = '(max-width: 767.98px)';

/* Camera moves. */
export const PUSH_INTRO = 1.12;
export const PUSH_PALM = 1.45;

/* How far ahead of a scene (seconds of timeline) its WebGL context is created and kept. */
export const WAKE_MARGIN_S = 2;

/* Render scale for full-screen shader canvases. */
export const GL_SCALE_DESKTOP = 0.7;
export const GL_SCALE_MOBILE = 0.5;
export const GL_MAX_DPR = 1.5;

/* Seeds for the deterministic effects. */
export const SEED_CROWS = 0x1d3a;

/* Optical-flow in-betweens for the palm arm raise (avatar-studio/tools/flow.py). One pair per
   consecutive key drawing; range is the max displacement in px of the 768x1024 drawings. */
export const RAISE_FLOW = Object.freeze({
  width: 768,
  height: 1024,
  pairs: [71, 84, 49, 52, 47].map((range, i) => ({
    f01: `${IMAGE_PATH}flow/flow-${i}-f.png?v=${IMAGE_VERSION}`,
    f10: `${IMAGE_PATH}flow/flow-${i}-b.png?v=${IMAGE_VERSION}`,
    range,
  })),
});
