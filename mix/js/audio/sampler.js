/**
 * Sampler sounds, synthesized once with the same DSP as the tracks: a clap, a
 * snare roll, a riser, a downlifter and a chord stab. The time-based ones are
 * written at SAMPLER_REFERENCE_BPM; playing them at (deck BPM / reference)
 * stretches them so a "4 beat" roll lasts exactly four beats of the deck.
 */
import { SAMPLE_RATE, mixInto, midiToHz, normalizePeak } from './synth/dsp.js';
import { makeClap, makeSnare } from './synth/drums.js';
import { createReverb } from './synth/reverb.js';
import { renderSweep } from './synth/sweeps.js';
import { renderSubtractive } from './synth/voices.js';

export const SAMPLER_REFERENCE_BPM = 124;
export const SAMPLER_PEAK = 0.85;
const BEAT_SECONDS = 60 / SAMPLER_REFERENCE_BPM;
const TAIL_SECONDS = 0.5;

const samplesFor = (seconds, fs) => Math.ceil(seconds * fs);

/** Adds a short room to `dry` in place. */
function addRoom(dry, spec, wet, fs) {
  const reverb = new Float32Array(dry.length);
  createReverb(spec, fs).processInto(reverb, dry, 0, dry.length, wet);
  for (let i = 0; i < dry.length; i += 1) dry[i] += reverb[i];
  return dry;
}

function clap(fs) {
  const hit = makeClap({ length: 0.42, freq: 1500, q: 0.9, bursts: [0, 0.011, 0.024, 0.037], decay: 0.14, seed: 5 }, fs);
  const out = new Float32Array(samplesFor(0.9, fs));
  mixInto(out, 0, hit, 1);
  return addRoom(out, { room: 0.55, damp: 0.5, preDelay: 0.01 }, 0.5, fs);
}

/** Eighths, then sixteenths, then thirty-seconds, getting louder: one bar of build. */
function snareRoll(fs) {
  const hit = makeSnare({ length: 0.2, tone: 190, decay: 0.08, freq: 2400, seed: 9 }, fs);
  const out = new Float32Array(samplesFor(4 * BEAT_SECONDS + TAIL_SECONDS, fs));
  const times = [];
  for (let b = 0; b < 2; b += 0.5) times.push(b);
  for (let b = 2; b < 3; b += 0.25) times.push(b);
  for (let b = 3; b < 4; b += 0.125) times.push(b);
  times.forEach((beat, i) => {
    const velocity = 0.25 + (0.75 * i) / (times.length - 1);
    mixInto(out, Math.round(beat * BEAT_SECONDS * fs), hit, velocity);
  });
  return out;
}

function riser(fs) {
  const out = new Float32Array(samplesFor(8 * BEAT_SECONDS, fs));
  renderSweep(out, 0, 8 * BEAT_SECONDS, {
    from: 250, to: 10000, q: 1.5, mode: 'band', curve: 2, level: 0.7, seed: 21, tone: { from: 180, to: 1800, level: 0.1 },
  }, fs);
  return out;
}

function downlifter(fs) {
  const out = new Float32Array(samplesFor(4 * BEAT_SECONDS, fs));
  renderSweep(out, 0, 4 * BEAT_SECONDS, {
    from: 9000, to: 250, q: 1.3, mode: 'band', curve: 1.6, level: 0.7, falling: true, seed: 33, tone: { from: 1500, to: 150, level: 0.08 },
  }, fs);
  return out;
}

/** A minor-seventh saw stab with a quick filter snap and a little room. */
function stab(fs) {
  const out = new Float32Array(samplesFor(1.6, fs));
  const voice = {
    shape: 'saw', detune: [-10, 0, 10], cutoff: 700, cutoffAmount: 3200, cutoffTau: 0.07, q: 1.6,
    attack: 0.002, decay: 0.12, sustain: 0.25, release: 0.18, level: 0.3, drive: 1.2, seed: 3,
  };
  [57, 60, 64, 67].forEach((note) => renderSubtractive(out, 0, midiToHz(note), 0.28, 1, voice, fs));
  return addRoom(out, { room: 0.6, damp: 0.5, preDelay: 0.012 }, 0.6, fs);
}

const MAKERS = { clap, snareRoll, riser, downlifter, stab };

/** Renders every sampler sound. Cheap (tens of milliseconds). */
export function renderSamplerBank(fs = SAMPLE_RATE) {
  const bank = {};
  for (const [name, make] of Object.entries(MAKERS)) bank[name] = normalizePeak(make(fs), SAMPLER_PEAK);
  return bank;
}

export const SAMPLER_NAMES = Object.freeze(Object.keys(MAKERS));
