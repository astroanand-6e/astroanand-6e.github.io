/** A small value bubble drawn on the unit while a knob or fader moves. */
import { VIEW } from './layout.js';
import { clamp, s } from './svg.js';

const HIDE_AFTER_MS = 900;
const PAD_X = 1.9;
const PAD_Y = 1.2;
const EDGE = 3;

export function buildReadout() {
  const bg = s('rect', { class: 'readout-bg', rx: 1.7 });
  const text = s('text', { class: 'readout-text', 'text-anchor': 'middle' });
  const g = s('g', { class: 'readout', 'aria-hidden': 'true' }, bg, text);
  let timer = 0;
  return {
    g,
    show(x, y, label) {
      text.textContent = label;
      const box = text.getBBox();
      bg.setAttribute('x', String(box.x - PAD_X));
      bg.setAttribute('y', String(box.y - PAD_Y));
      bg.setAttribute('width', String(box.width + 2 * PAD_X));
      bg.setAttribute('height', String(box.height + 2 * PAD_Y));
      const half = box.width / 2 + PAD_X + EDGE;
      const left = clamp(x, VIEW.x + half, VIEW.x + VIEW.w - half);
      const top = Math.max(y, VIEW.y + box.height + EDGE * 2);
      g.setAttribute('transform', `translate(${left} ${top})`);
      g.classList.add('is-visible');
      clearTimeout(timer);
      timer = setTimeout(() => g.classList.remove('is-visible'), HIDE_AFTER_MS);
    },
    hide() {
      clearTimeout(timer);
      g.classList.remove('is-visible');
    },
  };
}
