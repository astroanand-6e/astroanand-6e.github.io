/**
 * DSP primitives for the offline track synthesizer. Pure JS on typed arrays,
 * no Web Audio, so the same code runs in the browser and under `node --test`.
 */

export const SAMPLE_RATE = 32000;
export const TWO_PI = Math.PI * 2;

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12);
export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (gain) => 20 * Math.log10(Math.max(gain, 1e-9));

/** Deterministic PRNG (mulberry32): renders are identical on every machine. */
export function createRng(seed = 1) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bipolar white noise in [-1, 1). */
export const noiseFrom = (rng) => rng() * 2 - 1;

/** RBJ biquad, transposed direct form II. */
export class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.z1 = 0; this.z2 = 0;
  }

  setCoefficients(b0, b1, b2, a0, a1, a2) {
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }

  static lowpass(fc, q = 0.7071, fs = SAMPLE_RATE) {
    const { cos, alpha } = rbj(fc, q, fs);
    return new Biquad().setCoefficients((1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
  }

  static highpass(fc, q = 0.7071, fs = SAMPLE_RATE) {
    const { cos, alpha } = rbj(fc, q, fs);
    return new Biquad().setCoefficients((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
  }

  static bandpass(fc, q = 1, fs = SAMPLE_RATE) {
    const { cos, alpha } = rbj(fc, q, fs);
    return new Biquad().setCoefficients(alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha);
  }

  static highshelf(fc, gainDb, fs = SAMPLE_RATE) {
    const amp = 10 ** (gainDb / 40);
    const w = (TWO_PI * fc) / fs;
    const cos = Math.cos(w);
    const beta = 2 * Math.sqrt(amp) * (Math.sin(w) / 2) * Math.SQRT2;
    return new Biquad().setCoefficients(
      amp * (amp + 1 + (amp - 1) * cos + beta),
      -2 * amp * (amp - 1 + (amp + 1) * cos),
      amp * (amp + 1 + (amp - 1) * cos - beta),
      amp + 1 - (amp - 1) * cos + beta,
      2 * (amp - 1 - (amp + 1) * cos),
      amp + 1 - (amp - 1) * cos - beta,
    );
  }

  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  /** Filters `buffer[start..end)` in place. */
  processRange(buffer, start = 0, end = buffer.length) {
    for (let i = start; i < end; i += 1) buffer[i] = this.process(buffer[i]);
    return buffer;
  }
}

function rbj(fc, q, fs) {
  const w = (TWO_PI * clamp(fc, 10, fs * 0.45)) / fs;
  return { cos: Math.cos(w), alpha: Math.sin(w) / (2 * q) };
}

/**
 * Zero-delay-feedback state variable filter. Cheap to retune, so envelope
 * sweeps update the cutoff every few samples without clicks.
 */
export class Svf {
  constructor(fs = SAMPLE_RATE) {
    this.fs = fs;
    this.ic1 = 0; this.ic2 = 0;
    this.a1 = 0; this.a2 = 0; this.a3 = 0; this.k = 1;
    this.low = 0; this.band = 0; this.high = 0;
    this.tune(1000, 0.7071);
  }

  tune(fc, q) {
    const g = Math.tan((Math.PI * clamp(fc, 20, this.fs * 0.45)) / this.fs);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  /** Runs one sample; read `low`, `band`, `high` afterwards. Returns the lowpass. */
  tick(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2;
    this.band = v1;
    this.high = x - this.k * v1 - v2;
    return v2;
  }
}

/** PolyBLEP residual that removes the aliasing from a naive saw/pulse edge. */
export function polyBlep(t, dt) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

export const sawSample = (phase, dt) => 2 * phase - 1 - polyBlep(phase, dt);

export function pulseSample(phase, dt, duty) {
  const shifted = phase - duty + (phase < duty ? 1 : 0);
  return (phase < duty ? 1 : -1) + polyBlep(phase, dt) - polyBlep(shifted, dt);
}

/** Adds `source` into `target` starting at `offset` (samples), clipped to the target. */
export function mixInto(target, offset, source, gain = 1, length = source.length) {
  const start = Math.max(0, offset);
  const end = Math.min(target.length, offset + length);
  for (let i = start; i < end; i += 1) target[i] += source[i - offset] * gain;
}

/** Scales a one-shot so its peak is exactly `peak`. */
export function normalizePeak(buffer, peak = 1) {
  let max = 0;
  for (let i = 0; i < buffer.length; i += 1) max = Math.max(max, Math.abs(buffer[i]));
  if (max === 0) return buffer;
  const scale = peak / max;
  for (let i = 0; i < buffer.length; i += 1) buffer[i] *= scale;
  return buffer;
}

/** Raised-cosine fade over the last `samples` of a one-shot (avoids end clicks). */
export function fadeOutTail(buffer, samples) {
  const n = Math.min(samples, buffer.length);
  for (let i = 0; i < n; i += 1) {
    const w = 0.5 + 0.5 * Math.cos((Math.PI * i) / n);
    buffer[buffer.length - n + i] *= w;
  }
  return buffer;
}

/** Feedback delay with a damped (one-pole lowpass) loop, applied in place. */
export function applyEcho(buffer, start, end, delaySamples, feedback, damp = 0.3) {
  const d = Math.max(1, Math.round(delaySamples));
  const loop = new Float32Array(d);
  let idx = 0;
  let filt = 0;
  for (let i = start; i < end; i += 1) {
    const echo = loop[idx];
    filt += (1 - damp) * (echo - filt);
    loop[idx] = buffer[i] + filt * feedback;
    buffer[i] += echo;
    idx = idx + 1 === d ? 0 : idx + 1;
  }
}

/** Mean-square level of a range (for loudness targeting). */
export function rmsOf(buffer, start = 0, end = buffer.length) {
  let sum = 0;
  for (let i = start; i < end; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / Math.max(1, end - start));
}
