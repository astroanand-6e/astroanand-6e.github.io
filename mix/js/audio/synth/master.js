/**
 * Final pass over a finished track: remove sub-sonic rumble, add a little top
 * end to offset the linear-interpolation resampling the browser applies when it
 * plays 32 kHz audio at 44.1/48 kHz, then match loudness across songs and
 * soft-limit the peaks.
 */
import { Biquad, rmsOf } from './dsp.js';

const CHUNK_SAMPLES = 1 << 17;
const SUBSONIC_HZ = 28;
const DEFAULT_SHELF_HZ = 7000;
const DEFAULT_SHELF_DB = 2.5;
const DEFAULT_TARGET_RMS = 0.2;
const CEILING = 0.97;
const KNEE = 0.72;
// Loudness is measured on the first full phrase (bars 33-40).
const REFERENCE_BEATS = { from: 128, to: 160 };

/** Linear below the knee, then a tanh curve that approaches the ceiling. */
export function softCeiling(x) {
  const a = Math.abs(x);
  if (a <= KNEE) return x;
  const shaped = KNEE + (CEILING - KNEE) * Math.tanh((a - KNEE) / (CEILING - KNEE));
  return x < 0 ? -shaped : shaped;
}

function* filterPass(out, filters) {
  for (let start = 0; start < out.length; start += CHUNK_SAMPLES) {
    const end = Math.min(out.length, start + CHUNK_SAMPLES);
    for (const filter of filters) filter.processRange(out, start, end);
    yield { master: 'filter' };
  }
}

function* gainPass(out, gain) {
  let peak = 0;
  for (let start = 0; start < out.length; start += CHUNK_SAMPLES) {
    const end = Math.min(out.length, start + CHUNK_SAMPLES);
    for (let i = start; i < end; i += 1) {
      const y = softCeiling(out[i] * gain);
      out[i] = y;
      peak = Math.max(peak, Math.abs(y));
    }
    yield { master: 'gain' };
  }
  return peak;
}

/**
 * @param {Float32Array} out finished track, processed in place
 * @param {{ fs: number, bpm: number, master?: { targetRms?: number, shelfHz?: number, shelfDb?: number } }} options
 * @returns {Generator<object, { peak: number, rms: number }>}
 */
export function* masterPass(out, { fs, bpm, master = {} }) {
  const filters = [
    Biquad.highpass(SUBSONIC_HZ, 0.7, fs),
    Biquad.highshelf(master.shelfHz ?? DEFAULT_SHELF_HZ, master.shelfDb ?? DEFAULT_SHELF_DB, fs),
  ];
  yield* filterPass(out, filters);
  const from = Math.round(((REFERENCE_BEATS.from * 60) / bpm) * fs);
  const to = Math.min(out.length, Math.round(((REFERENCE_BEATS.to * 60) / bpm) * fs));
  const measured = rmsOf(out, from, to);
  const gain = measured > 0 ? (master.targetRms ?? DEFAULT_TARGET_RMS) / measured : 1;
  const peak = yield* gainPass(out, gain);
  return { peak, rms: rmsOf(out, from, to), gain };
}
