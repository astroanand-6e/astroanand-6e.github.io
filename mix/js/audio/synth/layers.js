/**
 * Turns a song recipe + the arrangement into sound, one bar at a time.
 * Every emitter writes into the phrase-local stems held by the render context:
 *   dry    drums and risers (never ducked)
 *   bass   bass line (ducked by the kick)
 *   tonal  chords / pads / lead (ducked, feeds the reverb and echo)
 *   verb   reverb-only sends from drums
 */
import { mixInto, midiToHz } from './dsp.js';
import {
  PHRASE_BARS, STEPS_PER_BAR, barInPhrase, isLastBarOfPhrase, layerActive, phraseOfBar,
} from './arrangement.js';
import { renderImpact, renderSweep } from './sweeps.js';
import { noteSamples, voiceFor } from './voices.js';

const SECONDS_PER_MINUTE = 60;
const STEPS_PER_BEAT = 4;
const VELOCITY_STEPS = 9;
const STRUM_SECONDS = 0.004;
const SWELL_STEPS = 8;
// [step, semitones, steps, velocity] / [step, steps, velocity]: the downbeat hit of a layer entering on a phrase boundary
const ENTRY_BASS = [0, 0, 2, 0.9];
const ENTRY_CHORD = [0, 2, 0.85];
const HAT_ROLL = { steps: [12, 13, 14, 15], velocity: [0.35, 0.45, 0.62, 0.85] };

const stepSeconds = (song) => SECONDS_PER_MINUTE / song.bpm / STEPS_PER_BEAT;

/** Absolute sample index of a step; odd 16ths are delayed by the song's swing. */
export function sampleAt(ctx, bar, step, swung = true) {
  const swing = swung && step % 2 === 1 ? ctx.song.swing * stepSeconds(ctx.song) : 0;
  const beat = bar * 4 + step / STEPS_PER_BEAT;
  return Math.round(((beat * SECONDS_PER_MINUTE) / ctx.song.bpm + swing) * ctx.fs);
}

const localIndex = (ctx, absolute) => absolute - ctx.phraseStart;
const pickPattern = (pattern, bar) => (Array.isArray(pattern) ? pattern[bar % pattern.length] : pattern);

function velocityOf(char) {
  const level = Number.parseInt(char, 10);
  return Number.isNaN(level) ? 0 : level / VELOCITY_STEPS;
}

function nextShot(ctx, name) {
  const shots = ctx.kit[name];
  if (!shots) throw new Error(`Song "${ctx.song.id}" has no drum "${name}" in its kit`);
  const count = ctx.hitCounts[name] ?? 0;
  ctx.hitCounts[name] = count + 1;
  return shots[count % shots.length];
}

function placeHit(ctx, idx, shot, gain, send) {
  mixInto(ctx.stems.dry, idx, shot, gain);
  if (send) mixInto(ctx.stems.verb, idx, shot, gain * send);
}

function humanize(ctx, amount = 0.06) {
  return 1 + (ctx.rng() - 0.5) * 2 * amount;
}

function emitLane(ctx, bar, lane) {
  const pattern = pickPattern(lane.pattern, bar);
  for (let step = 0; step < STEPS_PER_BAR; step += 1) {
    const velocity = velocityOf(pattern[step]);
    if (velocity === 0) continue;
    const idx = localIndex(ctx, sampleAt(ctx, bar, step, lane.swing !== false));
    const gain = lane.gain * velocity * humanize(ctx, lane.jitter);
    placeHit(ctx, idx, nextShot(ctx, lane.hit), gain, lane.send);
  }
}

export function emitDrums(ctx, bar) {
  for (const lane of ctx.song.drums) {
    if (layerActive(lane.layer, bar)) emitLane(ctx, bar, lane);
  }
}

/** Expands `harmony` entries into one record per bar of the 8-bar phrase. */
export function expandHarmony(harmony) {
  const bars = [];
  for (const entry of harmony) {
    for (let i = 0; i < entry.bars; i += 1) {
      bars.push({ root: entry.root, chord: entry.chord, offset: i, length: entry.bars });
    }
  }
  if (bars.length !== PHRASE_BARS) throw new Error(`Harmony must span ${PHRASE_BARS} bars, got ${bars.length}`);
  return bars;
}

const MAX_CACHED_NOTE_SECONDS = 2; // longer notes (pads) rarely repeat, so they are not worth the memory

/**
 * A note rendered at unit velocity, cached per part/pitch/length: bass lines
 * and chord stabs repeat constantly, and voices are linear in velocity.
 */
function renderedNote(ctx, part, midi, steps, seconds) {
  const render = () => {
    const note = new Float32Array(noteSamples(seconds, part.params, ctx.fs));
    voiceFor(part.voice)(note, 0, midiToHz(midi), seconds, 1, part.params, ctx.fs);
    return note;
  };
  if (seconds > MAX_CACHED_NOTE_SECONDS) return render();
  if (!ctx.noteCache.has(part)) ctx.noteCache.set(part, new Map());
  const cache = ctx.noteCache.get(part);
  const key = `${midi}:${steps}`;
  if (!cache.has(key)) cache.set(key, render());
  return cache.get(key);
}

function playNote(ctx, stem, bar, step, midi, steps, velocity, part, delaySeconds = 0) {
  const idx = localIndex(ctx, sampleAt(ctx, bar, step, part.swing !== false)) + Math.round(delaySeconds * ctx.fs);
  const seconds = steps * stepSeconds(ctx.song);
  mixInto(stem, idx, renderedNote(ctx, part, midi, steps, seconds), velocity);
}

/** True on the first bar of a phrase in which `layer` newly joins. */
export function layerEntersAt(layer, bar) {
  return barInPhrase(bar) === 0 && layerActive(layer, bar) && (bar < PHRASE_BARS || !layerActive(layer, bar - PHRASE_BARS));
}

