/* No scrubbed VFX: reduced motion, no GSAP, or a failed load. The hero stays a plain stacked
   page (intro first) and each beat fades in once, briefly, as it scrolls into view. */
const FADE_CLASS = 'hx-fade';
const SEEN_CLASS = 'is-in';
const SEEN_THRESHOLD = 0.25;

export function initStaticHero(host) {
  host.classList.add('hx-static');
  const scenes = host.querySelectorAll('[data-hx-scene]:not([data-hx-scene="intro"])');
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add(SEEN_CLASS);
      observer.unobserve(entry.target);
    });
  }, { threshold: SEEN_THRESHOLD });
  scenes.forEach((scene) => {
    scene.classList.add(FADE_CLASS);
    observer.observe(scene);
  });
}
