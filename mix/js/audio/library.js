/**
 * The track library: renders songs on demand, caches the finished audio and
 * its waveform, and hands decks ready-to-play buffers.
 *
 * Rendering is pure JS DSP (see synth/) in time slices on the main thread.
 * The two starting tracks render first; the rest follow in the background or
 * on first load, whichever comes first.
 */
import { TRACKS, TRACK_SAMPLE_RATE, trackById } from './tracks.js';
import { renderSong } from './synth/render.js';
import { songById } from './synth/songs/index.js';
import { emptyWaveform, waveformSteps } from './waveform.js';
import { runSliced } from './schedule.js';

const FOREGROUND = { sliceMs: 8, idleMs: 0 };
const BACKGROUND = { sliceMs: 5, idleMs: 6 };

/** Minimal AudioBuffer stand-in used when no Web Audio is available (tests). */
export function makeBufferLike(samples, sampleRate) {
  return {
    length: samples.length,
    sampleRate,
    duration: samples.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => samples,
  };
}

/**
 * @param {{ makeBuffer?: (samples: Float32Array, sampleRate: number) => object }} options
 */
export function createLibrary({ makeBuffer = makeBufferLike } = {}) {
  const pending = new Map();
  const finished = new Map();

  async function render(id, schedule) {
    const song = songById(id);
    const { samples, sampleRate } = await runSliced(renderSong(song, TRACK_SAMPLE_RATE), schedule);
    const waveform = await runSliced(waveformSteps(samples, sampleRate), schedule);
    const loaded = Object.freeze({ info: trackById(id), buffer: makeBuffer(samples, sampleRate), waveform });
    finished.set(id, loaded);
    return loaded;
  }

  /** Renders a track once; concurrent callers share the same work. */
  function ensure(id, { background = false } = {}) {
    if (finished.has(id)) return Promise.resolve(finished.get(id));
    if (!pending.has(id)) {
      const work = render(id, background ? BACKGROUND : FOREGROUND).catch((error) => {
        pending.delete(id); // a later request may retry
        throw error;
      });
      pending.set(id, work);
    }
    return pending.get(id);
  }

  return {
    ensure,
    /** Loaded track record ({ info, buffer, waveform }) or null if not rendered yet. */
    get: (id) => finished.get(id) ?? null,
    isRendered: (id) => finished.has(id),
    waveform(id) {
      const loaded = finished.get(id);
      return loaded ? loaded.waveform : emptyWaveform(trackById(id).duration);
    },
    /** Renders every remaining track one after another at low priority. */
    async renderRemaining() {
      for (const track of TRACKS) await ensure(track.id, { background: true });
    },
  };
}
