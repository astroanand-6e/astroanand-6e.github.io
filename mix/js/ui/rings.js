/**
 * Rings around controls: the pulsing sakura ring a lesson asks for ('highlight'), and the
 * steady ring that follows keyboard focus. Sections holding a ringed control get a dot on
 * the phone switch, so a ring in another section is not missed.
 */
import { CONTROL_BY_ID } from '../controls.js';
import { partOf } from './parts-common.js';

export function attachRings({ svg, parts, rings, viewport }) {
  const marked = new Set();

  function setHighlight(ids = []) {
    const next = new Set(ids.filter((id) => rings.has(id)));
    for (const id of marked) if (!next.has(id)) rings.get(id).classList.remove('is-marked');
    for (const id of next) rings.get(id).classList.add('is-marked');
    marked.clear();
    next.forEach((id) => marked.add(id));
    viewport.setMarked(new Set([...next].map((id) => CONTROL_BY_ID.get(id).section)));
  }

  svg.addEventListener('focusin', (event) => {
    const part = partOf(parts, event.target);
    if (part && event.target.matches(':focus-visible')) rings.get(part.control.id).classList.add('is-focus');
  });
  svg.addEventListener('focusout', (event) => {
    const part = partOf(parts, event.target);
    if (part) rings.get(part.control.id).classList.remove('is-focus');
  });

  return { setHighlight };
}
