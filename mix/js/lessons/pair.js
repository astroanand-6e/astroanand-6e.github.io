/**
 * Picks which library rows go on deck 1 and deck 2 for a level.
 * The library is whatever the engine ships, so levels ask for a shape
 * (a BPM gap, key friendliness) and take the best match.
 */
import { mod } from './util.js';

const CAMELOT = /^(\d{1,2})([AB])$/i;
const CAMELOT_WHEEL = 12;
const KEY_UNKNOWN_PENALTY = 1;
const KEY_NEAR_PENALTY = 0.5;
const KEY_FAR_PENALTY = 2;
/** The tempo fader moves a deck 8%, so pairs further apart than this cannot be matched. */
export const DEFAULT_MAX_GAP_RATIO = 0.06;

/** 0 for the same key or relative key, small for neighbours on the Camelot wheel. */
export function keyPenalty(first, second) {
  const a = CAMELOT.exec((first && first.camelot) || '');
  const b = CAMELOT.exec((second && second.camelot) || '');
  if (!a || !b) return KEY_UNKNOWN_PENALTY;
  const numberGap = Math.min(mod(Number(a[1]) - Number(b[1]), CAMELOT_WHEEL), mod(Number(b[1]) - Number(a[1]), CAMELOT_WHEEL));
  if (numberGap === 0) return 0;
  const sameLetter = a[2].toUpperCase() === b[2].toUpperCase();
  return sameLetter && numberGap === 1 ? KEY_NEAR_PENALTY : KEY_FAR_PENALTY;
}

/**
 * options: minGapBpm (smallest BPM gap wanted), maxGapRatio (largest gap as a
 * share of deck 1's BPM), wantGapBpm (the gap to aim for).
 * Returns { a, b, gap, forced }: library rows for deck 1 and deck 2. `forced`
 * means no pair fits and the same row goes on both decks.
 */
export function planPair(tracks, { minGapBpm = 0, maxGapRatio = DEFAULT_MAX_GAP_RATIO, wantGapBpm = 0 } = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) throw new Error('The library has no tracks');
  let best = null;
  tracks.forEach((first, a) => {
    tracks.forEach((second, b) => {
      if (a === b) return;
      const gap = Math.abs(first.bpm - second.bpm);
      if (gap < minGapBpm || gap / first.bpm > maxGapRatio) return;
      const cost = Math.abs(gap - wantGapBpm) + keyPenalty(first, second);
      if (!best || cost < best.cost) best = { a, b, gap, cost };
    });
  });
  if (best) return { a: best.a, b: best.b, gap: best.gap, forced: false };
  return { a: 0, b: 0, gap: 0, forced: true };
}
