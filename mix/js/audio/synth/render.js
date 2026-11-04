/**
 * Song renderer. A generator so callers can run it to completion (tests,
 * workers) or time-slice it on the main thread without blocking the page.
 *
 * Work happens one 8-bar phrase at a time in small phrase-local stems; each
 * phrase is then ducked, reverberated and overlap-added into the track, so
 * peak memory stays near one finished track (~16 MB at 32 kHz mono).
 */
import { SAMPLE_RATE, applyEcho, createRng, rmsOf } from './dsp.js';
import { buildKit } from './drums.js';
import {
  PHRASE_BARS, PHRASE_COUNT, TOTAL_BARS, STEPS_PER_BAR, layerActive,
} from './arrangement.js';
import { emitBar, expandHarmony, sampleAt } from './layers.js';
import { masterPass } from './master.js';
import { createReverb } from './reverb.js';

const BEATS_PER_BAR = 4;
const TAIL_SECONDS = 4; // room for release, echo and reverb tails past a phrase
const DUCK_ATTACK_SECONDS = 0.003;
const DUCK_RELEASE_TAUS = 6;
const SILENCE = 1e-5;

export const trackSamples = (bpm, fs = SAMPLE_RATE) => Math.round(((TOTAL_BARS * BEATS_PER_BAR * 60) / bpm) * fs);

const beatSample = (song, beat, fs) => Math.round(((beat * 60) / song.bpm) * fs);

function allocateStems(length) {
  return {
    dry: new Float32Array(length),
    bass: new Float32Array(length),
    tonal: new Float32Array(length),
    verb: new Float32Array(length),
  };
}

function clearStems(stems) {
  for (const stem of Object.values(stems)) stem.fill(0);
}

/** Absolute sample index of every kick hit in the whole track (drives the ducking). */
export function kickPositions(song, fs = SAMPLE_RATE) {
  const lane = song.drums.find((l) => l.layer === 'kick');
  const positions = [];
  for (let bar = 0; bar < TOTAL_BARS; bar += 1) {
    if (!layerActive('kick', bar)) continue;
    const pattern = Array.isArray(lane.pattern) ? lane.pattern[bar % lane.pattern.length] : lane.pattern;
    for (let step = 0; step < STEPS_PER_BAR; step += 1) {
      if (/[1-9]/.test(pattern[step])) positions.push(sampleAt({ song, fs }, bar, step, false));
    }
  }
  return positions;
}

/** Gain curve that dips on each kick and recovers exponentially. */
export function buildDuckEnvelope(length, kicksLocal, depth, tau, fs = SAMPLE_RATE) {
  const env = new Float32Array(length).fill(1);
  const attack = Math.round(DUCK_ATTACK_SECONDS * fs);
  const release = Math.round(tau * DUCK_RELEASE_TAUS * fs);
  const recovery = Math.exp(-1 / (tau * fs)); // per-sample decay of the dip
  for (const kick of kicksLocal) {
    const from = Math.max(0, kick - attack);
    const to = Math.min(length, kick + release);
    let dip = depth;
    for (let i = from; i < to; i += 1) {
      if (i < kick) {
        env[i] = Math.min(env[i], 1 - ((i - from) / attack) * depth);
      } else {
        env[i] = Math.min(env[i], 1 - dip);
        dip *= recovery;
      }
    }
  }
  return env;
}

