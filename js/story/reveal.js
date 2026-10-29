/** Staggered fade-up for [data-reveal-group] blocks, triggered once as each enters the viewport. */
const GROUP_SELECTOR = '[data-reveal-group]';
const ROOT_CLASS = 'reveal-on';
const IN_CLASS = 'is-in';
const DONE_CLASS = 'is-done';
const STAGGER_MS = 40;
const DURATION_MS = 600;
const SETTLE_MS = 120;
const THRESHOLD = 0.2;
const ROOT_MARGIN = '0px 0px -8% 0px';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function indexChildren(group) {
  Array.from(group.children).forEach((child, i) => child.style.setProperty('--i', String(i)));
}

/** Once the transitions finish, hand the children back to their own hover styles. */
function settle(group) {
  const wait = DURATION_MS + group.children.length * STAGGER_MS + SETTLE_MS;
  window.setTimeout(() => group.classList.add(DONE_CLASS), wait);
}

function reveal(group) {
  group.classList.add(IN_CLASS);
  settle(group);
}

export function initReveal() {
  const groups = document.querySelectorAll(GROUP_SELECTOR);
  if (!groups.length || !('IntersectionObserver' in window) || prefersReducedMotion()) return;
  groups.forEach(indexChildren);
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        reveal(entry.target);
      });
    },
    { threshold: THRESHOLD, rootMargin: ROOT_MARGIN },
  );
  document.documentElement.classList.add(ROOT_CLASS);
  void document.documentElement.offsetWidth;
  groups.forEach((group) => observer.observe(group));
}
