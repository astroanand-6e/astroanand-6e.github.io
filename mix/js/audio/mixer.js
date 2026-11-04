/**
 * The mixer: control values (always tracked, so getState works before any
 * audio exists) and, once a context is attached, the Web Audio graph that
 * applies them: two channel strips, a constant-power crossfader, the Beat FX
 * return, the sampler bus, master level and a limiter.
 */
import { defaultValue } from '../controls.js';
import { createChannelStrip, smooth } from './channel-strip.js';
import { createBeatEcho } from './fx.js';
import {
  BEAT_FX_BEATS, crossfaderGains, fxIncludesChannel, fxReferenceBpm, masterGain, stepBeatFx,
} from './mixer-math.js';

const DEFAULT_FX_BEATS = 1;
// Chrome adds ~0.57 dB of automatic make-up gain per dB of threshold, so a threshold near 0 dB keeps the limiter transparent.
const LIMITER = { threshold: -1, knee: 0, ratio: 20, attack: 0.003, release: 0.12 };
const SAFETY_KNEE = 0.9;
const SAFETY_CEILING = 0.98;
const SAFETY_CURVE_POINTS = 2049;
const METER_FALL_SECONDS = 0.12;
const FALLBACK_BPM = 120;
const TEMPO_EPSILON = 1e-6;
const CHANNELS = [0, 1];

/** Identity below the knee, then a soft approach to the ceiling: a last-resort peak guard. */
export function safetyCurve(points = SAFETY_CURVE_POINTS) {
  const width = SAFETY_CEILING - SAFETY_KNEE;
  return Float32Array.from({ length: points }, (_, i) => {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= SAFETY_KNEE ? a : SAFETY_KNEE + width * Math.tanh((a - SAFETY_KNEE) / width);
    return x < 0 ? -y : y;
  });
}

const pair = (id1, id2) => [defaultValue(id1), defaultValue(id2)];

export class Mixer {
  constructor() {
    this.values = {
      trim: pair('m.trim1', 'm.trim2'),
      hi: pair('m.hi1', 'm.hi2'),
      mid: pair('m.mid1', 'm.mid2'),
      low: pair('m.low1', 'm.low2'),
      cfx: pair('m.cfx1', 'm.cfx2'),
      fader: pair('m.fader1', 'm.fader2'),
      xfader: defaultValue('m.xfader'),
      master: defaultValue('m.master'),
      fx: {
        on: defaultValue('m.fx.on'),
        level: defaultValue('m.fx.level'),
        beatIndex: BEAT_FX_BEATS.indexOf(DEFAULT_FX_BEATS),
        channel: defaultValue('m.fx.channel'),
      },
    };
    this.decks = [{ playing: false, bpm: 0 }, { playing: false, bpm: 0 }];
    this.meters = [{ level: 0, at: 0 }, { level: 0, at: 0 }];
    this.graph = null;
  }

  /** Builds the graph on `ctx` and applies every current value without smoothing. */
  attach(ctx) {
    const strips = CHANNELS.map(() => createChannelStrip(ctx));
    const masterBus = ctx.createGain();
    const sampler = ctx.createGain();
    const master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    Object.entries(LIMITER).forEach(([name, value]) => { limiter[name].value = value; });
    const safety = ctx.createWaveShaper();
    safety.curve = safetyCurve();
    safety.oversample = 'none'; // oversampling would let the clipped peaks ring above the ceiling again
    const echo = createBeatEcho(ctx);
    strips.forEach((strip) => {
      strip.output.connect(masterBus);
      strip.fxSend.connect(echo.input);
    });
    echo.output.connect(masterBus);
    sampler.connect(masterBus);
    masterBus.connect(master).connect(limiter).connect(safety).connect(ctx.destination);
    this.graph = { ctx, strips, masterBus, sampler, master, echo };
    this.applyAll();
  }

  applyAll() {
    const o = { immediate: true };
    const { strips, ctx, master, echo } = this.graph;
    const v = this.values;
    CHANNELS.forEach((c) => {
      strips[c].setTrim(v.trim[c], o);
      strips[c].setEq('high', v.hi[c], o);
      strips[c].setEq('mid', v.mid[c], o);
      strips[c].setEq('low', v.low[c], o);
      strips[c].setCfx(v.cfx[c], o);
      strips[c].setFader(v.fader[c], o);
    });
    this.applyCrossfader(o);
    smooth(ctx, master.gain, masterGain(v.master), o);
    echo.setLevel(v.fx.level);
    this.applyFxSends(o);
    this.applyFxTempo();
  }

