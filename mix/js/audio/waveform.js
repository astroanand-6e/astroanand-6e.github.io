/**
 * Three-band overview waveform (what the deck screens draw): ~100 bins per
 * second of peak level in the low / mid / high bands, scaled 0..1. The bands
 * share one scale, so a kick towers over hats, like the 3-band waveforms on
 * real decks. The split uses the mixer EQ's crossover points (200 Hz, 2.5 kHz)
 * with 2nd-order Butterworth filters.
 */
import { Biquad } from './synth/dsp.js';

export const WAVEFORM_BIN_SECONDS = 0.01;
export const LOW_CROSSOVER_HZ = 200;
export const HIGH_CROSSOVER_HZ = 2500;
const CHUNK_BINS = 2000;
const REFERENCE_PERCENTILE = 0.99;
const DISPLAY_CURVE = 0.6;
// A track that never rises above this (about -34 dBFS) must not be amplified up to full height.
const MIN_REFERENCE = 0.02;

/** Value that `fraction` of the bins stay at or below (robust "full height"). */
export function percentile(values, fraction) {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

/** Scales raw peaks by `reference` and shapes them for display (lifts quiet bins). */
export function normalizeBand(peaks, reference) {
  const out = new Float32Array(peaks.length);
  for (let i = 0; i < peaks.length; i += 1) out[i] = Math.min(1, peaks[i] / reference) ** DISPLAY_CURVE;
  return out;
}

/** The four biquad sections (low-pass, high-pass, then the mid band's low-pass and the high band's high-pass). */
function sections(sampleRate) {
  const q = Math.SQRT1_2;
  return {
    low: Biquad.lowpass(LOW_CROSSOVER_HZ, q, sampleRate),
    aboveLow: Biquad.highpass(LOW_CROSSOVER_HZ, q, sampleRate),
    belowHigh: Biquad.lowpass(HIGH_CROSSOVER_HZ, q, sampleRate),
    high: Biquad.highpass(HIGH_CROSSOVER_HZ, q, sampleRate),
  };
}

/**
 * Generator form so a caller can slice the work; the return value is the
 * `{ binSeconds, low, mid, high }` object.
 */
export function* waveformSteps(samples, sampleRate, binSeconds = WAVEFORM_BIN_SECONDS) {
  const binSize = Math.max(1, Math.round(binSeconds * sampleRate));
  const bins = Math.ceil(samples.length / binSize);
  const peaks = { low: new Float32Array(bins), mid: new Float32Array(bins), high: new Float32Array(bins) };
  const { low, aboveLow, belowHigh, high } = sections(sampleRate);
  for (let bin = 0; bin < bins; bin += 1) {
    const from = bin * binSize;
    const to = Math.min(samples.length, from + binSize);
    let pLow = 0; let pMid = 0; let pHigh = 0;
    for (let i = from; i < to; i += 1) {
      const x = samples[i];
      pLow = Math.max(pLow, Math.abs(low.process(x)));
      pMid = Math.max(pMid, Math.abs(belowHigh.process(aboveLow.process(x))));
      pHigh = Math.max(pHigh, Math.abs(high.process(x)));
    }
    peaks.low[bin] = pLow; peaks.mid[bin] = pMid; peaks.high[bin] = pHigh;
    if (bin % CHUNK_BINS === CHUNK_BINS - 1) yield { waveform: bin / bins };
  }
  const reference = Math.max(
    MIN_REFERENCE,
    ...[peaks.low, peaks.mid, peaks.high].map((band) => percentile(band, REFERENCE_PERCENTILE)),
  );
  return {
    binSeconds: binSize / sampleRate,
    low: normalizeBand(peaks.low, reference),
    mid: normalizeBand(peaks.mid, reference),
    high: normalizeBand(peaks.high, reference),
  };
}

export function computeWaveform(samples, sampleRate, binSeconds = WAVEFORM_BIN_SECONDS) {
  const run = waveformSteps(samples, sampleRate, binSeconds);
  let step = run.next();
  while (!step.done) step = run.next();
  return step.value;
}

/** Zero-filled stand-in for a track that has not rendered yet. */
export function emptyWaveform(durationSeconds, binSeconds = WAVEFORM_BIN_SECONDS) {
  const bins = Math.ceil(durationSeconds / binSeconds);
  return { binSeconds, low: new Float32Array(bins), mid: new Float32Array(bins), high: new Float32Array(bins), pending: true };
}
