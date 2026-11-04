/* Hero tuning. Everything a person may want to adjust after the real images land lives here. */

/* Flip a key to true once its file exists in assets/hero/ (a 404 would log a console error). */
export const REAL_IMAGES = Object.freeze({ stand: false, palm: false, eyes: false, desk: false });

export const IMAGE_PATH = 'assets/hero/';

/* EYE POSITION on stand.webp, as a percentage of the image box (0,0 = top left). Tune these two. */
export const EYE_X_PCT = 50;
export const EYE_Y_PCT = 10.6;

/* Other positions that need the real art: the raised palm on palm.webp, the two eyes on eyes.webp. */
export const PALM_X_PCT = 31;
export const PALM_Y_PCT = 47;
export const CLOSEUP_EYES = Object.freeze([{ x: 36.5, y: 45 }, { x: 63.5, y: 45 }]);

/* Image aspect ratios (width / height). */
export const ASPECT = Object.freeze({ stand: 2 / 3, palm: 2 / 3, eyes: 4 / 3, desk: 4 / 3 });

/* Scenes in order. `overlap` is how many seconds the scene starts before the previous one ends. */
export const SCENES = Object.freeze([
  { id: 'intro', duration: 10, overlap: 0 },
  { id: 'palm', duration: 10, overlap: 1 },
  { id: 'eyes', duration: 14, overlap: 1 },
  { id: 'desk', duration: 10, overlap: 5 },
  { id: 'handoff', duration: 8, overlap: 3 },
]);

/* Scroll length per second of timeline, in viewport heights (about 300vh per scene). */
export const VH_PER_SECOND_DESKTOP = 36;
export const VH_PER_SECOND_MOBILE = 30;
export const SCRUB_SECONDS = 0.6;
export const MOBILE_QUERY = '(max-width: 767.98px)';

/* Camera moves. */
export const PUSH_INTRO = 1.12;
export const PUSH_PALM = 2.1;

/* How far ahead of a scene (seconds of timeline) its WebGL context is created and kept. */
export const WAKE_MARGIN_S = 2;

/* Render scale for full-screen shader canvases. */
export const GL_SCALE_DESKTOP = 0.7;
export const GL_SCALE_MOBILE = 0.5;
export const GL_MAX_DPR = 1.5;

/* Seeds for the deterministic effects. */
export const SEED_CROWS = 0x1d3a;
