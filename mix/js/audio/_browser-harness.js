// TEMPORARY verification harness (deleted before hand-off): runs scripted scenarios on an OfflineAudioContext.
import * as ctl from '../controls.js';
import { createEngine } from './engine.js';
import { createLibrary } from './library.js';
import { Biquad } from './synth/dsp.js';

const makeBuffer = (samples, sampleRate) => {
  const b = new AudioBuffer({ length: samples.length, sampleRate, numberOfChannels: 1 });
  b.copyToChannel(samples, 0);
  return b;
};
export const lib = createLibrary({ makeBuffer });
export { ctl, Biquad };

export async function run({ seconds = 8, steps = [], sr = 48000, library = lib } = {}) {
  const off = new OfflineAudioContext(2, Math.round(seconds * sr), sr);
  const bus = ctl.createBus();
  const events = [];
  bus.addEventListener('engine', (e) => events.push({ ...e.detail, at: off.currentTime }));
  const engine = createEngine({ bus, context: off, library });
  await engine.ready;
  await engine.resume();
  const api = {
    bus, engine, events, log: {}, off,
    press(id) { ctl.emitControl(bus, id, true, 'lesson'); ctl.emitControl(bus, id, false, 'lesson'); },
    down(id) { ctl.emitControl(bus, id, true, 'lesson'); },
    up(id) { ctl.emitControl(bus, id, false, 'lesson'); },
    set(id, v) { ctl.emitControl(bus, id, v, 'lesson'); },
    state: () => engine.getState(),
  };
  const sorted = [...steps].sort((a, b) => a.t - b.t);
  for (const step of sorted) {
    if (step.t <= 0) { step.fn(api); continue; }
    off.suspend(step.t).then(() => {
      try { step.fn(api); } catch (e) { api.log[`ERR@${step.t}`] = String(e.stack || e); }
      off.resume();
    });
  }
  const t0 = performance.now();
  const buffer = await off.startRendering();
  const renderMs = performance.now() - t0;
  engine.dispose();
  return { buffer, api, events, renderMs, sr };
}

export const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
export function rms(buffer, t0, t1, ch = 0) {
  const d = buffer.getChannelData(ch); const sr = buffer.sampleRate; let s = 0;
  const a = Math.round(t0 * sr); const b = Math.round(t1 * sr);
  for (let i = a; i < b; i += 1) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, b - a));
}
export function peak(buffer, t0 = 0, t1 = buffer.duration, ch = 0) {
  const d = buffer.getChannelData(ch); const sr = buffer.sampleRate; let p = 0;
  for (let i = Math.round(t0 * sr); i < Math.round(t1 * sr); i += 1) p = Math.max(p, Math.abs(d[i]));
  return p;
}
export function filtered(buffer, t0, t1, lo, hi, ch = 0) {
  const sr = buffer.sampleRate;
  const x = Float32Array.from(buffer.getChannelData(ch).subarray(Math.round(t0 * sr), Math.round(t1 * sr)));
  const chain = [];
  if (lo) chain.push(Biquad.highpass(lo, 0.7071, sr), Biquad.highpass(lo, 0.7071, sr));
  if (hi) chain.push(Biquad.lowpass(hi, 0.7071, sr), Biquad.lowpass(hi, 0.7071, sr));
  chain.forEach((f) => f.processRange(x));
  return x;
}
export function bandRms(buffer, t0, t1, lo, hi, ch = 0) {
  const x = filtered(buffer, t0, t1, lo, hi, ch);
  const skip = Math.round(0.05 * buffer.sampleRate); let s = 0;
  for (let i = skip; i < x.length; i += 1) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length - skip));
}
/** Times (s) of energy onsets in the low band: kick detection on a mono mix. */
export function kickOnsets(buffer, t0, t1, ch = 0) {
  const sr = buffer.sampleRate;
  const x = filtered(buffer, t0, t1, 0, 140, ch);
  const win = Math.round(0.004 * sr); const env = new Float32Array(Math.floor(x.length / win));
  for (let i = 0; i < env.length; i += 1) { let s = 0; for (let j = 0; j < win; j += 1) s += x[i * win + j] ** 2; env[i] = Math.sqrt(s / win); }
  const max = Math.max(...env); const out = []; let armed = true;
  for (let i = 1; i < env.length; i += 1) {
    if (armed && env[i] > max * 0.5 && env[i] > env[i - 1]) { out.push(t0 + (i * win) / sr); armed = false; }
    if (env[i] < max * 0.15) armed = true;
  }
  return out;
}
