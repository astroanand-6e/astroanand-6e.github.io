/**
 * Try the decks: audio engine entry point.
 *
 *   const engine = createEngine({ bus });
 *   await engine.ready;       // starting tracks rendered
 *   await engine.resume();    // on the first user gesture
 *
 * The engine listens on the shared bus for 'control' events (every live id of
 * the contract) and 'select', emits 'engine' events, and exposes the API the
 * contract in ../controls.js describes. Tracks are synthesized in the browser;
 * the AudioContext is only created once a gesture needs it.
 *
 * @param {{ bus: EventTarget, context?: BaseAudioContext, library?: object }} options
 *   `context` and `library` are test hooks (an OfflineAudioContext, a shared
 *   pre-rendered library); normally the engine creates its own.
 */
import { CONTROL_BY_ID, emit, on } from '../controls.js';
import { buildControlMap, normalizeValue } from './control-map.js';
import { Deck, LOOKAHEAD_SECONDS } from './deck.js';
import { DeckAudio } from './deck-audio.js';
import { phaseOffset } from './grid.js';
import { createLibrary, makeBufferLike } from './library.js';
import { Mixer } from './mixer.js';
import { renderSamplerBank } from './sampler.js';
import { yieldToMain } from './schedule.js';
import { DEFAULT_DECK_TRACK_IDS, TRACKS, TRACK_SAMPLE_RATE, listTracks } from './tracks.js';

const HOUSEKEEPING_MS = 100;
const BACKGROUND_START_DELAY_MS = 50;
const DECK_INDEXES = [0, 1];

function makeAudioBuffer(samples, sampleRate) {
  try {
    const buffer = new AudioBuffer({ length: samples.length, sampleRate, numberOfChannels: 1 });
    buffer.copyToChannel(samples, 0);
    return buffer;
  } catch {
    return makeBufferLike(samples, sampleRate); // no AudioBuffer constructor: DeckAudio converts it later
  }
}

const isOffline = (ctx) => typeof ctx.startRendering === 'function';

function createAudioContext() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Context) throw new Error('Web Audio is not supported in this browser');
  return new Context({ latencyHint: 'interactive' });
}

function samplerBuffers(ctx) {
  const bank = {};
  for (const [name, samples] of Object.entries(renderSamplerBank(TRACK_SAMPLE_RATE))) {
    bank[name] = ctx.createBuffer(1, samples.length, TRACK_SAMPLE_RATE);
    bank[name].copyToChannel(samples, 0);
  }
  return bank;
}

