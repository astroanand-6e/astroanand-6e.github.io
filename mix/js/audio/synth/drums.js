/**
 * Drum one-shots. Each maker returns a Float32Array peaking at 1.0; the
 * arranger mixes copies of it at every hit. Parameters come from the song recipe.
 */
import {
  Biquad, SAMPLE_RATE, TWO_PI, createRng, fadeOutTail, noiseFrom, normalizePeak, polyBlep,
} from './dsp.js';

const ATTACK_SECONDS = 0.0008;
const END_FADE_SECONDS = 0.03;
// Inharmonic square-wave ratios used by classic analog hats.
const METAL_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800];

function envelope(t, attack, decay) {
  return Math.min(1, t / attack) * Math.exp(-t / decay);
}

/** Sine with a fast pitch drop, a noise click and soft saturation. */
export function makeKick(p, fs = SAMPLE_RATE) {
  const n = Math.round(p.length * fs);
  const out = new Float32Array(n);
  const rng = createRng(p.seed ?? 11);
  let phase = 0;
  let lowNoise = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / fs;
    const hz = p.end + (p.start - p.end) * Math.exp(-t / p.tauPitch);
    phase += (TWO_PI * hz) / fs;
    const body = Math.sin(phase) * envelope(t, ATTACK_SECONDS, p.decay);
    const white = noiseFrom(rng);
    lowNoise += 0.35 * (white - lowNoise);
    const click = (white - lowNoise) * Math.exp(-t / 0.0025) * p.click;
    out[i] = Math.tanh(p.drive * (body + click));
  }
  fadeOutTail(out, Math.round(END_FADE_SECONDS * fs));
  return normalizePeak(out);
}

/** Layered noise bursts (the "flam") followed by a short tail. */
export function makeClap(p, fs = SAMPLE_RATE) {
  const n = Math.round(p.length * fs);
  const out = new Float32Array(n);
  const rng = createRng(p.seed ?? 23);
  const bandpass = Biquad.bandpass(p.freq, p.q ?? 1.1, fs);
  const lastBurst = p.bursts[p.bursts.length - 1];
  for (let i = 0; i < n; i += 1) {
    const t = i / fs;
    let level = 0;
    for (const offset of p.bursts) {
      if (t >= offset) level = Math.max(level, Math.exp(-(t - offset) / 0.0055));
    }
    if (t >= lastBurst) level = Math.max(level, 0.55 * Math.exp(-(t - lastBurst) / p.decay));
    out[i] = bandpass.process(noiseFrom(rng)) * level;
  }
  fadeOutTail(out, Math.round(END_FADE_SECONDS * fs));
  return normalizePeak(out);
}

/** Highpassed noise plus inharmonic squares; `decay` separates closed from open. */
export function makeHat(p, fs = SAMPLE_RATE) {
  const n = Math.round(p.length * fs);
  const out = new Float32Array(n);
  const rng = createRng(p.seed ?? 31);
  const highpassA = Biquad.highpass(p.cutoff, 0.8, fs);
  const highpassB = Biquad.highpass(p.cutoff * 0.9, 0.8, fs);
  const phases = METAL_FREQS.map(() => rng());
  const metal = p.metal ?? 0.35;
  for (let i = 0; i < n; i += 1) {
    const t = i / fs;
    let squares = 0;
    for (let m = 0; m < METAL_FREQS.length; m += 1) {
      const dt = METAL_FREQS[m] / fs;
      phases[m] = (phases[m] + dt) % 1;
      squares += (phases[m] < 0.5 ? 1 : -1) + polyBlep(phases[m], dt);
    }
    const source = noiseFrom(rng) * (1 - metal) + (squares / METAL_FREQS.length) * metal;
    out[i] = highpassB.process(highpassA.process(source)) * envelope(t, 0.0004, p.decay);
  }
  fadeOutTail(out, Math.round(0.012 * fs));
  return normalizePeak(out);
}

/** Soft noise swish for shakers (slower attack than a hat). */
export function makeShaker(p, fs = SAMPLE_RATE) {
  const n = Math.round(p.length * fs);
  const out = new Float32Array(n);
  const rng = createRng(p.seed ?? 41);
  const bandpass = Biquad.bandpass(p.freq, p.q ?? 0.9, fs);
  for (let i = 0; i < n; i += 1) {
    const t = i / fs;
    out[i] = bandpass.process(noiseFrom(rng)) * envelope(t, p.attack ?? 0.007, p.decay);
  }
  fadeOutTail(out, Math.round(0.01 * fs));
  return normalizePeak(out);
}

/** Tuned membrane hit (rim, conga, wood block) with an optional noise tick. */
export function makeTone(p, fs = SAMPLE_RATE) {
  const n = Math.round(p.length * fs);
  const out = new Float32Array(n);
  const rng = createRng(p.seed ?? 53);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / fs;
    const hz = p.end + (p.start - p.end) * Math.exp(-t / (p.tauPitch ?? 0.02));
    phase += (TWO_PI * hz) / fs;
    const partial = p.overtone ? 0.4 * Math.sin(phase * p.overtone) : 0;
    const tone = (Math.sin(phase) + partial) * envelope(t, 0.0005, p.decay);
    const tick = noiseFrom(rng) * Math.exp(-t / 0.002) * (p.tick ?? 0);
    out[i] = tone + tick;
  }
  fadeOutTail(out, Math.round(0.01 * fs));
  return normalizePeak(out);
}

/** Snare: noise body over a tuned shell. Used for fills and the snare-roll sample. */
export function makeSnare(p, fs = SAMPLE_RATE) {
  const n = Math.round(p.length * fs);
  const out = new Float32Array(n);
  const rng = createRng(p.seed ?? 67);
  const bandpass = Biquad.bandpass(p.freq ?? 2200, 0.7, fs);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / fs;
    phase += (TWO_PI * (p.tone + 60 * Math.exp(-t / 0.015))) / fs;
    const shell = Math.sin(phase) * Math.exp(-t / 0.06) * 0.6;
    const wires = bandpass.process(noiseFrom(rng)) * Math.exp(-t / p.decay);
    out[i] = shell + wires;
  }
  fadeOutTail(out, Math.round(END_FADE_SECONDS * fs));
  return normalizePeak(out);
}

const MAKERS = {
  kick: makeKick, clap: makeClap, hat: makeHat, shaker: makeShaker, tone: makeTone, snare: makeSnare,
};

/**
 * Builds every one-shot named in a song's `kit` recipe: { name: { type, variants?, ...params } }.
 * Each name maps to an array of variants (different noise seeds) so repeated
 * hits do not sound like a sample loop.
 */
export function buildKit(kitRecipe, fs = SAMPLE_RATE) {
  const kit = {};
  for (const [name, recipe] of Object.entries(kitRecipe)) {
    const maker = MAKERS[recipe.type];
    if (!maker) throw new Error(`Unknown drum type "${recipe.type}" for "${name}"`);
    const count = recipe.variants ?? 1;
    kit[name] = Array.from({ length: count }, (_, i) => maker({ ...recipe, seed: (recipe.seed ?? 1) * 7 + i * 13 }, fs));
  }
  return kit;
}
