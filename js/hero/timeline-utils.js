/* Helpers shared by every scene. No GSAP import: scenes only receive a timeline, so the same
   code runs inside a HyperFrames composition. */

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeIn = (t) => t * t;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* Re-maps p inside [a, b] to 0..1. */
export const span = (p, a, b) => clamp01((p - a) / (b - a));

/* Calls render(p) with p running 0..1 across [at, at + dur]. The callback runs from a property
   setter, not onUpdate, because GSAP suppresses events while seeking; setters always fire. */
export function track(tl, at, dur, render, ease = 'none') {
  const proxy = { value: 0 };
  let current = 0;
  Object.defineProperty(proxy, 'p', {
    get: () => current,
    set: (v) => { current = v; render(v); },
  });
  tl.fromTo(proxy, { p: 0 }, { p: 1, duration: dur, ease }, at);
}

/* Fades a layer in or out. */
export function fade(tl, el, to, at, dur, ease = 'none') {
  tl.to(el, { opacity: to, duration: dur, ease }, at);
}

/* Pins the length of a scene timeline. */
export function holdUntil(tl, seconds) {
  tl.set({}, {}, seconds);
}

export const qs = (el, sel) => el.querySelector(sel);
export const qsa = (el, sel) => Array.from(el.querySelectorAll(sel));

/* A copy block that rises in at `inAt` and (optionally) leaves at `outAt`. */
export function beat(tl, el, inAt, outAt) {
  tl.fromTo(el, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 1, ease: 'power2.out' }, inAt);
  if (outAt !== undefined) tl.to(el, { opacity: 0, y: -18, duration: 0.8, ease: 'power1.in' }, outAt);
}

/* Percent of a figure's width, as a CSS length; the figure sets --fig-w. No layout reads. */
export const figW = (n) => `calc(var(--fig-w) * ${n.toFixed(4)})`;

/* Tags a point as a CSS percentage pair on an element (figure-relative anchors). */
export function setAnchor(el, name, xPct, yPct) {
  el.style.setProperty(`--${name}-x`, `${xPct}%`);
  el.style.setProperty(`--${name}-y`, `${yPct}%`);
}

export const DEFAULT_OPTS = Object.freeze({ glScale: 0.7, maxDpr: 1.5, crowCount: 150, seed: 0x1d3a });
