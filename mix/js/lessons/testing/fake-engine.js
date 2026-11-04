/**
 * A small simulated engine for the lessons' tests and dev harness.
 * It follows the contract in mix/js/controls.js (state shape, events, value
 * conventions) with CDJ-style cue, quantized cue/loop/hot cue setting (switch it
 * off with quantize: false), beat sync and jog nudges. It makes no sound.
 * Time comes from an injected clock and is integrated lazily, so a manual clock
 * gives fully deterministic runs.
 */
import { PAD_COUNT, PHRASE_BEATS, BEATS_PER_BAR, TEMPO_RANGE, emit, on } from '../../controls.js';
import { mod } from '../util.js';

export const DEMO_TRACKS = Object.freeze([
  { id: 'night-drive', title: 'Night Drive', artist: 'Demo', bpm: 124, key: 'A minor', camelot: '8A', duration: 210 },
  { id: 'glass-rooms', title: 'Glass Rooms', artist: 'Demo', bpm: 120, key: 'E minor', camelot: '9A', duration: 220 },
  { id: 'low-tide', title: 'Low Tide', artist: 'Demo', bpm: 128, key: 'D minor', camelot: '7A', duration: 200 },
].map(Object.freeze));

const SECONDS_PER_MINUTE = 60;
export const NUDGE_SECONDS_PER_TURN = 0.6;
const CUE_PREVIEW_EPSILON_S = 0.03;
const CHANNEL_KNOB = /^m\.(trim|hi|mid|low|cfx|fader)([12])$/;
const DECK_CONTROL = /^d([12])\.(.+)$/;
const PAD = /^pad(\d)$/;
const PAD_MODE = /^mode\.(\w+)$/;

const newDeck = () => ({
  track: null, playing: false, previewing: false, position: 0, tempo: 0, synced: false,
  cuePoint: 0, hotCues: Array(PAD_COUNT).fill(null), loop: null, padMode: 'hotcue',
});

const newMixer = () => ({
  trim: [0, 0], hi: [0, 0], mid: [0, 0], low: [0, 0], cfx: [0, 0], fader: [1, 0],
  xfader: 0, master: 0.8, fx: { on: false, level: 0.5, beats: 1, channel: '1&2' },
});