/** Adds a downbeat hit when an entering layer's pattern would otherwise start late in the bar. */
function withEntryHit(events, hit) {
  return events.some((event) => event[0] === 0) ? events : [hit, ...events];
}

const PITCH_CLASSES = 12;

/** Lowers a MIDI note by semitones until its pitch class belongs to `scale` (an array of pitch classes). */
export function snapToScale(midi, scale) {
  let note = midi;
  while (!scale.includes(((note % PITCH_CLASSES) + PITCH_CLASSES) % PITCH_CLASSES)) note -= 1;
  return note;
}

export function emitBass(ctx, bar) {
  if (!layerActive('bass', bar)) return;
  const part = ctx.song.bass;
  const patterns = part.patterns[phraseOfBar(bar).bass];
  const pattern = patterns[barInPhrase(bar) % patterns.length];
  const events = layerEntersAt('bass', bar) ? withEntryHit(pattern, ENTRY_BASS) : pattern;
  const { root } = ctx.harmony[barInPhrase(bar)];
  for (const [step, semitones, steps, velocity] of events) {
    playNote(ctx, ctx.stems.bass, bar, step, snapToScale(root + semitones, ctx.song.scale), steps, velocity, part);
  }
}

export function emitChords(ctx, bar) {
  if (!layerActive('chords', bar)) return;
  const part = ctx.song.chords;
  const pattern = part.rhythm[barInPhrase(bar) % part.rhythm.length];
  const events = layerEntersAt('chords', bar) ? withEntryHit(pattern, ENTRY_CHORD) : pattern;
  const { chord } = ctx.harmony[barInPhrase(bar)];
  for (const [step, steps, velocity] of events) {
    chord.forEach((midi, i) => playNote(ctx, ctx.stems.tonal, bar, step, midi, steps, velocity, part, i * STRUM_SECONDS));
  }
}

export function emitLead(ctx, bar) {
  if (!layerActive('lead', bar)) return;
  const part = ctx.song.lead;
  const inPhrase = barInPhrase(bar);
  for (const [motifBar, step, midi, steps, velocity] of part.motif) {
    if (motifBar === inPhrase) playNote(ctx, ctx.stems.tonal, bar, step, midi, steps, velocity, part);
  }
}

/** Pads hold each chord for its full length; they start on the chord's first bar. */
export function emitPad(ctx, bar) {
  if (!layerActive('pad', bar)) return;
  const part = ctx.song.pad;
  const { chord, offset, length } = ctx.harmony[barInPhrase(bar)];
  if (offset !== 0) return;
  const steps = length * STEPS_PER_BAR;
  chord.forEach((midi) => playNote(ctx, ctx.stems.tonal, bar, 0, midi + (part.transpose ?? 0), steps, 1, part, 0));
}

export function emitRiser(ctx, bar) {
  if (!layerActive('riser', bar) || barInPhrase(bar) !== 0) return;
  const seconds = PHRASE_BARS * 4 * (SECONDS_PER_MINUTE / ctx.song.bpm);
  renderSweep(ctx.stems.dry, localIndex(ctx, sampleAt(ctx, bar, 0, false)), seconds, ctx.song.riser, ctx.fs);
}

export function emitImpact(ctx, bar) {
  if (!phraseOfBar(bar).impact || barInPhrase(bar) !== 0) return;
  renderImpact(ctx.stems.dry, localIndex(ctx, sampleAt(ctx, bar, 0, false)), ctx.song.impact, ctx.fs);
}

function emitHatRoll(ctx, bar) {
  HAT_ROLL.steps.forEach((step, i) => {
    const idx = localIndex(ctx, sampleAt(ctx, bar, step, false));
    placeHit(ctx, idx, nextShot(ctx, 'hatClosed'), ctx.song.fillGain * HAT_ROLL.velocity[i], 0);
  });
}

function emitSnareHits(ctx, bar, steps) {
  const last = steps.length - 1;
  steps.forEach((step, i) => {
    const velocity = 0.3 + (0.7 * i) / last;
    const idx = localIndex(ctx, sampleAt(ctx, bar, step, false));
    placeHit(ctx, idx, nextShot(ctx, 'fill'), ctx.song.fillGain * velocity, ctx.song.fillSend ?? 0);
  });
}

function emitSwell(ctx, bar) {
  const start = localIndex(ctx, sampleAt(ctx, bar, STEPS_PER_BAR - SWELL_STEPS, false));
  const seconds = SWELL_STEPS * stepSeconds(ctx.song);
  renderSweep(ctx.stems.dry, start, seconds, ctx.song.swell, ctx.fs);
}

const FILLS = {
  hatRoll: emitHatRoll,
  snareRoll: (ctx, bar) => emitSnareHits(ctx, bar, [8, 9, 10, 11, 12, 13, 14, 15]),
  snareBuild: (ctx, bar) => emitSnareHits(ctx, bar, [0, 2, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15]),
  swell: emitSwell,
};

export function emitFill(ctx, bar) {
  const fill = phraseOfBar(bar).fill;
  if (!fill || !isLastBarOfPhrase(bar)) return;
  const emit = FILLS[fill];
  if (!emit) throw new Error(`Unknown fill "${fill}"`);
  emit(ctx, bar);
}

/** Everything that sounds in one bar. */
export function emitBar(ctx, bar) {
  emitDrums(ctx, bar);
  emitBass(ctx, bar);
  emitChords(ctx, bar);
  emitLead(ctx, bar);
  emitPad(ctx, bar);
  emitRiser(ctx, bar);
  emitImpact(ctx, bar);
  emitFill(ctx, bar);
}
