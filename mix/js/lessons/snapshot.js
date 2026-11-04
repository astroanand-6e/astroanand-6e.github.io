/**
 * Frozen copies of engine.getState() for the lesson ctx.
 *
 * A captured snapshot has exactly the shape of getState(), so every metric and
 * check works the same on the live state, on `ctx.prev`, on `ctx.start`, on
 * event.at and on samples. Capturing also protects done() from an engine that
 * mutates its state object in place.
 */
import { isNum, mod } from './util.js';
import { PHRASE_BEATS, BEATS_PER_BAR } from '../controls.js';

const SECONDS_PER_MINUTE = 60;

function copyDeck(deck) {
  return {
    ...deck,
    hotCues: Array.isArray(deck.hotCues) ? deck.hotCues.slice() : [],
    loop: deck.loop ? { ...deck.loop } : null,
  };
}

function copyMixer(mixer) {
  const copy = {};
  for (const [key, value] of Object.entries(mixer || {})) {
    if (Array.isArray(value)) copy[key] = value.slice();
    else copy[key] = value && typeof value === 'object' ? { ...value } : value;
  }
  return copy;
}

/** Copy of an engine state that later engine changes cannot touch. */
export function capture(state) {
  return {
    ready: state.ready,
    decks: state.decks.map(copyDeck),
    mixer: copyMixer(state.mixer),
    phaseOffset: state.phaseOffset,
  };
}

function rateOf(deck) {
  if (isNum(deck.rate)) return deck.rate;
  const native = deck.track && deck.track.bpm;
  return native > 0 && deck.bpm > 0 ? deck.bpm / native : 1;
}

function advanceDeck(deck, seconds) {
  if (!deck.playing || !(deck.bpm > 0) || !isNum(deck.beat)) return deck;
  const native = deck.track && deck.track.bpm > 0 ? deck.track.bpm : deck.bpm;
  let position = deck.position + seconds * rateOf(deck);
  if (deck.loop && position >= deck.loop.end) {
    const length = deck.loop.end - deck.loop.start;
    position = deck.loop.start + mod(position - deck.loop.start, length);
  }
  const beat = deck.beat + ((position - deck.position) * native) / SECONDS_PER_MINUTE;
  const phraseBeat = isNum(deck.phraseBeat)
    ? mod(deck.phraseBeat + (beat - deck.beat), PHRASE_BEATS)
    : deck.phraseBeat;
  return { ...deck, position, beat, bar: Math.floor(beat / BEATS_PER_BAR) + 1, phraseBeat };
}

/**
 * Estimates the state `seconds` after a snapshot by letting playing decks run on.
 * Used to read "the state just before the engine reacted" for button events.
 */
export function extrapolate(snapshot, seconds) {
  if (!(seconds > 0)) return snapshot;
  return { ...snapshot, decks: snapshot.decks.map((deck) => advanceDeck(deck, seconds)) };
}
