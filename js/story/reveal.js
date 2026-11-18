/** Staggered fade-up for [data-reveal-group] blocks, triggered once as each enters the viewport. */
const GROUP_SELECTOR = '[data-reveal-group]';
const ROOT_CLASS = 'reveal-on';
const IN_CLASS = 'is-in';
const DONE_CLASS = 'is-done';
const STAGGER_MS = 40;
const DURATION_MS = 600;
const SETTLE_MS = 120;
/* Fire on the group's top edge, not on a share of its area: a tall group (the 8-card work grid on a phone
   is ~5 viewports) can never be 20% visible, so an area threshold would leave it hidden for good. */
const THRESHOLD = 0;
const ROOT_MARGIN = '0px 0px -12% 0px';
const REVEAL_LINE = 0.88; /* the same line as ROOT_MARGIN, for the safety net below */

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
  addSafetyNet(groups, observer);
}

/* Belt and braces: hidden content is the worst failure here, so if the observer ever misses a group (a
   throttled background tab, a jump past it), a cheap check on scroll and on tab focus reveals any group
   whose top is already on screen or above it. It removes itself once every group is in. */
function addSafetyNet(groups, observer) {
  const pending = new Set(groups);
  let queued = false;
  const check = () => {
    queued = false;
    pending.forEach((group) => {
      if (group.getBoundingClientRect().top >= window.innerHeight * REVEAL_LINE) return;
      pending.delete(group);
      observer.unobserve(group);
      if (!group.classList.contains(IN_CLASS)) reveal(group);
    });
    if (!pending.size) stop();
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(check);
  };
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  function stop() {
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', check);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', check);
}
