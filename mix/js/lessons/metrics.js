/**
 * Pure measurements on engine state (live state or a captured snapshot).
 * Lessons score from these, so they stay small, named and unit-tested.
 *
 * Conventions: beats are floats on the track's own grid (deck.beat), phrase
 * positions run 0..32 (deck.phraseBeat), and every "offset" is signed with
 * positive meaning "after" the reference.
 */
import { BEATS_PER_BAR, PHRASE_BEATS } from '../controls.js';
import { clamp, isNum, mod, nearestOffset, round } from './util.js';

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MS_DIGITS = 3;
/** A channel counts as audible above this gain (fader x crossfader). */
export const AUDIBLE_GAIN = 0.15;

/** Beats to milliseconds at a tempo. Infinity when either input is unusable. */
export function beatsToMs(beats, bpm) {
  if (!isNum(beats) || !(bpm > 0)) return Infinity;
  return round(((beats * SECONDS_PER_MINUTE) / bpm) * MS_PER_SECOND, MS_DIGITS);
}

/** Phase error in ms while overlapping: |phaseOffset| x 60 / bpm x 1000, deck 1 as reference. */
export function phaseErrorMs(state) {
  return Math.abs(beatsToMs(state.phaseOffset, state.decks[0].bpm));
}

/** Absolute gap between the two decks' effective BPM. */
export function bpmGap(state) {
  return Math.abs(state.decks[0].bpm - state.decks[1].bpm);
}

/**
 * Position inside the 32 beat phrase as a float. Uses deck.phraseBeat; when the
 * engine reports it as a whole number, the fraction comes from the beat counter.
 */
export function phrasePos(deck) {
  const reported = deck.phraseBeat;
  if (!isNum(reported)) return isNum(deck.beat) ? mod(deck.beat, PHRASE_BEATS) : NaN;
  return Number.isInteger(reported) && isNum(deck.beat) ? reported + mod(deck.beat, 1) : reported;
}

/** Signed beats from the nearest phrase start; phrasePosition runs 0..32. */
export const phraseOffset = (phrasePosition) => nearestOffset(phrasePosition, PHRASE_BEATS);

/** Signed beats from the nearest bar start. */
export const barOffset = (beat) => nearestOffset(beat, BEATS_PER_BAR);

/** Signed beats from the nearest beat. */
export const beatOffset = (beat) => nearestOffset(beat, 1);

/** The track's own BPM (before the tempo fader). NaN with no track. */
export function nativeBpm(deck) {
  return deck.track && deck.track.bpm > 0 ? deck.track.bpm : NaN;
}

/** Beat counter at a track position, extended from where the deck is now. */
export function beatAtSeconds(deck, seconds) {
  return deck.beat + ((seconds - deck.position) * nativeBpm(deck)) / SECONDS_PER_MINUTE;
}

/** Phrase position (0..32) at a track position. */
export function phrasePosAtSeconds(deck, seconds) {
  const beats = ((seconds - deck.position) * nativeBpm(deck)) / SECONDS_PER_MINUTE;
  return mod(phrasePos(deck) + beats, PHRASE_BEATS);
}

/** Beats between two track positions in seconds. */
export function beatsBetween(deck, fromSeconds, toSeconds) {
  return ((toSeconds - fromSeconds) * nativeBpm(deck)) / SECONDS_PER_MINUTE;
}

/** Track position (seconds) of a beat counter value. */
export function secondsAtBeat(deck, beat) {
  return deck.position + ((beat - deck.beat) * SECONDS_PER_MINUTE) / nativeBpm(deck);
}

/** Bar (1-based) and beat in the bar (1-4) for display. */
export function barAndBeat(deck) {
  const bar = isNum(deck.bar) ? deck.bar : Math.floor(deck.beat / BEATS_PER_BAR) + 1;
  return { bar, beat: Math.floor(mod(deck.beat, BEATS_PER_BAR)) + 1 };
}

/**
 * One value of a per-channel mixer control. The contract lists trim, hi, mid,
 * low, cfx and fader as [ch1, ch2]; a plain number is returned as is.
 */
export function channel(mixer, key, ch) {
  const value = mixer ? mixer[key] : undefined;
  return Array.isArray(value) ? value[ch] : value;
}

/** Crossfader gain for deck `ch` (0 or 1): full on its own side and in the middle. */
export function crossfadeGain(xfader, ch) {
  const lean = ch === 0 ? xfader : -xfader;
  return lean <= 0 ? 1 : clamp(1 - lean, 0, 1);
}

/** How loud channel `ch` is: channel fader x crossfader gain, 0..1. */
export function channelGain(mixer, ch) {
  const fader = channel(mixer, 'fader', ch);
  const xfader = isNum(mixer.xfader) ? mixer.xfader : 0;
  return clamp(isNum(fader) ? fader : 0, 0, 1) * crossfadeGain(xfader, ch);
}

/** True when both decks play and both are audible, so phase matters. */
export function isOverlapping(state) {
  return state.decks.every((deck, ch) => deck.playing && channelGain(state.mixer, ch) >= AUDIBLE_GAIN);
}
