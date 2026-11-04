/**
 * Blog pages: the home page's crossfader and T shortcut, plus a reading
 * progress hairline along the topbar on posts.
 */
import { initTheme, toggleTheme } from '../js/theme.js';

const root = document.documentElement;
const TEXT_INPUT_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function onKeydown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest && event.target.closest(TEXT_INPUT_SELECTOR)) return;
  if ((event.key || '').toLowerCase() === 't') toggleTheme();
}

/** Sets --progress (drawn by .topbar::after) to how much of the post has been read. */
function initReadingProgress() {
  const article = document.querySelector('.post');
  if (!article) return;
  let queued = false;
  const update = () => {
    queued = false;
    const end = article.getBoundingClientRect().bottom + window.scrollY - window.innerHeight;
    const progress = end > 0 ? Math.min(1, Math.max(0, window.scrollY / end)) : 1;
    root.style.setProperty('--progress', progress.toFixed(4));
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  update();
}

initTheme();
initReadingProgress();
document.addEventListener('keydown', onKeydown);
