/**
 * Which part of the unit is on screen. Wide screens show the whole unit. At 600 px and
 * below one section fills the frame: the viewBox flies between deck 1, mixer and deck 2,
 * driven by the Deck 1 / Mixer / Deck 2 switch, a horizontal swipe, or a 'focus' event.
 */
import { SECTIONS } from '../controls.js';
import { SECTION_RANGE, VIEW } from './layout.js';
import { clamp, lerp } from './svg.js';

const NARROW_QUERY = '(max-width: 600px)';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const MAX_VIEW_WIDTH = 178;
const MIN_VIEW_WIDTH = 150;
const TARGET_PX_PER_MM = 2;
const FALLBACK_ASPECT = 0.6;
const FLIGHT_MS = 380;
const SWIPE_MIN_PX = 48;
const SWIPE_MAX_MS = 700;
const SWIPE_DOMINANCE = 1.6;

const easeOut = (t) => 1 - (1 - t) ** 3;

export function createViewport({ svg, frame, switchEl }) {
  const narrow = window.matchMedia(NARROW_QUERY);
  const reduced = window.matchMedia(REDUCED_QUERY);
  const buttons = [...switchEl.querySelectorAll('button[data-section]')];
  let section = SECTIONS[0];
  let current = [VIEW.x, VIEW.y, VIEW.w, VIEW.h];
  let flight = 0;
  let swipe = null;

  const write = (box) => {
    current = box;
    svg.setAttribute('viewBox', box.map((n) => Number(n.toFixed(2))).join(' '));
  };

  function boxFor(name) {
    if (!narrow.matches) return [VIEW.x, VIEW.y, VIEW.w, VIEW.h];
    const aspect = frame.clientHeight ? frame.clientWidth / frame.clientHeight : FALLBACK_ASPECT;
    const width = clamp(frame.clientWidth / TARGET_PX_PER_MM || MAX_VIEW_WIDTH, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
    const [x0, x1] = SECTION_RANGE[name];
    return [(x0 + x1) / 2 - width / 2, -width / aspect / 2, width, width / aspect];
  }

  function fly(target) {
    cancelAnimationFrame(flight);
    if (reduced.matches) {
      write(target);
      return;
    }
    const from = current;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / FLIGHT_MS);
      write(from.map((value, i) => lerp(value, target[i], easeOut(t))));
      if (t < 1) flight = requestAnimationFrame(tick);
    };
    flight = requestAnimationFrame(tick);
  }

  function mark() {
    for (const button of buttons) {
      const isCurrent = button.dataset.section === section;
      button.setAttribute('aria-pressed', String(isCurrent));
    }
  }

  function focusSection(name, { animate = true } = {}) {
    if (!SECTIONS.includes(name)) return;
    section = name;
    mark();
    if (animate && narrow.matches) fly(boxFor(name));
    else write(boxFor(name));
  }

  const step = (direction) => {
    const next = SECTIONS[SECTIONS.indexOf(section) + direction];
    if (next) focusSection(next);
  };

  function onPointerDown(event) {
    const onControl = event.target instanceof Element && event.target.closest('.ctl');
    swipe = narrow.matches && !onControl ? { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp } : null;
  }

  function onPointerUp(event) {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    const quick = event.timeStamp - swipe.at <= SWIPE_MAX_MS;
    if (quick && Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > SWIPE_DOMINANCE * Math.abs(dy)) step(dx < 0 ? 1 : -1);
    swipe = null;
  }

  const refresh = () => focusSection(section, { animate: false });
  const resizeObserver = new ResizeObserver(refresh);
  resizeObserver.observe(frame);
  narrow.addEventListener('change', refresh);
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', () => { swipe = null; });
  for (const button of buttons) button.addEventListener('click', () => focusSection(button.dataset.section));
  mark();

  return {
    focusSection,
    /** Dots the switch buttons whose section holds a ringed control. */
    setMarked(names) {
      for (const button of buttons) button.classList.toggle('is-marked', names.has(button.dataset.section));
    },
    dispose() {
      cancelAnimationFrame(flight);
      resizeObserver.disconnect();
      narrow.removeEventListener('change', refresh);
    },
  };
}