  channelInput(channel) {
    return this.graph.strips[channel].input;
  }

  samplerInput() {
    return this.graph.sampler;
  }

  setTrim(channel, value) {
    this.values.trim = replaceAt(this.values.trim, channel, value);
    if (this.graph) this.graph.strips[channel].setTrim(value);
  }

  setEq(band, channel, value) {
    const key = { high: 'hi', mid: 'mid', low: 'low' }[band];
    this.values[key] = replaceAt(this.values[key], channel, value);
    if (this.graph) this.graph.strips[channel].setEq(band, value);
  }

  setCfx(channel, value) {
    this.values.cfx = replaceAt(this.values.cfx, channel, value);
    if (this.graph) this.graph.strips[channel].setCfx(value);
  }

  setFader(channel, value) {
    this.values.fader = replaceAt(this.values.fader, channel, value);
    if (this.graph) this.graph.strips[channel].setFader(value);
  }

  setCrossfader(value) {
    this.values.xfader = value;
    if (this.graph) this.applyCrossfader();
  }

  applyCrossfader(options) {
    const gains = crossfaderGains(this.values.xfader);
    this.graph.strips[0].setCrossfade(gains.left, options);
    this.graph.strips[1].setCrossfade(gains.right, options);
  }

  setMaster(value) {
    this.values.master = value;
    if (this.graph) smooth(this.graph.ctx, this.graph.master.gain, masterGain(value));
  }

  setFxOn(on) {
    this.values = { ...this.values, fx: { ...this.values.fx, on } };
    if (this.graph) this.applyFxSends();
  }

  setFxLevel(level) {
    this.values = { ...this.values, fx: { ...this.values.fx, level } };
    if (this.graph) this.graph.echo.setLevel(level);
  }

  /** direction -1: shorter echo, +1: longer. Returns the new beat length. */
  stepFxBeats(direction) {
    const beatIndex = stepBeatFx(this.values.fx.beatIndex, direction);
    this.values = { ...this.values, fx: { ...this.values.fx, beatIndex } };
    if (this.graph) this.applyFxTempo();
    return BEAT_FX_BEATS[beatIndex];
  }

  setFxChannel(channel) {
    this.values = { ...this.values, fx: { ...this.values.fx, channel } };
    if (this.graph) {
      this.applyFxSends();
      this.applyFxTempo();
    }
  }

  applyFxSends(options) {
    const { on, channel } = this.values.fx;
    CHANNELS.forEach((c) => this.graph.strips[c].setFxSend(on && fxIncludesChannel(channel, c + 1), options));
  }

  /** Tells the echo which decks play at what tempo so its repeats land on the beat. */
  setDeckTempi(decks) {
    const unchanged = decks.every((d, i) => d.playing === this.decks[i].playing && Math.abs(d.bpm - this.decks[i].bpm) < TEMPO_EPSILON);
    if (unchanged) return;
    this.decks = decks;
    if (this.graph) this.applyFxTempo();
  }

  applyFxTempo() {
    const bpm = fxReferenceBpm(this.values.fx.channel, this.decks) || FALLBACK_BPM;
    this.graph.echo.setDelaySeconds((BEAT_FX_BEATS[this.values.fx.beatIndex] * 60) / bpm);
  }

  /** Post-fader peak for a channel, held briefly so a meter reads smoothly (0..1). */
  level(channel, nowSeconds) {
    if (!this.graph) return 0;
    const meter = this.meters[channel];
    const fall = Math.exp(-Math.max(0, nowSeconds - meter.at) / METER_FALL_SECONDS);
    const level = Math.max(this.graph.strips[channel].readPeak(), meter.level * fall);
    this.meters[channel] = { level, at: nowSeconds };
    return Math.min(1, level);
  }

  /** The MixerState object of the contract (fresh arrays, never internal state). */
  snapshot() {
    const v = this.values;
    return {
      trim: [...v.trim],
      hi: [...v.hi],
      mid: [...v.mid],
      low: [...v.low],
      cfx: [...v.cfx],
      fader: [...v.fader],
      xfader: v.xfader,
      master: v.master,
      fx: {
        on: v.fx.on, level: v.fx.level, beats: BEAT_FX_BEATS[v.fx.beatIndex], channel: v.fx.channel,
      },
    };
  }
}

function replaceAt(list, index, value) {
  return list.map((item, i) => (i === index ? value : item));
}
