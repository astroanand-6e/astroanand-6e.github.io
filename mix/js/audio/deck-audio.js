/**
 * Web Audio side of a deck. It makes audible what the Deck model decides:
 * one "main" voice (the track, or a click-free loop buffer) that is
 * cross-faded whenever playback restarts, an optional beat-repeat roll voice
 * that mutes the main voice while a pad is held, a granular scrub voice and
 * one-shot sampler sounds.
 *
 * It can be constructed before any AudioContext exists (the engine renders
 * tracks first); every call is a harmless no-op until `attach` is given one.
 */
import { LOOP_CROSSFADE_SECONDS, makeLoopSamples } from './loops.js';
import { SAMPLER_REFERENCE_BPM } from './sampler.js';
import { Scrubber } from './scrub.js';

export const FADE_SECONDS = 0.005;
const ROLL_FADE_SECONDS = 0.003;
const MUTE_TIME_CONSTANT = 0.001;
const STOP_PAD_SECONDS = 0.01;
const BEND_EPSILON = 1e-5;
const END_GUARD_SECONDS = 0.001;
const SAMPLER_GAIN = 0.9;
const MIN_ROLL_SAMPLES = 2;

/**
 * Plays `rate = { base, bend, tau }` on a playbackRate param from `time`:
 * jump to base * (1 + bend), then decay toward base with time constant tau.
 */
