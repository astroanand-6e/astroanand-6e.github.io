/** Papers page: shared theme switch (T shortcut, like the blog) and the beta dial. */
import { initTheme, toggleTheme } from '../theme.js';
import { initBetaDial } from './beta-dial.js';

const TEXT_INPUT_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function onKeydown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest && event.target.closest(TEXT_INPUT_SELECTOR)) return;
  if ((event.key || '').toLowerCase() === 't') toggleTheme();
}

initTheme();
initBetaDial();
document.addEventListener('keydown', onKeydown);
