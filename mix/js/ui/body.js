/** The unit itself: gradients, chassis, seams, printed captions, the ready dot and the FX beat readout. */
import { BODY_RADIUS, CAPTIONS, FX_BEATS_READOUT, SEAM_X, STATUS_DOT, VIEW } from './layout.js';
import { s } from './svg.js';

const SEAM_INSET = 12;
const BEVEL_INSET = 1.2;

const stop = (offset, style) => s('stop', { offset, style });

function buildDefs() {
  return s('defs', {},
    s('linearGradient', { id: 'mix-body', x1: 0, y1: 0, x2: 0, y2: 1 },
      stop(0, 'stop-color:var(--deck-body-top)'),
      stop(0.5, 'stop-color:var(--deck-body)'),
      stop(1, 'stop-color:var(--deck-body-bottom)')),
    s('radialGradient', { id: 'mix-sheen', cx: 0.32, cy: 0.26, r: 0.8 },
      stop(0, 'stop-color:#fff;stop-opacity:var(--sheen)'),
      stop(1, 'stop-color:#fff;stop-opacity:0')),
    s('linearGradient', { id: 'mix-gloss', x1: 0, y1: 0, x2: 0, y2: 1 },
      stop(0, 'stop-color:#fff;stop-opacity:var(--gloss)'),
      stop(0.6, 'stop-color:#fff;stop-opacity:0')),
    s('radialGradient', { id: 'mix-platter', cx: 0.5, cy: 0.5, r: 0.5 },
      stop(0, 'stop-color:#fff;stop-opacity:var(--platter-glow)'),
      stop(1, 'stop-color:#fff;stop-opacity:0')));
}

export function buildBody() {
  const seams = [-SEAM_X, SEAM_X].map((x) => s('line', {
    class: 'seam', x1: x, y1: VIEW.y + SEAM_INSET, x2: x, y2: VIEW.y + VIEW.h - SEAM_INSET,
  }));
  const captions = CAPTIONS.map(({ text, x, y }) => s('text', { class: 'silk silk-quiet', x, y, 'text-anchor': 'middle' }, text));
  const dot = s('circle', { class: 'ready-dot', cx: STATUS_DOT.x, cy: STATUS_DOT.y, r: STATUS_DOT.r });
  const beats = s('text', { class: 'led-text', x: FX_BEATS_READOUT.x, y: FX_BEATS_READOUT.y, 'text-anchor': 'middle' });
  const g = s('g', { class: 'unit-body' },
    s('rect', { class: 'body', x: VIEW.x, y: VIEW.y, width: VIEW.w, height: VIEW.h, rx: BODY_RADIUS }),
    s('rect', {
      class: 'body-bevel', x: VIEW.x + BEVEL_INSET, y: VIEW.y + BEVEL_INSET,
      width: VIEW.w - 2 * BEVEL_INSET, height: VIEW.h - 2 * BEVEL_INSET, rx: BODY_RADIUS - BEVEL_INSET,
    }),
    seams, captions, dot, beats);
  return {
    defs: buildDefs(),
    g,
    setReady(ready) {
      dot.classList.toggle('is-lit', Boolean(ready));
    },
    setBeats(text) {
      if (beats.textContent !== text) beats.textContent = text;
    },
  };
}
