/**
 * Setup api: puts the decks and mixer into a known state at the start of a step.
 * Everything goes through the contract: bus events with source 'lesson' (the
 * controller redraws from them) and engine.seek. Time is injected as `wait` so
 * the same code runs against real time and a simulated clock.
 */
import { CONTROL_BY_ID, PHRASE_BEATS, TEMPO_RANGE, defaultValue, emit, emitControl, on } from '../controls.js';
import { channel, nativeBpm, phrasePos, secondsAtBeat } from './metrics.js';
import { planPair } from './pair.js';
import { DEFAULT_PAIR } from './scenes.js';
import { clamp, mod } from './util.js';

export const SETUP_SOURCE = 'lesson';
/** Tracks are synthesized in the browser on first use, so a load can take a while. */
const LOAD_TIMEOUT_MS = 20000;
const POLL_MS = 40;
const PRESS_SETTLE_MS = 60;
const SYNC_SETTLE_MS = 140;
const ENSURE_TOLERANCE = 0.03;
const MIN_RUNWAY_BEATS = 64;
const PHASE_FIX_FROM_BEATS = 0.01;
const SECONDS_PER_MINUTE = 60;

const CHANNEL_KNOBS = ['trim', 'hi', 'mid', 'low', 'cfx', 'fader'];
const RESET_IDS = Object.freeze([
  'd1.tempo', 'd2.tempo', 'm.master', 'm.xfader',
  ...[1, 2].flatMap((n) => CHANNEL_KNOBS.map((knob) => `m.${knob}${n}`)),
]);
const CHANNEL_CONTROL = /^m\.(trim|hi|mid|low|cfx|fader)([12])$/;
const DECK_TEMPO = /^d([12])\.tempo$/;

/** Tempo fader position (-1..1) that makes a track of `native` BPM run at `target` BPM. */
export function faderForBpm(target, native) {
  return clamp((target / native - 1) / TEMPO_RANGE, -1, 1);
}

/** Current value of a control as the engine reports it, or undefined if not tracked. */
export function readControl(state, id) {
  const knob = CHANNEL_CONTROL.exec(id);
  if (knob) return channel(state.mixer, knob[1], Number(knob[2]) - 1);
  const tempo = DECK_TEMPO.exec(id);
  if (tempo) return state.decks[Number(tempo[1]) - 1].tempo;
  if (id === 'm.xfader') return state.mixer.xfader;
  if (id === 'm.master') return state.mixer.master;
  return undefined;
}

