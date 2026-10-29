import { MOBILE_QUERY } from './chapters.js';

const SLOT_SELECTOR = '[data-stage-slot]';
const HIDDEN_CLIP = 'inset(0 0 100% 0)';

/** Path covering the visible part of one slot, in viewport pixels. */
function slotPath(rect, vw, vh) {
  const top = Math.max(0, rect.top);
  const bottom = Math.min(vh, rect.bottom);
  const left = Math.max(0, rect.left);
  const right = Math.min(vw, rect.right);
  if (bottom - top < 1 || right - left < 1) return '';
  return `M${left} ${top}H${right}V${bottom}H${left}Z`;
}

/**
 * Mobile only: the canvas sits above the page so the sticky slot can show it over the
 * paper backdrop. Clipping it to the visible slots keeps text and buttons tappable.
 */
export function initSlotClip() {
  const canvas = document.getElementById('stage');
  if (!canvas) return;
  const mobile = window.matchMedia(MOBILE_QUERY);
  let frame = 0;

  const update = () => {
    frame = 0;
    if (!mobile.matches) {
      canvas.style.clipPath = '';
      return;
    }
    const paths = Array.from(document.querySelectorAll(SLOT_SELECTOR))
      .map((slot) => slotPath(slot.getBoundingClientRect(), window.innerWidth, window.innerHeight))
      .filter(Boolean);
    canvas.style.clipPath = paths.length ? `path('${paths.join('')}')` : HIDDEN_CLIP;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule, { once: true });
  mobile.addEventListener('change', schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(document.body);
  schedule();
}