export function createEngine({ bus, context = null, library: sharedLibrary = null } = {}) {
  if (!bus) throw new TypeError('createEngine needs { bus }');
  const session = { ready: false, disposed: false, selection: 0, ctx: null, timer: null };
  const mixer = new Mixer();
  const deckAudio = DECK_INDEXES.map(() => new DeckAudio());
  const decks = DECK_INDEXES.map((index) => new Deck({
    index, audio: deckAudio[index], emit: (event) => emit(bus, 'engine', event), peer: () => decks[1 - index],
  }));
  const library = sharedLibrary ?? createLibrary({ makeBuffer: makeAudioBuffer });
  const unsubscribe = [];

  function reportError(error, extra = {}) {
    console.error('[mix audio]', error);
    emit(bus, 'engine', { type: 'error', message: error instanceof Error ? error.message : String(error), ...extra });
  }

  const now = () => deckAudio[0].now();

  function housekeeping() {
    const time = now();
    decks.forEach((deck) => deck.housekeeping(time));
  }

  /** Creates the AudioContext and graph on first need (a user gesture). */
  function ensureAudio() {
    if (session.ctx) return session.ctx;
    const ctx = context ?? createAudioContext();
    mixer.attach(ctx);
    const samplerBank = samplerBuffers(ctx);
    deckAudio.forEach((audio, i) => audio.attach(ctx, {
      output: mixer.channelInput(i), samplerOutput: mixer.samplerInput(), samplerBank,
    }));
    session.ctx = ctx;
    session.timer = setInterval(housekeeping, HOUSEKEEPING_MS);
    if (!isOffline(ctx) && ctx.state === 'suspended') ctx.resume().catch((error) => reportError(error));
    return ctx;
  }

  /** Keeps followers on the leader's tempo and the echo on the beat. */
  function refreshCoupling() {
    decks.forEach((deck) => deck.followLeader());
    mixer.setDeckTempi(decks.map((deck) => ({ playing: deck.isPlaying(), bpm: deck.bpm * deck.transport.base })));
  }

  function setSelection(index) {
    if (!Number.isInteger(index) || index < 0 || index >= TRACKS.length) {
      reportError(new RangeError(`select index out of range: ${String(index)}`));
      return false;
    }
    const changed = index !== session.selection;
    session.selection = index;
    return changed;
  }

  function browse(step) {
    const next = Math.min(TRACKS.length - 1, Math.max(0, session.selection + step));
    if (setSelection(next)) emit(bus, 'select', { index: next, source: 'engine' });
  }

  async function loadSelected(deckIndex) {
    const deck = decks[deckIndex];
    if (!deck.canLoad()) return; // like the hardware: only a paused deck accepts a load
    try {
      const track = TRACKS[session.selection];
      const record = library.get(track.id) ?? await library.ensure(track.id);
      if (session.disposed || !deck.canLoad()) return;
      deck.load(record);
      refreshCoupling();
    } catch (error) {
      reportError(error, { deck: deckIndex, deckId: deckIndex + 1 });
    }
  }

  function announceFx() {
    emit(bus, 'engine', { type: 'fx', scope: 'beatfx', ...mixer.snapshot().fx });
  }

  const controlMap = buildControlMap({
    decks, mixer, ensureAudio, refreshCoupling, browse, loadSelected, announceFx,
  });

  function handleControl({ id, value, source }) {
    if (source === 'engine' || session.disposed) return;
    const handler = controlMap.get(id);
    if (!handler) return; // not a live control
    try {
      handler(normalizeValue(CONTROL_BY_ID.get(id), value));
    } catch (error) {
      reportError(error, { control: id });
    }
  }

  unsubscribe.push(on(bus, 'control', handleControl));
  unsubscribe.push(on(bus, 'select', ({ index }) => setSelection(index)));

  async function start() {
    for (let i = 0; i < DECK_INDEXES.length; i += 1) {
      const record = await library.ensure(DEFAULT_DECK_TRACK_IDS[i]);
      if (session.disposed) return;
      decks[i].load(record);
    }
    session.ready = true;
    refreshCoupling();
    emit(bus, 'engine', { type: 'ready' });
  }

  const ready = start();
  ready.catch((error) => reportError(error));
  // The remaining tracks render in the background once the starting pair is up.
  ready
    .then(() => yieldToMain(BACKGROUND_START_DELAY_MS))
    .then(() => (session.disposed ? undefined : library.renderRemaining()))
    .catch((error) => { if (!session.disposed) reportError(error); });

  function getState() {
    // Report where the transport is at the instant a change made right now takes effect,
    // so state read straight after a control or seek already shows its result.
    const clock = now();
    const time = clock + LOOKAHEAD_SECONDS;
    const deckStates = decks.map((deck, i) => ({ ...deck.snapshot(time), level: mixer.level(i, clock) }));
    const bothPlaying = deckStates.every((d) => d.track && d.playing);
    return {
      ready: session.ready,
      decks: deckStates,
      mixer: mixer.snapshot(),
      phaseOffset: bothPlaying ? phaseOffset(deckStates[0].beat, deckStates[1].beat) : 0,
    };
  }

  return {
    ready,
    async resume() {
      try {
        const ctx = ensureAudio();
        if (!isOffline(ctx) && ctx.state !== 'running') await ctx.resume();
      } catch (error) {
        reportError(error);
        throw error;
      }
    },
    getState,
    getTracks: listTracks,
    getSelection: () => session.selection,
    getWaveform: (trackId) => library.waveform(trackId),
    seek(deck, seconds) {
      if (!Number.isInteger(deck) || deck < 0 || deck > 1 || !Number.isFinite(seconds)) {
        reportError(new RangeError(`seek needs a deck index 0|1 and finite seconds, got ${String(deck)}, ${String(seconds)}`));
        return;
      }
      decks[deck].seek(seconds);
      refreshCoupling();
    },
    dispose() {
      if (session.disposed) return;
      session.disposed = true;
      unsubscribe.forEach((off) => off());
      clearInterval(session.timer);
      deckAudio.forEach((audio) => audio.dispose());
      if (session.ctx && !context && typeof session.ctx.close === 'function') session.ctx.close().catch(reportError);
    },
  };
}