export function createSetupApi({ bus, engine, wait }) {
  const state = () => engine.getState();
  const tracks = () => engine.getTracks();

  const set = (id, value) => emitControl(bus, id, value, SETUP_SOURCE);
  const press = (id) => {
    emitControl(bus, id, true, SETUP_SOURCE);
    emitControl(bus, id, false, SETUP_SOURCE);
  };

  /** Sets only the controls that are not already at the value. Safe to repeat. */
  function ensure(controls) {
    const now = state();
    for (const [id, value] of Object.entries(controls)) {
      const current = readControl(now, id);
      if (typeof current !== 'number' || Math.abs(current - value) > ENSURE_TOLERANCE) set(id, value);
    }
  }

  function resetMixer(overrides = {}) {
    for (const id of RESET_IDS) set(id, id in overrides ? overrides[id] : defaultValue(id));
    for (const [id, value] of Object.entries(overrides)) {
      if (!RESET_IDS.includes(id) && CONTROL_BY_ID.has(id)) set(id, value);
    }
  }

  async function stopDecks() {
    state().decks.forEach((deck, index) => {
      if (deck.playing) press(`d${index + 1}.play`);
    });
    await wait(PRESS_SETTLE_MS);
  }

  /** Loads library row `trackIndex` onto a deck (0 or 1) and waits until the deck shows it. */
  async function load(deckIndex, trackIndex) {
    const wanted = tracks()[trackIndex];
    if (!wanted) throw new Error(`No library row ${trackIndex}`);
    const before = state().decks[deckIndex].track;
    let sawLoaded = false;
    const stopListening = on(bus, 'engine', (detail) => {
      if (detail.type === 'loaded') sawLoaded = true;
    });
    try {
      emit(bus, 'select', { index: trackIndex });
      press(`m.load${deckIndex + 1}`);
      for (let waited = 0; waited <= LOAD_TIMEOUT_MS; waited += POLL_MS) {
        const shown = state().decks[deckIndex].track;
        const isWanted = shown && shown.id === wanted.id;
        if (isWanted && (sawLoaded || !before || before.id !== wanted.id)) return;
        await wait(POLL_MS);
      }
    } finally {
      stopListening();
    }
    throw new Error(`Deck ${deckIndex + 1} did not load "${wanted.title}"`);
  }

  /**
   * Moves a deck so its phrase position is `phrase` (0..32), in a phrase at or
   * after `minBeat` and with at least 64 beats of track left to play.
   */
  function place(deckIndex, { phrase, minBeat = 0 }) {
    const deck = state().decks[deckIndex];
    if (!deck.track) throw new Error(`Deck ${deckIndex + 1} has no track`);
    const trackBeats = (deck.duration * nativeBpm(deck)) / SECONDS_PER_MINUTE;
    const maxBeat = Math.max(0, trackBeats - MIN_RUNWAY_BEATS);
    let beat = deck.beat + mod(phrase - phrasePos(deck), PHRASE_BEATS);
    while (beat < minBeat) beat += PHRASE_BEATS;
    while (beat > maxBeat && beat - PHRASE_BEATS >= 0) beat -= PHRASE_BEATS;
    engine.seek(deckIndex, Math.max(0, secondsAtBeat(deck, beat)));
  }

  /** Moves a deck to an exact beat counter value. */
  function seekBeat(deckIndex, beat) {
    const deck = state().decks[deckIndex];
    if (!deck.track) throw new Error(`Deck ${deckIndex + 1} has no track`);
    engine.seek(deckIndex, Math.max(0, secondsAtBeat(deck, beat)));
  }

  /** Starts the flagged decks that are not playing yet, deck 1 first. */
  function ensurePlaying(flags) {
    flags.forEach((wanted, index) => {
      if (wanted && state().decks[index].track && !state().decks[index].playing) press(`d${index + 1}.play`);
    });
  }

  /** Presses SYNC on deck 2, then nudges it into phase if the engine left a gap. */
  async function syncDeck2() {
    press('d2.sync');
    await wait(SYNC_SETTLE_MS);
    const now = state();
    if (Math.abs(now.phaseOffset) <= PHASE_FIX_FROM_BEATS) return;
    const deck = now.decks[1];
    engine.seek(1, deck.position - (now.phaseOffset * SECONDS_PER_MINUTE) / nativeBpm(deck));
  }

  function applyTempo(tempo2) {
    const now = state();
    const value = typeof tempo2 === 'function'
      ? tempo2({ bpm1: now.decks[0].bpm, native2: nativeBpm(now.decks[1]) })
      : tempo2;
    set('d2.tempo', value);
  }

  /**
   * Builds a whole starting position in a fixed order: stop, reset the mixer,
   * load, tempo, pad mode, place, play, sync. Every part is optional.
   *   pairOptions  planPair options (which two rows to load)
   *   load         [deck 1, deck 2] flags, default both
   *   mixer        control overrides on top of the mixer defaults
   *   tempo2       deck 2 tempo fader: a number, or ({ bpm1, native2 }) => number
   *   at           { phrase, minBeat } place deck 1 (and deck 2, shifted by `offset` beats)
   *   play         [deck 1, deck 2] flags; deck 1 starts first
   *   sync         press BEAT SYNC on deck 2 after both play
   *   padMode      pad mode to put deck 1 in
   */
  async function scene(spec) {
    const { pairOptions = DEFAULT_PAIR, load: loads = [true, true], mixer = {}, tempo2 = 0, at = null,
      offset = 0, play = [false, false], sync = false, padMode = null } = spec;
    await stopDecks();
    resetMixer(mixer);
    const pair = planPair(tracks(), pairOptions);
    if (loads[0]) await load(0, pair.a);
    if (loads[1]) await load(1, pair.b);
    if (loads[1]) applyTempo(tempo2);
    if (padMode) press(`d1.mode.${padMode}`);
    if (at && loads[0]) place(0, at);
    if (at && loads[1]) place(1, { ...at, phrase: mod(at.phrase + offset, PHRASE_BEATS) });
    ensurePlaying(play);
    if (sync) await syncDeck2();
    return pair;
  }

  return {
    bus, engine, wait, state, tracks, set, press, ensure, ensurePlaying, resetMixer, stopDecks, load, place, seekBeat, scene,
  };
}
