/** Marks html[data-zone] as "index" while the recruiter index is in view, else "story". */
const ZONE_STORY = 'story';
const ZONE_INDEX = 'index';
const ROOT_MARGIN = '0px 0px -40% 0px';

export function initZone() {
  const root = document.documentElement;
  const index = document.getElementById('index');
  root.dataset.zone = ZONE_STORY;
  if (!index || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      const zone = entry.isIntersecting ? ZONE_INDEX : ZONE_STORY;
      if (root.dataset.zone === zone) return;
      root.dataset.zone = zone;
      window.dispatchEvent(new CustomEvent('zone', { detail: { zone } }));
    },
    { rootMargin: ROOT_MARGIN, threshold: 0 },
  );
  observer.observe(index);
}
