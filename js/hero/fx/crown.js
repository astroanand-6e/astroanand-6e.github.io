/* The crown: a comet of light climbs from the palm vortex to the top of his head and draws a crown of
   red light there. Everything is SVG in palm.webp's own pixel space (768x1024, the figure box), so it
   rides the camera with the drawing. The glow is layered strokes, not a CSS filter: a filter would
   re-rasterise the whole layer on every scrubbed frame. */
import { easeInOut, easeOut, span } from '../timeline-utils.js';

/* Base centre of the crown on palm.webp. Measured off the plate's alpha: his hair is about 120px wide at
   y = 66 (x 304..426) and peaks at about x = 370, y = 34, so a 112px base there sits into the curls. */
const CROWN_AT = Object.freeze({ x: 369, y: 66 });
/* Palm vortex centre -> the crown's centre tip. It climbs left of his hair (x <= 300 until y = 30). */
const TRAIL_D = 'M237 296 C 188 208, 228 26, 369 0';
/* Each half is drawn from the centre tip outward and down, so the crown grows from where the comet lands. */
const HALVES = Object.freeze([
  'M0 -66 L-15 -20 L-28 -48 L-40 -22 L-60 -50 L-56 0 Q-28 6 0 6',
  'M0 -66 L15 -20 L28 -48 L40 -22 L60 -50 L56 0 Q28 6 0 6',
]);
const BODY_D = 'M-56 0 L-60 -50 L-40 -22 L-28 -48 L-15 -20 L0 -66 L15 -20 L28 -48 L40 -22 L60 -50 L56 0 Q0 12 -56 0 Z';
const BAND_D = 'M-57 -12 Q0 0 57 -12';
/* Tip gems [x, y, radius, pop delay]: the centre lights first, then outward. */
const GEMS = Object.freeze([[-60, -50, 4.2, 0.1], [-28, -48, 3.4, 0.05], [0, -66, 5.2, 0], [28, -48, 3.4, 0.05], [60, -50, 4.2, 0.1]]);
const LAYERS = Object.freeze(['glow', 'mid', 'core']);
const COMET_FRAC = 0.3; /* comet length, as a fraction of the trail */

const backOut = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

function markup() {
  const defs = '<defs>'
    + '<radialGradient id="hx-crown-aura"><stop offset="0" stop-color="#ff2a1f" stop-opacity="0.5"/><stop offset="1" stop-color="#ff2a1f" stop-opacity="0"/></radialGradient>'
    + '<linearGradient id="hx-crown-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a5c" stop-opacity="0.7"/><stop offset="1" stop-color="#ff2a1f" stop-opacity="0.18"/></linearGradient>'
    + '</defs>';
  const trail = `<path class="hx-trail-ghost" d="${TRAIL_D}"/>`
    + LAYERS.map((l) => `<path class="hx-comet hx-l-${l}" d="${TRAIL_D}"/>`).join('')
    + '<circle class="hx-comet-head" cx="237" cy="296" r="0"/>';
  const lines = HALVES.flatMap((d) => LAYERS.map((l) => `<path class="hx-crown-line hx-l-${l}" d="${d}" pathLength="1"/>`)).join('');
  const band = ['mid', 'core'].map((l) => `<path class="hx-crown-line hx-crown-band hx-l-${l}" d="${BAND_D}" pathLength="1"/>`).join('');
  const gems = GEMS.map(([x, y]) => `<circle class="hx-crown-gem" cx="${x}" cy="${y}" r="0"/>`).join('');
  const crown = `<g class="hx-crown" transform="translate(${CROWN_AT.x} ${CROWN_AT.y})" opacity="0">`
    + '<ellipse class="hx-crown-aura" cx="0" cy="-26" rx="100" ry="74"/><ellipse class="hx-crown-flash" cx="0" cy="3" rx="60" ry="14"/>'
    + `<path class="hx-crown-body" d="${BODY_D}"/>${lines}${band}${gems}`
    + '<path class="hx-crown-jewel" d="M0 -6 L5 0 L0 6 L-5 0 Z"/></g>';
  return defs + trail + crown;
}

