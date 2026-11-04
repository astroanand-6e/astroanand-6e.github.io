/** Number and offset wording for step text and result feedback. Digits only, plain words. */
import { BEATS_PER_BAR } from '../controls.js';
import { mod } from './util.js';

const NEAR_ZERO_BEATS = 0.05;
const NEAR_ZERO_MS = 5;
const WHOLE_NUMBER_FROM = 9.95;

export const fmtBpm = (bpm) => bpm.toFixed(1);
export const fmtMs = (ms) => `${Math.round(ms)} ms`;
export const fmtSeconds = (seconds) => `${Math.round(seconds)} s`;

function beatCount(value) {
  const abs = Math.abs(value);
  const text = abs >= WHOLE_NUMBER_FROM ? String(Math.round(abs)) : abs.toFixed(1).replace(/\.0$/, '');
  return { text, unit: text === '1' ? 'beat' : 'beats' };
}

/** "0.3 beats", "1 beat", "12 beats". */
export function fmtBeats(value) {
  const { text, unit } = beatCount(value);
  return `${text} ${unit}`;
}

/** "right on the phrase", "0.3 beats after the phrase". Offset is signed, positive means after. */
export function describeBeatOffset(offset, target) {
  if (Math.abs(offset) < NEAR_ZERO_BEATS) return `right on ${target}`;
  return `${fmtBeats(offset)} ${offset > 0 ? 'after' : 'before'} ${target}`;
}

/** Same as describeBeatOffset for milliseconds. */
export function describeMsOffset(offsetMs, target) {
  if (Math.abs(offsetMs) < NEAR_ZERO_MS) return `right on ${target}`;
  return `${fmtMs(Math.abs(offsetMs))} ${offsetMs > 0 ? 'after' : 'before'} ${target}`;
}

export const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** Bar.beat label for a beat counter value: beat 64 reads "17.1". */
export function barBeatLabel(beat) {
  const bar = Math.floor(beat / BEATS_PER_BAR) + 1;
  return `${bar}.${Math.floor(mod(beat, BEATS_PER_BAR)) + 1}`;
}

/** Signed milliseconds with a plus sign: "+12 ms", "-30 ms". */
export function signedMs(ms) {
  const rounded = Math.round(ms);
  return `${rounded > 0 ? '+' : ''}${rounded} ms`;
}
