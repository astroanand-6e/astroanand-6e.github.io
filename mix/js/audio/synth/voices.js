/**
 * Pitched voices. Every renderer adds one note into `dst` starting at sample
 * `start`; `seconds` is the held length, the release tail extends past it.
 * Parameters come from the song recipe, so each track gets its own timbre.
 *
 * Voices are linear in `vel` (it only scales the output), which lets the
 * arranger render a note once and reuse it at any velocity.
 */
import {
  SAMPLE_RATE, Svf, TWO_PI, createRng, pulseSample, sawSample,
} from './dsp.js';

const CONTROL_RATE_MASK = 7; // retune filters every 8 samples
const RELEASE_TAIL_FACTOR = 5; // note ends after this many release time constants
const MIN_TIME = 1e-4;
const NEGLIGIBLE = 1e-3; // FM terms below this are skipped

const stepOf = (tau, fs) => Math.exp(-1 / (Math.max(tau, MIN_TIME) * fs));

/** Shared amplitude envelope: linear attack, decay to sustain, exponential release. */
function createEnvelope(p, seconds, fs) {
  const attack = Math.max(p.attack ?? 0.003, MIN_TIME);
  const sustain = p.sustain ?? 1;
  const decayStep = stepOf(p.decay ?? 10, fs);
  const releaseStep = stepOf(p.release ?? 0.08, fs);
  const holdSamples = Math.round(seconds * fs);
  let decaying = 1;
  let level = 0;
  let index = 0;
  return function next() {
    if (index < holdSamples) {
      decaying *= decayStep;
      level = Math.min(1, (index / fs) / attack) * (sustain + (1 - sustain) * decaying);
    } else {
      level *= releaseStep;
    }
    index += 1;
    return level;
  };
}

/** Samples a note occupies: its held length plus the release tail. */
export function noteSamples(seconds, p, fs = SAMPLE_RATE) {
  return Math.ceil((seconds + (p.release ?? 0.08) * RELEASE_TAIL_FACTOR) * fs);
}

const noteLength = (seconds, p, fs, limit) => Math.min(noteSamples(seconds, p, fs), limit);

/** Sine sub bass with a touch of 2nd harmonic and saturation (round, deep). */
export function renderSineBass(dst, start, hz, seconds, vel, p, fs = SAMPLE_RATE) {
  const n = noteLength(seconds, p, fs, dst.length - start);
  const env = createEnvelope(p, seconds, fs);
  const dropStep = stepOf(p.dropTau ?? 0.02, fs);
  const h2 = p.h2 ?? 0.3;
  const drive = p.drive ?? 1.4;
  const scale = vel * p.level;
  let drop = (p.drop ?? 1.5) - 1;
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    drop *= dropStep;
    phase += (TWO_PI * hz * (1 + drop)) / fs;
    const tone = Math.sin(phase) + h2 * Math.sin(phase * 2 + 0.6);
    dst[start + i] += Math.tanh(drive * tone) * env() * scale;
  }
}

function oscillatorBank(p, hz, fs, rng) {
  const detunes = p.detune ?? [0];
  const increments = detunes.map((cents) => (hz * 2 ** (cents / 1200)) / fs);
  const phases = detunes.map(() => (p.randomPhase ? rng() : 0));
  const norm = 1 / detunes.length ** 0.75;
  const duty = p.duty ?? 0.5;
  const pulse = p.shape === 'pulse';
  return function next() {
    let sum = 0;
    for (let o = 0; o < phases.length; o += 1) {
      phases[o] += increments[o];
      if (phases[o] >= 1) phases[o] -= 1;
      sum += pulse ? pulseSample(phases[o], increments[o], duty) : sawSample(phases[o], increments[o]);
    }
    return sum * norm;
  };
}

/**
 * Subtractive voice: detuned saw/pulse bank, optional sub sine, resonant
 * lowpass with its own envelope. Covers bass, pads, stabs and plucks.
 */
export function renderSubtractive(dst, start, hz, seconds, vel, p, fs = SAMPLE_RATE) {
  const n = noteLength(seconds, p, fs, dst.length - start);
  const env = createEnvelope(p, seconds, fs);
  const oscillators = oscillatorBank(p, hz, fs, createRng(p.seed ?? 5));
  const filter = new Svf(fs);
  const cutoffStep = stepOf(p.cutoffTau ?? 0.1, fs);
  const subStep = (TWO_PI * hz * (p.subRatio ?? 1)) / fs;
  const baseCutoff = p.cutoff ?? 2000;
  const q = p.q ?? 0.8;
  const sub = p.sub ?? 0;
  const drive = p.drive ?? 0;
  const driveNorm = drive ? 1 / Math.tanh(drive) : 1;
  const scale = vel * p.level;
  let cutoffEnv = p.cutoffAmount ?? 0;
  let subPhase = 0;
  for (let i = 0; i < n; i += 1) {
    cutoffEnv *= cutoffStep;
    if ((i & CONTROL_RATE_MASK) === 0) filter.tune(baseCutoff + cutoffEnv, q);
    subPhase += subStep;
    const raw = sub === 0 ? oscillators() : oscillators() + sub * Math.sin(subPhase);
    const y = filter.tick(raw);
    const shaped = drive ? Math.tanh(y * drive) * driveNorm : y;
    dst[start + i] += shaped * env() * scale;
  }
}

/**
 * Two-operator FM with a decaying index: electric piano, bells, blips.
 * `tine` adds the bright attack transient of a tine / mallet. Once the index
 * and the tine have died away the note is a plain sine (one `sin` per sample).
 */
export function renderFm(dst, start, hz, seconds, vel, p, fs = SAMPLE_RATE) {
  const n = noteLength(seconds, p, fs, dst.length - start);
  const env = createEnvelope(p, seconds, fs);
  const indexStep = stepOf(p.indexDecay ?? 0.4, fs);
  const tineStep = stepOf(0.025, fs);
  const carrierStep = (TWO_PI * hz) / fs;
  const modStep = carrierStep * (p.ratio ?? 1);
  const tineRatio = p.tineRatio ?? 7;
  const scale = vel * p.level;
  let index = p.index ?? 2;
  let tine = p.tine ?? 0;
  let carrier = 0;
  let mod = 0;
  for (let i = 0; i < n; i += 1) {
    index *= indexStep;
    tine *= tineStep;
    carrier += carrierStep;
    mod += modStep;
    let wave = index > NEGLIGIBLE ? Math.sin(carrier + index * Math.sin(mod)) : Math.sin(carrier);
    if (tine > NEGLIGIBLE) wave += tine * Math.sin(carrier * tineRatio);
    dst[start + i] += wave * env() * scale;
  }
}

const VOICES = { sine: renderSineBass, subtractive: renderSubtractive, fm: renderFm };

/** Looks up a voice renderer by recipe `voice` name. */
export function voiceFor(name) {
  const voice = VOICES[name];
  if (!voice) throw new Error(`Unknown voice "${name}"`);
  return voice;
}
