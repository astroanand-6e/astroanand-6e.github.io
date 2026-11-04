/**
 * Progress in localStorage under 'mix.progress.v1'.
 * Every storage access is guarded: storage can be missing, full, blocked or hold
 * junk, and the lessons must work without it. The progress object itself is
 * immutable; every change returns a new one.
 *
 * Shape: { v: 1, stars: { [lessonId]: 1..3 }, opened: { [lessonId]: true } }
 * `opened` records levels the learner jumped to with "Skip ahead".
 */
import { MAX_STARS } from './scoring.js';

export const STORAGE_KEY = 'mix.progress.v1';
const VERSION = 1;

export const emptyProgress = () => ({ v: VERSION, stars: {}, opened: {} });

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (error) {
    return null;
  }
}

function sanitize(data, lessonIds) {
  const clean = emptyProgress();
  if (!data || typeof data !== 'object' || data.v !== VERSION) return clean;
  for (const id of lessonIds) {
    const stars = data.stars && data.stars[id];
    if (Number.isInteger(stars) && stars >= 1 && stars <= MAX_STARS) clean.stars[id] = stars;
    if (data.opened && data.opened[id] === true) clean.opened[id] = true;
  }
  return clean;
}

/** Reads saved progress; anything unreadable gives an empty one. */
export function loadProgress(lessonIds, { storage = defaultStorage(), warn = console.warn } = {}) {
  if (!storage) return emptyProgress();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw), lessonIds) : emptyProgress();
  } catch (error) {
    warn('Lesson progress could not be read; starting fresh.', error);
    return emptyProgress();
  }
}

/** Saves progress; returns false (and warns) when storage refuses. */
export function saveProgress(progress, { storage = defaultStorage(), warn = console.warn } = {}) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch (error) {
    warn('Lesson progress could not be saved; it lasts until the page closes.', error);
    return false;
  }
}

export const starsOf = (progress, id) => progress.stars[id] || 0;

/** Keeps the best star count a level has earned. */
export function withResult(progress, id, stars) {
  const best = Math.max(starsOf(progress, id), Math.min(MAX_STARS, Math.max(0, Math.floor(stars))));
  return best === 0 ? progress : { ...progress, stars: { ...progress.stars, [id]: best } };
}

export function withOpened(progress, id) {
  return progress.opened[id] ? progress : { ...progress, opened: { ...progress.opened, [id]: true } };
}

export const totalStars = (progress, lessonIds) =>
  lessonIds.reduce((total, id) => total + starsOf(progress, id), 0);

/** Levels open in order: the first always, then each one once the one before has a star. */
export function isOpen(progress, lessonIds, index) {
  if (index === 0) return true;
  const id = lessonIds[index];
  return starsOf(progress, id) > 0 || progress.opened[id] === true || starsOf(progress, lessonIds[index - 1]) > 0;
}
