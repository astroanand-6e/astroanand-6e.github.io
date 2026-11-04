/**
 * Transition sounds: noise risers/swells and the drop impact. Also reused by
 * the sampler (riser, downlifter) so the pads and the track share one sound.
 */
import {
  Biquad, SAMPLE_RATE, Svf, TWO_PI, createRng, noiseFrom,
} from './dsp.js';

const CONTROL_RATE_MASK = 7;
const CUT_FADE_SECONDS = 0.004;

/**
 * Filtered noise whose cutoff sweeps from `p.from` to `p.to` Hz while the level
 * follows `x ** p.curve` (or `(1 - x) ** p.curve` when `p.falling`, for
 * downlifters). A tone can ride along (`p.tone`). The last few milliseconds
 * fade out so a riser that ends on the downbeat never clicks.
 */
export function renderSweep(dst, start, seconds, p, fs = SAMPLE_RATE) {
  const n = Math.min(Math.round(seconds * fs), dst.length - start);
  const rng = createRng(p.seed ?? 71);
  const filter = new Svf(fs);
  const fade = Math.round(CUT_FADE_SECONDS * fs);
  const ratio = p.to / p.from;
  let tonePhase = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i / n;
    if ((i & CONTROL_RATE_MASK) === 0) filter.tune(p.from * ratio ** x, p.q ?? 1.2);
    filter.tick(noiseFrom(rng));
    const shaped = p.mode === 'high' ? filter.high : filter.band;
    let sample = shaped * (p.noiseLevel ?? 1);
    if (p.tone) {
      tonePhase += (TWO_PI * (p.tone.from * (p.tone.to / p.tone.from) ** x)) / fs;
      sample += Math.sin(tonePhase) * p.tone.level;
    }
    const cut = Math.min(1, (n - i) / fade);
    const shape = p.falling ? (1 - x) ** (p.curve ?? 2) : x ** (p.curve ?? 2);
    dst[start + i] += sample * shape * p.level * cut;
  }
}

/** Boom plus noise crash: lands on the first beat of the drop. */
export function renderImpact(dst, start, p, fs = SAMPLE_RATE) {
  const n = Math.min(Math.round(p.length * fs), dst.length - start);
  const rng = createRng(p.seed ?? 83);
  const highpass = Biquad.highpass(p.crashCutoff ?? 3500, 0.7, fs);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / fs;
    const hz = 38 + 40 * Math.exp(-t / 0.08);
    phase += (TWO_PI * hz) / fs;
    const boom = Math.sin(phase) * Math.exp(-t / p.boomDecay) * p.boom;
    const crash = highpass.process(noiseFrom(rng)) * Math.exp(-t / p.crashDecay) * p.crash;
    dst[start + i] += boom + crash;
  }
}