function activeSpan(buffer, length) {
  let first = -1;
  let last = -1;
  for (let i = 0; i < length; i += 1) {
    if (Math.abs(buffer[i]) > SILENCE) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return first < 0 ? null : { first, last };
}

function applyTonalEcho(ctx, length) {
  const { echo } = ctx.song;
  const span = echo && activeSpan(ctx.stems.tonal, length);
  if (!span) return;
  const delay = (echo.beats * 60 * ctx.fs) / ctx.song.bpm;
  const end = Math.min(length, span.last + Math.round(TAIL_SECONDS * 0.6 * ctx.fs));
  applyEcho(ctx.stems.tonal, span.first, end, delay, echo.feedback, echo.damp);
}

function runReverb(ctx, length) {
  const { stems, song, fs } = ctx;
  const spec = song.reverb;
  for (let i = 0; i < length; i += 1) stems.verb[i] += stems.tonal[i] * spec.send;
  const span = activeSpan(stems.verb, length);
  if (!span) return null;
  const wet = new Float32Array(length);
  const end = Math.min(length, span.last + Math.round(TAIL_SECONDS * fs * 0.75));
  createReverb(spec, fs).processInto(wet, stems.verb, span.first, end, spec.wet);
  return wet;
}

function duckedGains(ctx, length, kicksLocal) {
  const { bass, tonal } = ctx.song.duck;
  return {
    bass: buildDuckEnvelope(length, kicksLocal, bass.depth, bass.tau, ctx.fs),
    tonal: buildDuckEnvelope(length, kicksLocal, tonal.depth, tonal.tau, ctx.fs),
  };
}

/** RMS of every stem over the phrase itself (not its tails); used by tests and tuning. */
function stemLevels(stems, length) {
  return Object.fromEntries(Object.entries(stems).map(([name, stem]) => [name, rmsOf(stem, 0, length)]));
}

function mixPhrase(ctx, out, allKicks) {
  const { stems, phraseStart } = ctx;
  const length = Math.min(stems.dry.length, out.length - phraseStart);
  const levels = ctx.collectLevels ? stemLevels(stems, Math.min(length, ctx.phraseLength)) : null;
  const kicksLocal = allKicks.map((k) => k - phraseStart).filter((k) => k >= -10 && k < length);
  applyTonalEcho(ctx, length);
  const wet = runReverb(ctx, length);
  const duck = duckedGains(ctx, length, kicksLocal);
  for (let i = 0; i < length; i += 1) {
    out[phraseStart + i] += stems.dry[i] + stems.bass[i] * duck.bass[i] + stems.tonal[i] * duck.tonal[i] + (wet ? wet[i] : 0);
  }
  return levels;
}

function validateSong(song) {
  const missing = ['id', 'bpm', 'drums', 'bass', 'chords', 'lead', 'pad', 'riser', 'swell', 'impact', 'duck', 'reverb', 'harmony', 'kit', 'scale']
    .filter((key) => song[key] === undefined);
  if (missing.length) throw new Error(`Song "${song.id ?? '?'}" is missing: ${missing.join(', ')}`);
}

/**
 * Renders one song to mono samples. Yields after every bar; the returned value
 * is `{ samples, sampleRate, stats }` where stats has the final peak and RMS.
 * `collectLevels` adds per-stem RMS to the yield after each phrase (tests, tuning).
 */
export function* renderSong(song, fs = SAMPLE_RATE, { collectLevels = false } = {}) {
  validateSong(song);
  const total = trackSamples(song.bpm, fs);
  const out = new Float32Array(total);
  const phraseBeats = PHRASE_BARS * BEATS_PER_BAR;
  const phraseLength = beatSample(song, phraseBeats, fs) + 2;
  const ctx = {
    song, fs, kit: buildKit(song.kit, fs), harmony: expandHarmony(song.harmony),
    stems: allocateStems(phraseLength + Math.round(TAIL_SECONDS * fs)),
    hitCounts: {}, noteCache: new Map(), phraseStart: 0, phraseLength: phraseLength - 2, rng: createRng(song.seed ?? 1), collectLevels,
  };
  const kicks = kickPositions(song, fs);
  for (let phrase = 0; phrase < PHRASE_COUNT; phrase += 1) {
    clearStems(ctx.stems);
    ctx.phraseStart = beatSample(song, phrase * phraseBeats, fs);
    ctx.rng = createRng((song.seed ?? 1) * 1000 + phrase);
    for (let b = 0; b < PHRASE_BARS; b += 1) {
      emitBar(ctx, phrase * PHRASE_BARS + b);
      yield { phrase, bar: phrase * PHRASE_BARS + b };
    }
    const levels = mixPhrase(ctx, out, kicks);
    yield { phrase, mixed: true, levels };
  }
  const stats = yield* masterPass(out, { fs, bpm: song.bpm, master: song.master });
  return { samples: out, sampleRate: fs, stats };
}

/** Runs the generator to completion (tests, workers). */
export function renderSongSync(song, fs = SAMPLE_RATE, options = {}) {
  const run = renderSong(song, fs, options);
  let step = run.next();
  while (!step.done) step = run.next();
  return step.value;
}