export function createCrown(svg) {
  svg.innerHTML = markup();
  const $ = (sel) => svg.querySelector(sel);
  const $$ = (sel) => [...svg.querySelectorAll(sel)];
  const ghost = $('.hx-trail-ghost');
  const comets = $$('.hx-comet');
  const head = $('.hx-comet-head');
  const group = $('.hx-crown');
  const lines = $$('.hx-crown-line:not(.hx-crown-band)');
  const bands = $$('.hx-crown-band');
  const body = $('.hx-crown-body');
  const jewel = $('.hx-crown-jewel');
  const gems = $$('.hx-crown-gem');
  const flash = $('.hx-crown-flash');
  const aura = $('.hx-crown-aura');
  let length = 0;

  /* Measured once, lazily: the path only has a length once the SVG is in the document. */
  function trailLength() {
    if (length) return length;
    length = ghost.getTotalLength();
    const dash = `${(length * COMET_FRAC).toFixed(1)} ${(length * 2).toFixed(1)}`;
    comets.forEach((c) => { c.style.strokeDasharray = dash; });
    ghost.style.strokeDasharray = `${length.toFixed(1)} ${length.toFixed(1)}`;
    return length;
  }

  /* p 0..1: the comet's head runs the trail, the tail follows, a faint line stays behind it. */
  function renderTrail(p) {
    const isOn = p > 0 && p < 1;
    const total = trailLength();
    const h = easeInOut(p);
    const alpha = isOn ? Math.min(1, p * 8) * (1 - span(p, 0.88, 1)) : 0;
    comets.forEach((c) => {
      c.style.strokeDashoffset = (total * (COMET_FRAC - h)).toFixed(1);
      c.style.opacity = alpha.toFixed(3);
    });
    ghost.style.strokeDashoffset = (total * (1 - h)).toFixed(1);
    ghost.style.opacity = (isOn ? 0.35 * (1 - span(p, 0.6, 1)) : 0).toFixed(3);
    if (!isOn) { head.setAttribute('r', '0'); return; }
    const pt = ghost.getPointAtLength(h * total);
    head.setAttribute('cx', pt.x.toFixed(1));
    head.setAttribute('cy', pt.y.toFixed(1));
    head.setAttribute('r', (7 * alpha).toFixed(2));
  }

  /* p 0..1: outline draws from the centre tip, the band and fill follow, gems pop, a ring flashes off
     the base. glow 0..1 swells the aura as the rift opens from the crown. */
  function renderCrown(p, glow) {
    group.setAttribute('opacity', p > 0 ? '1' : '0');
    if (p <= 0) return;
    const draw = easeInOut(span(p, 0, 0.5));
    lines.forEach((l) => { l.style.strokeDashoffset = (1 - draw).toFixed(4); });
    const band = easeInOut(span(p, 0.25, 0.65));
    bands.forEach((b) => { b.style.strokeDashoffset = (1 - band).toFixed(4); });
    const fill = easeOut(span(p, 0.35, 0.9));
    body.style.opacity = (0.9 * fill).toFixed(3);
    jewel.style.opacity = fill.toFixed(3);
    gems.forEach((g, i) => {
      const [, , r, delay] = GEMS[i];
      const pop = span(p, 0.42 + delay, 0.64 + delay);
      g.setAttribute('r', (pop > 0 ? r * backOut(pop) : 0).toFixed(2));
    });
    const f = span(p, 0.45, 1);
    const ring = 1 + 1.8 * easeOut(f);
    flash.setAttribute('rx', (60 * ring).toFixed(1));
    flash.setAttribute('ry', (14 * ring).toFixed(1));
    flash.style.opacity = (f > 0 ? 0.9 * (1 - f) : 0).toFixed(3);
    const swell = 1 + 0.6 * glow;
    aura.setAttribute('rx', (100 * swell).toFixed(1));
    aura.setAttribute('ry', (74 * swell).toFixed(1));
    aura.style.opacity = (0.6 * easeOut(span(p, 0.3, 1)) + 0.4 * glow).toFixed(3);
  }

  return { renderTrail, renderCrown };
}
