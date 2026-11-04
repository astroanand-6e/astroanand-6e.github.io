/**
 * Development stand-in for mix/js/audio/engine.js, used only with ?fake. It follows the
 * contract in ../controls.js and keeps plausible, moving state: decks play and loop, sync
 * matches tempo, the meters follow the waveform. It makes no sound. State is replaced, not
 * mutated: each change builds a new deck object.
 */
import { BEATS_PER_BAR, PHRASE_BEATS, TEMPO_RANGE, emit, on } from '../controls.js';
import { FAKE_TRACKS, makeWaveform } from './fake-tracks.js';

const SCRUB_SECONDS_PER_TURN = 1.8;
const BEND_PER_TURN = 4;
const BEND_DECAY_PER_SECOND = 7;
const MAX_BEND = 0.3;
const MAX_STEP_SECONDS = 0.1;
const BEAT_JUMPS = Object.freeze([-1, -2, -4, -8, 1, 2, 4, 8]);
const FX_BEATS = Object.freeze([0.25, 0.5, 1, 2, 4, 8]);
const AT_CUE_SECONDS = 0.05;
const DEFAULT_LOOP_BEATS = 4;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function freshDeck(track = null) {
  return {
    track, playing: false, position: 0, duration: track ? track.duration : 0, rate: 1, tempo: 0, synced: false,
    cuePoint: 0, hotCues: Array(8).fill(null), loop: null, loopStart: null, padMode: 'hotcue',
    bend: 0, touching: false, shift: false, previewing: false,
  };
}

