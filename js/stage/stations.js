import * as THREE from 'three';

/**
 * Station table and the chapter -> station mapping. Stations sit along +x,
 * 15 units apart; a missing module keeps its slot so the others never shift.
 */
export const STATIONS = Object.freeze([
  { id: 'desk', file: 'desk.js', position: [0, 0, 0] },
  { id: 'ecg-monitor', file: 'ecg-monitor.js', position: [15, 0, -7] },
  { id: 'c-arm', file: 'c-arm.js', position: [30, 0, 1] },
  { id: 'conveyor', file: 'conveyor.js', position: [45, 0, -7] },
  { id: 'ddj-flx4', file: 'ddj-flx4.js', position: [60, 0, 1] },
  { id: 'calm-machine', file: 'calm-machine.js', position: [75, 0, -7] },
]);

/**
 * What each chapter looks at. `focus` re-aims the framing sphere (station-local
 * center, radius in scene units) and may limit callouts to `zones`; `null`
 * means no station (the index).
 */
export const CHAPTER_VIEWS = Object.freeze({
  hero: { station: 'desk' },
  heart: { station: 'ecg-monitor' },
  vision: { station: 'c-arm' },
  care: { station: 'conveyor' },
  decks: { station: 'ddj-flx4' },
  calm: { station: 'calm-machine' },
  voice: {
    station: 'desk',
    // Zoomed to the MacBook and the mic; only their callouts are drawn.
    focus: {
      center: [0.4, 1.0, -1.2],
      radius: 5.4,
      zones: [
        { center: [-3.9, 1.1, -1.8], radius: 2.6 },
        { center: [4.7, 1.0, -0.9], radius: 2.4 },
      ],
    },
  },
  now: { station: 'desk' },
  index: null,
});

export function viewForChapter(id) {
  return Object.hasOwn(CHAPTER_VIEWS, id) ? CHAPTER_VIEWS[id] : CHAPTER_VIEWS.hero;
}

export function stationIndex(id) {
  return STATIONS.findIndex((def) => def.id === id);
}

/**
 * Dynamic import of a station module. A failed import is cached by the
 * browser per URL, so retries add a query string to get a fresh fetch.
 */
export function importStation(def, attempt = 0) {
  const url = new URL(`../objects/${def.file}`, import.meta.url);
  if (attempt > 0) url.searchParams.set('retry', String(attempt));
  return import(url.href);
}

/** World-space callout zones for a view that narrows its labels, else null. */
export function focusZones(view, index) {
  if (!view || !view.focus || !view.focus.zones) return null;
  const origin = new THREE.Vector3(...STATIONS[index].position);
  return view.focus.zones.map((zone) => ({
    center: new THREE.Vector3(...zone.center).add(origin),
    radius: zone.radius,
  }));
}

/** The chapter currently marked active by the story scroller (hero if none yet). */
export function readChapter() {
  const all = Array.from(document.querySelectorAll('[data-chapter]'));
  const active = document.querySelector('[data-chapter].is-active');
  return { id: active ? active.dataset.chapter : 'hero', index: Math.max(0, all.indexOf(active)) };
}
