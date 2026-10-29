/**
 * Layout contract with the page: the hero chapter frames its object inside
 * [data-stage-slot="hero"], every other chapter inside [data-stage-slot="story"].
 * Rects are cached and refreshed on resize/scroll (plus a slow poll, because
 * font loads shift layout without either event).
 */
export const EDGE_PAD = 24;
// Narrow slots (phones) have no room for side columns: callouts stack in a
// band above and a band below the object instead.
export const NARROW_SLOT_PX = 520;
export const NARROW_BAND_ROWS = 3;
export const NARROW_ROW_PX = 22;
const NARROW_BAND_GAP_PX = 14;
const DESKTOP_MIN_WIDTH = 768;
const FALLBACK_DESKTOP_SHARE = 0.58;
const FALLBACK_MOBILE_SHARE = 0.55;
const MIN_SLOT_PX = 80;
const POLL_SECONDS = 0.5;
const TOPBAR_PX = 64;
// Kept small: callouts can sit over the plinth's empty corners, so the object
// gets most of the slot width and its details stay readable.
const WIDE_GUTTER_MAX_SHARE = 0.09;
// Labels may reach into the empty corners of the object's bounding box.
const LABEL_GUTTER_SHARE = 0.62;
const MIN_FIT_PX = 60;

const toRect = (left, top, right, bottom) => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

function fallbackRect(view) {
  if (window.innerWidth >= DESKTOP_MIN_WIDTH) {
    const left = view.left + view.width * (1 - FALLBACK_DESKTOP_SHARE);
    return toRect(left, view.top, view.right, view.bottom);
  }
  return toRect(view.left, view.top, view.right, view.top + view.height * FALLBACK_MOBILE_SHARE);
}

export function createSlots(canvas) {
  let view = toRect(0, 0, 1, 1);
  const slots = { hero: null, story: null };
  let isDirty = true;
  let sinceMeasure = 0;

  function measureSlot(name) {
    const el = document.querySelector(`[data-stage-slot="${name}"]`);
    if (!el) return null;
    const box = el.getBoundingClientRect();
    // Not clipped to the viewport: a slot below the fold keeps its own frame,
    // so its station rides in with the page instead of resizing as it scrolls.
    return box.width >= MIN_SLOT_PX && box.height >= MIN_SLOT_PX
      ? toRect(box.left, box.top, box.right, box.bottom)
      : null;
  }

  function measure() {
    const box = canvas.getBoundingClientRect();
    view = toRect(box.left, box.top, box.right, box.bottom);
    slots.hero = measureSlot('hero');
    slots.story = measureSlot('story');
    isDirty = false;
    sinceMeasure = 0;
  }

  const markDirty = () => {
    isDirty = true;
  };
  window.addEventListener('resize', markDirty);
  window.addEventListener('scroll', markDirty, { passive: true });

  return {
    /** Viewport-space rect of the slot that frames the given chapter. */
    pick(chapterId, dt) {
      sinceMeasure += dt;
      if (isDirty || sinceMeasure > POLL_SECONDS) measure();
      const wanted = chapterId === 'hero' ? slots.hero : slots.story;
      return wanted || fallbackRect(view);
    },
    /** True while enough of the slot is on screen to be worth animating into. */
    isOnScreen(slot) {
      return slot.bottom > view.top + MIN_SLOT_PX / 2 && slot.top < view.bottom - MIN_SLOT_PX / 2;
    },
    /** Canvas rect in viewport space (offset between canvas and page coords). */
    view: () => view,
    markDirty,
    dispose() {
      window.removeEventListener('resize', markDirty);
      window.removeEventListener('scroll', markDirty);
    },
  };
}

/**
 * The area the object's bounding sphere must fit: the slot minus edge padding,
 * the top bar, and a gutter for the callout columns. Canvas-local coordinates.
 */
export function fitRect(slot, view, columnPx) {
  const isNarrow = slot.width < NARROW_SLOT_PX;
  const band = isNarrow ? (NARROW_BAND_ROWS - 1) * NARROW_ROW_PX + NARROW_BAND_GAP_PX : 0;
  const gutter = isNarrow
    ? 0
    : Math.min(columnPx * LABEL_GUTTER_SHARE, slot.width * WIDE_GUTTER_MAX_SHARE);
  const left = slot.left + EDGE_PAD + gutter;
  const right = slot.right - EDGE_PAD - gutter;
  const top = Math.max(slot.top, view.top + TOPBAR_PX) + (isNarrow ? EDGE_PAD + band : EDGE_PAD * 0.5);
  const bottom = slot.bottom - EDGE_PAD - band;
  const width = Math.max(right - left, MIN_FIT_PX);
  const height = Math.max(bottom - top, MIN_FIT_PX);
  return {
    cx: (left + right) / 2 - view.left,
    cy: (top + bottom) / 2 - view.top,
    width,
    height,
  };
}

export const TOPBAR_INSET_PX = TOPBAR_PX;
