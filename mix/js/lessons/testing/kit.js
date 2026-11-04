/**
 * Builders for synthetic engine states, events and step ctx objects.
 * Lesson tests describe a moment ("deck 2 at beat 64, low killed") instead of
 * running audio. Everything returns fresh objects; nothing is shared.
 */
import { PAD_COUNT } from '../../controls.js';
import { mod } from '../util.js';

export const TRACK = Object.freeze({
  id: 'test', title: 'Test Track', artist: 'Test', bpm: 120, key: 'A minor', camelot: '8A', duration: 240,
});

const SECONDS_PER_MINUTE = 60;
export const T0 = 1000;

/** A deck sitting on `beat` of its grid. `bpm` is the effective BPM (tempo fader applied). */
export function deckAt(beat, over = {}) {
  const track = over.track === undefined ? TRACK : over.track;
  const native = track ? track.bpm : 120;
  return {
    id: 1,
    track,
    playing: false,
    position: (beat * SECONDS_PER_MINUTE) / native,
    duration: track ? track.duration : 0,
    bpm: native,
    rate: 1,
    tempo: 0,
    synced: false,
    cuePoint: 0,
    hotCues: Array(PAD_COUNT).fill(null),
    loop: null,
    padMode: 'hotcue',
    beat,
    bar: Math.floor(beat / 4) + 1,
    phraseBeat: mod(beat, 32),
    level: 0,
    ...over,
  };
}

export function mixerState(over = {}) {
  return {
    trim: [0, 0], hi: [0, 0], mid: [0, 0], low: [0, 0], cfx: [0, 0], fader: [1, 0],
    xfader: 0, master: 0.8, fx: { on: false, level: 0.5, beats: 1, channel: '1&2' },
    ...over,
  };
}

export function stateOf(over = {}) {
  return { ready: true, decks: [deckAt(0), deckAt(0)], mixer: mixerState(), phaseOffset: 0, ...over };
}

/** Copy of a state with deck `index` changed. */
export function withDeck(state, index, over) {
  return { ...state, decks: state.decks.map((deck, i) => (i === index ? { ...deck, ...over } : deck)) };
}

export function withMixer(state, over) {
  return { ...state, mixer: { ...state.mixer, ...over } };
}

/** Both decks playing on the same beat, in phase, deck 1 at full and deck 2 up. */
export function playingBoth(beat = 64, over = {}) {
  return stateOf({
    decks: [deckAt(beat, { playing: true }), deckAt(beat, { playing: true, id: 2 })],
    mixer: mixerState({ fader: [1, 1], ...over }),
  });
}

export function ctxOf(over = {}) {
  const state = over.state || stateOf();
  return { state, prev: state, start: state, events: [], samples: [], elapsed: 0, ...over };
}

export function control(id, value, t = 0, over = {}) {
  return { kind: 'control', id, value, source: 'pointer', t, abs: T0 + t, at: stateOf(), ...over };
}

export const press = (id, t = 0, at = stateOf()) => control(id, true, t, { at });

export const sample = (t, at) => ({ t, abs: T0 + t, at });

/** Samples every 100 ms from `from` to `to` seconds, each produced by `make(t)`. */
export function samplesBetween(from, to, make) {
  const out = [];
  for (let t = from; t <= to + 1e-9; t += 0.1) out.push(sample(t, make(t)));
  return out;
}