export function applyRate(param, rate, time) {
  param.cancelScheduledValues(time);
  param.setValueAtTime(rate.base * (1 + rate.bend), time);
  if (Math.abs(rate.bend) > BEND_EPSILON) param.setTargetAtTime(rate.base, time, rate.tau);
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export class DeckAudio {
  constructor() {
    this.ctx = null;
    this.output = null;
    this.mainBus = null;
    this.samplerOutput = null;
    this.samplerBank = null;
    this.buffer = null;
    this.samples = null;
    this.playable = null;
    this.current = null;
    this.roll = null;
    this.loopCache = null;
    this.scrubber = new Scrubber();
  }

  /** Connects this deck to a context; `output` receives the deck's audio. */
  attach(ctx, { output, samplerOutput, samplerBank }) {
    this.ctx = ctx;
    this.output = output;
    this.samplerOutput = samplerOutput;
    this.samplerBank = samplerBank;
    this.mainBus = ctx.createGain();
    this.mainBus.connect(output);
    this.scrubber.attach(ctx, output);
    this.playable = null;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setBuffer(buffer) {
    this.buffer = buffer;
    this.samples = buffer ? buffer.getChannelData(0) : null;
    this.playable = null;
    this.loopCache = null;
    this.scrubber.setBuffer(buffer);
  }

  /** The track as a real AudioBuffer (tests and old browsers hand us a stand-in). */
  audioBuffer() {
    if (this.playable) return this.playable;
    const real = typeof AudioBuffer !== 'undefined' && this.buffer instanceof AudioBuffer;
    if (real) {
      this.playable = this.buffer;
    } else {
      this.playable = this.ctx.createBuffer(1, this.buffer.length, this.buffer.sampleRate);
      this.playable.copyToChannel(this.samples, 0);
    }
    return this.playable;
  }

  createVoice({ buffer, offset, loop, rate, when, destination, fade = FADE_SECONDS }) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(1, when + fade);
    source.connect(gain);
    gain.connect(destination);
    applyRate(source.playbackRate, rate, when);
    source.start(when, offset);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    return { source, gain };
  }

  /** Fades a voice out starting at `when` and schedules its stop. */
  retire(voice, when, fade = FADE_SECONDS) {
    const level = voice.gain.gain;
    level.cancelScheduledValues(when);
    level.setValueAtTime(level.value, when);
    level.linearRampToValueAtTime(0, when + fade);
    voice.source.stop(when + fade + STOP_PAD_SECONDS);
  }

  /** (Re)starts the main voice at `position`, cross-fading from whatever played before. */
  start({ time, position, rate, loop }) {
    if (!this.ctx || !this.buffer) return;
    const when = Math.max(time, this.ctx.currentTime);
    const voice = loop ? this.loopVoice(loop, position, rate, when) : this.trackVoice(position, rate, when);
    const previous = this.current;
    this.current = voice;
    if (previous) this.retire(previous, when);
  }

  trackVoice(position, rate, when) {
    if (position >= this.buffer.duration - END_GUARD_SECONDS) return null;
    return this.createVoice({
      buffer: this.audioBuffer(), offset: Math.max(0, position), loop: false, rate, when, destination: this.mainBus,
    });
  }

  loopVoice(loop, position, rate, when) {
    const buffer = this.loopBuffer(loop);
    const offset = clamp(position - loop.start, 0, buffer.duration - END_GUARD_SECONDS);
    return this.createVoice({
      buffer, offset, loop: true, rate, when, destination: this.mainBus,
    });
  }

  /** Click-free loop material for a loop that is already snapped to whole samples. */
  loopBuffer(loop) {
    const key = `${loop.start}:${loop.end}`;
    if (this.loopCache && this.loopCache.key === key) return this.loopCache.buffer;
    const rate = this.buffer.sampleRate;
    const length = Math.max(MIN_ROLL_SAMPLES, Math.round((loop.end - loop.start) * rate));
    const fade = Math.round(LOOP_CROSSFADE_SECONDS * rate);
    const buffer = this.bufferFrom(makeLoopSamples(this.samples, Math.round(loop.start * rate), length, fade), rate);
    this.loopCache = { key, buffer };
    return buffer;
  }

  bufferFrom(samples, sampleRate) {
    const buffer = this.ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    return buffer;
  }

  /** Pauses: fades the main voice (and any roll) out. */
  stop(time) {
    if (!this.ctx) return;
    const when = Math.max(time, this.ctx.currentTime);
    if (this.current) this.retire(this.current, when);
    this.current = null;
    this.stopRoll(when);
    this.scrubber.end();
  }

  /** Follows tempo changes and nudges on every live voice. */
  setRate({ time, base, bend, tau }) {
    if (!this.ctx) return;
    const when = Math.max(time, this.ctx.currentTime);
    for (const voice of [this.current, this.roll]) {
      if (voice) applyRate(voice.source.playbackRate, { base, bend, tau }, when);
    }
  }

  /** Beat repeat: loops [start, start + length) seconds of the track and mutes the main voice. */
  startRoll({ time, start, length, rate }) {
    if (!this.ctx || !this.buffer) return;
    const when = Math.max(time, this.ctx.currentTime);
    if (this.roll) this.retire(this.roll, when, ROLL_FADE_SECONDS);
    const sampleRate = this.buffer.sampleRate;
    const samples = Math.max(MIN_ROLL_SAMPLES, Math.round(length * sampleRate));
    const fade = Math.min(Math.round(LOOP_CROSSFADE_SECONDS * sampleRate), samples >> 2);
    const slice = makeLoopSamples(this.samples, Math.round(start * sampleRate), samples, fade);
    this.roll = this.createVoice({
      buffer: this.bufferFrom(slice, sampleRate), offset: 0, loop: true, rate, when, destination: this.output, fade: ROLL_FADE_SECONDS,
    });
    this.mainBus.gain.setTargetAtTime(0, when, MUTE_TIME_CONSTANT);
  }

  stopRoll(time) {
    if (!this.ctx || !this.mainBus) return;
    const when = Math.max(time, this.ctx.currentTime);
    if (this.roll) this.retire(this.roll, when, ROLL_FADE_SECONDS);
    this.roll = null;
    this.mainBus.gain.setTargetAtTime(1, when, MUTE_TIME_CONSTANT);
  }

  scrubBegin(spec) {
    this.scrubber.begin(spec);
  }

  scrubMove(spec) {
    this.scrubber.move(spec);
  }

  scrubEnd() {
    this.scrubber.end();
  }

  /** One-shot sampler sound; `bpm` stretches tempo-based sounds to the deck's tempo. */
  trigger(name, { time, bpm }) {
    const buffer = this.samplerBank && this.samplerBank[name];
    if (!this.ctx || !buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = bpm > 0 ? bpm / SAMPLER_REFERENCE_BPM : 1;
    const gain = this.ctx.createGain();
    gain.gain.value = SAMPLER_GAIN;
    source.connect(gain);
    gain.connect(this.samplerOutput);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(Math.max(time, this.ctx.currentTime));
  }

  dispose() {
    this.scrubber.dispose();
    for (const voice of [this.current, this.roll]) {
      if (!voice) continue;
      try { voice.source.stop(); } catch { /* already stopped */ }
    }
    this.current = null;
    this.roll = null;
  }
}