export function createFakeEngine({ bus }) {
  let decks = [freshDeck(FAKE_TRACKS[0]), freshDeck(FAKE_TRACKS[1])];
  let mixer = {
    trim: [0, 0], hi: [0, 0], mid: [0, 0], low: [0, 0], cfx: [0, 0], fader: [1, 0], xfader: 0, master: 0.8,
    fx: { on: false, level: 0.5, beats: 1, channel: '1&2' },
  };
  let selection = 0;
  let clock = performance.now();
  const waves = new Map();
  const announce = (type, extra = {}) => emit(bus, 'engine', { type, ...extra });
  const patch = (i, changes) => { decks = decks.map((deck, n) => (n === i ? { ...deck, ...changes } : deck)); };

  function waveFor(track) {
    if (!waves.has(track.id)) waves.set(track.id, makeWaveform(track, FAKE_TRACKS.indexOf(track) + 1));
    return waves.get(track.id);
  }

  function advance(i, dt) {
    const deck = decks[i];
    if (!deck.track) return;
    const other = decks[1 - i];
    const ownRate = 1 + deck.tempo * TEMPO_RANGE;
    const rate = deck.synced && other.track ? (other.track.bpm * (1 + other.tempo * TEMPO_RANGE)) / deck.track.bpm : ownRate;
    const bend = deck.bend * Math.exp(-BEND_DECAY_PER_SECOND * dt);
    const running = deck.playing && !deck.touching;
    let position = deck.position + (running ? dt * rate * (1 + bend) : 0);
    if (deck.loop && position >= deck.loop.end) position = deck.loop.start + (position - deck.loop.end);
    const ended = position >= deck.duration;
    patch(i, { position: ended ? deck.duration : position, rate, bend, playing: ended ? false : deck.playing });
  }

  function step() {
    const now = performance.now();
    const dt = Math.min(MAX_STEP_SECONDS, (now - clock) / 1000);
    clock = now;
    advance(0, dt);
    advance(1, dt);
  }

  function crossfadeGain(channel) {
    const x = mixer.xfader;
    return channel === 0 ? 1 - Math.max(0, x) : 1 + Math.min(0, x);
  }

  function levelOf(deck, channel) {
    if (!deck.track || !deck.playing) return 0;
    const wave = waveFor(deck.track);
    const bin = Math.min(wave.low.length - 1, Math.floor(deck.position / wave.binSeconds));
    const raw = Math.max(wave.low[bin], wave.mid[bin] * 0.8, wave.high[bin] * 0.6);
    return clamp(raw * mixer.fader[channel] * crossfadeGain(channel) * (0.55 + 0.45 * mixer.master), 0, 1);
  }

  function describe(deck, channel) {
    const { track } = deck;
    const beat = track ? (deck.position * track.bpm) / 60 : 0;
    return {
      id: channel, track, playing: deck.playing, position: deck.position, duration: deck.duration,
      bpm: track ? track.bpm * deck.rate : 0, rate: deck.rate, tempo: deck.tempo, synced: deck.synced,
      cuePoint: deck.cuePoint, hotCues: [...deck.hotCues], loop: deck.loop, padMode: deck.padMode,
      beat, bar: Math.floor(beat / BEATS_PER_BAR) + 1, phraseBeat: beat % PHRASE_BEATS, level: levelOf(deck, channel),
    };
  }

  function getState() {
    step();
    const [a, b] = decks.map(describe);
    const drift = (b.beat % 1) - (a.beat % 1);
    return {
      ready: true, decks: [a, b], mixer, phaseOffset: a.track && b.track ? drift - Math.round(drift) : 0,
    };
  }

  function load(i, trackIndex) {
    const track = FAKE_TRACKS[trackIndex];
    if (!track) return;
    decks = decks.map((deck, n) => (n === i ? freshDeck(track) : deck));
    announce('loaded', { deck: i, track });
  }

  function togglePlay(i) {
    const deck = decks[i];
    if (!deck.track) return;
    patch(i, { playing: !deck.playing, previewing: false });
    announce(deck.playing ? 'pause' : 'play', { deck: i });
  }

  function cue(i, down) {
    const deck = decks[i];
    if (!deck.track) return;
    if (!down) {
      if (deck.previewing) patch(i, { playing: false, previewing: false, position: deck.cuePoint });
      return;
    }
    if (deck.playing) patch(i, { playing: false, position: deck.cuePoint });
    else if (Math.abs(deck.position - deck.cuePoint) < AT_CUE_SECONDS) patch(i, { playing: true, previewing: true });
    else patch(i, { cuePoint: deck.position });
    announce('cue', { deck: i });
  }

  function toggleSync(i) {
    const deck = decks[i];
    const other = decks[1 - i];
    if (!deck.track) return;
    if (deck.synced) {
      patch(i, { synced: false });
      return;
    }
    patch(i, { synced: true });
    if (other.track) {
      const own = (deck.position * deck.track.bpm) / 60;
      const theirs = (other.position * other.track.bpm) / 60;
      const gap = (theirs % 1) - (own % 1);
      patch(i, { position: deck.position + ((gap - Math.round(gap)) * 60) / deck.track.bpm });
    }
    announce('sync', { deck: i });
  }

  function jog(i, { delta, touch }) {
    const deck = decks[i];
    if (!deck.track) return;
    if (touch !== deck.touching) patch(i, { touching: touch });
    if (!delta) return;
    if (touch) patch(i, { position: clamp(deck.position + delta * SCRUB_SECONDS_PER_TURN, 0, deck.duration) });
    else patch(i, { bend: clamp(deck.bend + delta * BEND_PER_TURN, -MAX_BEND, MAX_BEND) });
  }

  function pad(i, index, down) {
    const deck = decks[i];
    if (!deck.track || !down) return;
    if (deck.padMode === 'beatjump') {
      const seconds = (BEAT_JUMPS[index] * 60) / deck.track.bpm;
      patch(i, { position: clamp(deck.position + seconds, 0, deck.duration) });
      announce('beatjump', { deck: i });
    } else if (deck.padMode === 'sampler') announce('sample', { deck: i, pad: index });
    else if (deck.padMode === 'hotcue') hotCue(i, index);
  }

  function hotCue(i, index) {
    const deck = decks[i];
    const set = (seconds) => deck.hotCues.map((cuePosition, n) => (n === index ? seconds : cuePosition));
    if (deck.shift) {
      patch(i, { hotCues: set(null) });
      announce('hotcue-clear', { deck: i, pad: index });
    } else if (deck.hotCues[index] == null) {
      patch(i, { hotCues: set(deck.position) });
      announce('hotcue-set', { deck: i, pad: index });
    } else {
      patch(i, { position: deck.hotCues[index], playing: true });
      announce('hotcue-jump', { deck: i, pad: index });
    }
  }

  function loopControl(i, key) {
    const deck = decks[i];
    if (!deck.track) return;
    const perBeat = 60 / deck.track.bpm;
    const make = (start, end) => ({ start, end, beats: (end - start) / perBeat });
    if (key === 'in') patch(i, { loopStart: deck.position });
    else if (key === 'out' && deck.loopStart !== null && deck.position > deck.loopStart) patch(i, { loop: make(deck.loopStart, deck.position) });
    else if (key === 'exit') patch(i, { loop: deck.loop ? null : make(deck.position, deck.position + DEFAULT_LOOP_BEATS * perBeat) });
    else if (deck.loop && key === 'half') patch(i, { loop: make(deck.loop.start, deck.loop.start + (deck.loop.end - deck.loop.start) / 2) });
    else if (deck.loop && key === 'double') patch(i, { loop: make(deck.loop.start, deck.loop.start + (deck.loop.end - deck.loop.start) * 2) });
    announce('loop', { deck: i });
  }

  function deckControl(i, key, value) {
    if (key === 'cue') cue(i, value);
    else if (key === 'jog') jog(i, value);
    else if (key === 'shift') patch(i, { shift: value });
    else if (key === 'tempo') patch(i, { tempo: value });
    else if (key.startsWith('pad')) pad(i, Number(key.slice(3)) - 1, value);
    else if (!value) return;
    else if (key === 'play') togglePlay(i);
    else if (key === 'sync') toggleSync(i);
    else if (key.startsWith('mode.')) patch(i, { padMode: key.slice(5) });
    else if (key.startsWith('loop.')) loopControl(i, key.slice(5));
  }

  function setChannel(list, channel, value) {
    return list.map((current, n) => (n === channel ? value : current));
  }

  function mixerControl(id, value) {
    const channel = /\d$/.test(id) ? Number(id.slice(-1)) - 1 : -1;
    const name = id.slice(2).replace(/\d$/, '');
    if (name === 'load') {
      if (value) load(channel, selection);
    } else if (name === 'browse') selection = clamp(selection + value, 0, FAKE_TRACKS.length - 1);
    else if (['trim', 'hi', 'mid', 'low', 'cfx', 'fader'].includes(name)) mixer = { ...mixer, [name]: setChannel(mixer[name], channel, value) };
    else if (name === 'xfader' || name === 'master') mixer = { ...mixer, [name]: value };
    else if (name.startsWith('fx.')) fxControl(name.slice(3), value);
  }

  function fxControl(key, value) {
    const fx = { ...mixer.fx };
    if (key === 'on') fx.on = value;
    else if (key === 'level') fx.level = value;
    else if (key === 'channel') fx.channel = value;
    else if (value && (key === 'beatdown' || key === 'beatup')) {
      const next = FX_BEATS.indexOf(fx.beats) + (key === 'beatup' ? 1 : -1);
      fx.beats = FX_BEATS[clamp(next, 0, FX_BEATS.length - 1)];
    }
    mixer = { ...mixer, fx };
    announce('fx');
  }

  const unsubscribe = [
    on(bus, 'control', ({ id, value }) => {
      const deck = /^d([12])\.(.+)$/.exec(id);
      if (deck) deckControl(Number(deck[1]) - 1, deck[2], value);
      else mixerControl(id, value);
    }),
    on(bus, 'select', ({ index }) => { selection = clamp(index, 0, FAKE_TRACKS.length - 1); }),
  ];

  return {
    ready: Promise.resolve(),
    resume: () => Promise.resolve(),
    getState,
    getTracks: () => FAKE_TRACKS.map((track) => ({ ...track })),
    getSelection: () => selection,
    getWaveform: (trackId) => {
      const track = FAKE_TRACKS.find((t) => t.id === trackId);
      return track ? waveFor(track) : null;
    },
    seek(deck, seconds) {
      patch(deck, { position: clamp(seconds, 0, decks[deck].duration) });
      announce('seek', { deck });
    },
    dispose: () => unsubscribe.forEach((off) => off()),
  };
}
