import { CHAPTERS, MOBILE_QUERY, chapterIndex } from './chapters.js';

const BAND_DESKTOP = '-45% 0px -45% 0px';
const BAND_MOBILE = '-55% 0px -20% 0px';
const ACTIVE_CLASS = 'is-active';

let currentIndex = -1;
let observer = null;
let frame = 0;

function emitChapter(id) {
  const index = chapterIndex(id);
  if (index === currentIndex) return;
  currentIndex = index;
  document.querySelectorAll('[data-chapter]').forEach((el) => {
    el.classList.toggle(ACTIVE_CLASS, el.dataset.chapter === id);
  });
  window.dispatchEvent(new CustomEvent('chapter', { detail: { id, index } }));
}

function emitProgress(storyEl) {
  frame = 0;
  const span = storyEl.offsetTop + storyEl.offsetHeight - window.innerHeight;
  const p = span > 0 ? Math.min(1, Math.max(0, window.scrollY / span)) : 0;
  document.documentElement.style.setProperty('--progress', p.toFixed(4));
  window.dispatchEvent(new CustomEvent('story-progress', { detail: { p } }));
}

function createObserver() {
  const band = window.matchMedia(MOBILE_QUERY).matches ? BAND_MOBILE : BAND_DESKTOP;
  return new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) emitChapter(entry.target.dataset.chapter);
      });
    },
    { rootMargin: band, threshold: 0 },
  );
}

function observeAll() {
  if (observer) observer.disconnect();
  observer = createObserver();
  document.querySelectorAll('[data-chapter]').forEach((el) => observer.observe(el));
}

export function getCurrentIndex() {
  return currentIndex;
}

export function scrollToChapter(index) {
  const chapter = CHAPTERS[Math.min(CHAPTERS.length - 1, Math.max(0, index))];
  const target = document.querySelector(`[data-chapter="${chapter.id}"]`);
  if (!target) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

export function initScrolly() {
  const storyEl = document.getElementById('story');
  if (!storyEl || !('IntersectionObserver' in window)) return;
  observeAll();
  window.matchMedia(MOBILE_QUERY).addEventListener('change', observeAll);
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => emitProgress(storyEl));
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  schedule();
}
