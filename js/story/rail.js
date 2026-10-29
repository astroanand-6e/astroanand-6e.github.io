import { CHAPTERS } from './chapters.js';

const LINK_SELECTOR = '[data-rail]';
const CURRENT = 'aria-current';

/** Highlights the current chapter tick and writes the figure readout used by the story slot. */
export function initRail() {
  const links = document.querySelectorAll(LINK_SELECTOR);
  const root = document.documentElement;
  window.addEventListener('chapter', (event) => {
    const { id } = event.detail;
    links.forEach((link) => {
      if (link.dataset.rail === id) link.setAttribute(CURRENT, 'step');
      else link.removeAttribute(CURRENT);
    });
    const chapter = CHAPTERS.find((item) => item.id === id);
    if (chapter && chapter.id !== 'index') root.style.setProperty('--fig', `"${chapter.num || '00'}"`);
  });
}
