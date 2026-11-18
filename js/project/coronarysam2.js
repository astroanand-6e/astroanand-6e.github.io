/**
 * CoronarySAM2 page figure: add include/exclude points on an illustrative vessel tree and watch the mask grow.
 * The vessel tree is made up. An include point grows the mask over that segment and its neighbours;
 * an exclude point removes the segment that was hit. Buttons mirror the clicks for keyboard use.
 */
import { initProject, svgEl, htmlEl, buttonGroup, reducedMotion } from './common.js';

const SEGMENTS = Object.freeze([
  { id: 'trunk', name: 'Trunk', d: 'M30 200 C 90 170, 130 150, 190 120', near: ['left', 'upper', 'lower'], artery: true, pt: [110, 163] },
  { id: 'left', name: 'Left branch', d: 'M190 120 C 200 80, 170 50, 150 20', near: ['trunk'], artery: true, pt: [178, 70] },
  { id: 'upper', name: 'Upper branch', d: 'M190 120 C 240 100, 290 70, 360 40', near: ['trunk'], artery: true, pt: [275, 84] },
  { id: 'lower', name: 'Lower branch', d: 'M190 120 C 230 150, 290 170, 370 190', near: ['trunk', 'tip'], artery: true, pt: [280, 160] },
  { id: 'tip', name: 'Small side branch', d: 'M290 165 C 304 200, 322 214, 348 224', near: ['lower'], artery: true, pt: [318, 203] },
  { id: 'other', name: 'Other structure', d: 'M40 40 C 120 70, 190 40, 255 22', near: [], artery: false, pt: [150, 52] },
]);

const state = { mode: 'include', included: new Set(), points: [] };

function readout(read) {
  const wrong = [...state.included].filter((id) => !SEGMENTS.find((s) => s.id === id).artery);
  const arteries = SEGMENTS.filter((s) => s.artery).length;
  const got = [...state.included].filter((id) => SEGMENTS.find((s) => s.id === id).artery).length;
  const msg = state.points.length === 0
    ? 'No points yet. Click a vessel to add an include point.'
    : `${state.points.length} point${state.points.length === 1 ? '' : 's'}. Mask covers ${got} of ${arteries} artery segments.`
      + (wrong.length ? ' It also covers a structure that is not an artery. Switch to exclude and click it.' : '');
  read.replaceChildren(htmlEl('p', {}, msg));
}

function apply(id) {
  const seg = SEGMENTS.find((s) => s.id === id);
  const next = new Set(state.included);
  if (state.mode === 'include') [seg.id, ...seg.near].forEach((n) => next.add(n));
  else next.delete(seg.id);
  state.included = next;
  state.points = [...state.points, { id, mode: state.mode, x: seg.pt[0], y: seg.pt[1] }];
}

function paint(svg, masks, buttons, read) {
  svg.querySelectorAll('.pt').forEach((node) => node.remove());
  masks.forEach((mask, id) => mask.classList.toggle('on', state.included.has(id)));
  buttons.forEach((button, id) => button.setAttribute('aria-pressed', String(state.included.has(id))));
  state.points.forEach(({ mode, x, y }) => {
    const g = svgEl('g', { class: 'pt', transform: `translate(${x} ${y})` });
    if (mode === 'include') g.append(svgEl('circle', { r: 5, class: 'pt-in' }));
    else g.append(svgEl('path', { d: 'M-5 -5 L5 5 M5 -5 L-5 5', class: 'pt-out' }));
    svg.append(g);
  });
  readout(read);
}

function init() {
  const svg = document.getElementById('sam-svg');
  if (!svg) return;
  const read = document.getElementById('sam-read');
  const segBox = document.getElementById('sam-segs');
  const masks = new Map();
  const buttons = new Map();
  const redraw = () => paint(svg, masks, buttons, read);
  const act = (id) => { apply(id); redraw(); };

  SEGMENTS.forEach((seg) => {
    svg.append(svgEl('path', { d: seg.d, class: `vessel${seg.artery ? '' : ' other'}` }));
    const mask = svgEl('path', { d: seg.d, class: 'mask', pathLength: 1 });
    if (reducedMotion()) mask.style.transition = 'none';
    masks.set(seg.id, mask);
    svg.append(mask);
  });
  SEGMENTS.forEach((seg) => {
    const hit = svgEl('path', { d: seg.d, class: 'hit' });
    hit.addEventListener('click', () => act(seg.id));
    svg.append(hit);
    const button = htmlEl('button', { type: 'button', 'aria-pressed': 'false' }, seg.name);
    button.addEventListener('click', () => act(seg.id));
    buttons.set(seg.id, button);
    segBox.append(button);
  });

  const modeBox = document.getElementById('sam-mode');
  buttonGroup(modeBox, '[data-mode]', (button) => { state.mode = button.dataset.mode; });
  document.getElementById('sam-reset').addEventListener('click', () => {
    state.included = new Set();
    state.points = [];
    redraw();
  });
  redraw();
}

initProject();
init();