export function createFakeEngine({ bus, tracks = DEMO_TRACKS, clock, quantize = true }) {
  const decks = [newDeck(), newDeck()];
  const mixer = newMixer();
  let selection = 0;
  let lastNow = clock.now();

  const native = (deck) => (deck.track ? deck.track.bpm : 0);
  const baseRate = (deck) => 1 + deck.tempo * TEMPO_RANGE;
  const beatAt = (deck, seconds = deck.position) => (seconds * native(deck)) / SECONDS_PER_MINUTE;
  const secondsOf = (deck, beat) => (beat * SECONDS_PER_MINUTE) / native(deck);
  const snap = (deck, seconds) => (quantize ? secondsOf(deck, Math.round(beatAt(deck, seconds))) : seconds);
  const tell = (type, index, extra = {}) => emit(bus, 'engine', { type, deck: index, ...extra });

  function rate(index) {
    const deck = decks[index];
    const other = decks[1 - index];
    if (deck.synced && other.track && deck.track) return (native(other) * baseRate(other)) / native(deck);
    return baseRate(deck);
  }

  /** Brings every deck up to the clock's now. */
  function advance() {
    const now = clock.now();
    const dt = now - lastNow;
    lastNow = now;
    if (dt <= 0) return;
    decks.forEach((deck, index) => {
      if (!deck.playing || !deck.track) return;
      let position = deck.position + dt * rate(index);
      if (deck.loop && position >= deck.loop.end) {
        position = deck.loop.start + mod(position - deck.loop.start, deck.loop.end - deck.loop.start);
      }
      deck.position = Math.min(position, deck.track.duration);
      if (deck.position >= deck.track.duration) deck.playing = false;
    });
  }

  function deckState(deck, index) {
    const beat = beatAt(deck);
    const effectiveRate = deck.track ? rate(index) : 1;
    return {
      id: index + 1,
      track: deck.track,
      playing: deck.playing,
      position: deck.position,
      duration: deck.track ? deck.track.duration : 0,
      bpm: native(deck) * effectiveRate,
      rate: effectiveRate,
      tempo: deck.tempo,
      synced: deck.synced,
      cuePoint: deck.cuePoint,
      hotCues: deck.hotCues.slice(),
      loop: deck.loop ? { ...deck.loop } : null,
      padMode: deck.padMode,
      beat,
      bar: Math.floor(beat / BEATS_PER_BAR) + 1,
      phraseBeat: mod(beat, PHRASE_BEATS),
      level: deck.playing ? 0.7 : 0,
    };
  }

  function getState() {
    advance();
    const [a, b] = decks;
    const diff = mod(beatAt(b), 1) - mod(beatAt(a), 1);
    return {
      ready: true,
      decks: decks.map(deckState),
      mixer: {
        ...mixer,
        trim: mixer.trim.slice(), hi: mixer.hi.slice(), mid: mixer.mid.slice(),
        low: mixer.low.slice(), cfx: mixer.cfx.slice(), fader: mixer.fader.slice(),
        fx: { ...mixer.fx },
      },
      phaseOffset: diff - Math.round(diff),
    };
  }

  function alignPhaseTo(index) {
    const deck = decks[index];
    const other = decks[1 - index];
    if (!deck.track || !other.track) return;
    const diff = mod(beatAt(other), 1) - mod(beatAt(deck), 1);
    deck.position += secondsOf(deck, diff - Math.round(diff));
  }

  function pressCue(index, down) {
    const deck = decks[index];
    if (!deck.track) return;
    if (!down) {
      if (deck.previewing) Object.assign(deck, { position: deck.cuePoint, playing: false, previewing: false });
      return;
    }
    if (deck.playing) {
      Object.assign(deck, { position: deck.cuePoint, playing: false });
      tell('cue', index);
    } else if (Math.abs(deck.position - deck.cuePoint) <= CUE_PREVIEW_EPSILON_S) {
      Object.assign(deck, { playing: true, previewing: true });
    } else {
      deck.cuePoint = snap(deck, deck.position);
      tell('cue', index);
    }
  }

  function pressPad(index, number) {
    const deck = decks[index];
    if (!deck.track || deck.padMode !== 'hotcue') return;
    const slot = number - 1;
    if (deck.hotCues[slot] === null) {
      deck.hotCues[slot] = snap(deck, deck.position);
      tell('hotcue-set', index, { index: slot });
    } else {
      deck.position = deck.hotCues[slot];
      tell('hotcue-jump', index, { index: slot });
    }
  }

  function setLoopBeats(deck, beats) {
    deck.loop = { start: deck.loop.start, end: deck.loop.start + secondsOf(deck, beats), beats };
  }

  function handleDeck(index, name, value) {
    const deck = decks[index];
    const pad = PAD.exec(name);
    const mode = PAD_MODE.exec(name);
    if (pad && value === true) return pressPad(index, Number(pad[1]));
    if (mode && value === true) { deck.padMode = mode[1]; return undefined; }
    if (name === 'play' && value === true && deck.track) {
      deck.playing = !deck.playing;
      deck.previewing = false;
      return tell(deck.playing ? 'play' : 'pause', index);
    }
    if (name === 'cue') return pressCue(index, value === true);
    if (name === 'sync' && value === true && deck.track) {
      deck.synced = true;
      alignPhaseTo(index);
      return tell('sync', index);
    }
    if (name === 'tempo') { deck.tempo = value; deck.synced = false; return undefined; }
    if (name === 'jog' && deck.playing) { deck.position += value.delta * NUDGE_SECONDS_PER_TURN; return undefined; }
    if (name.startsWith('loop.') && value === true) return handleLoop(index, name.slice(5));
    return undefined;
  }

  function handleLoop(index, name) {
    const deck = decks[index];
    if (!deck.track) return undefined;
    if (name === 'exit' && deck.loop) {
      deck.loop = null;
      return tell('loop', index, { active: false });
    }
    if (name === 'exit') {
      const start = snap(deck, deck.position);
      deck.loop = { start, end: start + secondsOf(deck, 4), beats: 4 };
      return tell('loop', index, { active: true });
    }
    if (name === 'half' && deck.loop) setLoopBeats(deck, deck.loop.beats / 2);
    if (name === 'double' && deck.loop) setLoopBeats(deck, deck.loop.beats * 2);
    return undefined;
  }

  function loadSelected(index) {
    const deck = decks[index];
    Object.assign(deck, newDeck(), { track: tracks[selection], padMode: deck.padMode, tempo: deck.tempo });
    tell('loaded', index);
  }

  function handleMixer(id, value) {
    const knob = CHANNEL_KNOB.exec(id);
    if (knob) { mixer[knob[1]][Number(knob[2]) - 1] = value; return; }
    if (id === 'm.xfader' || id === 'm.master') { mixer[id.slice(2)] = value; return; }
    const load = /^m\.load([12])$/.exec(id);
    if (load && value === true) loadSelected(Number(load[1]) - 1);
  }

  on(bus, 'control', ({ id, value, source }) => {
    if (source === 'engine') return;
    advance();
    const deck = DECK_CONTROL.exec(id);
    if (deck) handleDeck(Number(deck[1]) - 1, deck[2], value);
    else handleMixer(id, value);
  });
  on(bus, 'select', ({ index }) => { selection = index; });

  return {
    ready: Promise.resolve(),
    resume: () => Promise.resolve(),
    getState,
    getTracks: () => tracks,
    getSelection: () => selection,
    getWaveform: () => ({ binSeconds: 1, low: new Float32Array(0), mid: new Float32Array(0), high: new Float32Array(0) }),
    seek(index, seconds) {
      advance();
      const deck = decks[index];
      deck.position = Math.max(0, Math.min(seconds, deck.track ? deck.track.duration : 0));
      tell('seek', index);
    },
    dispose() {},
  };
}
