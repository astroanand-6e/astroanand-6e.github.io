const BPM = 104;
const STEP_SECONDS = 60 / BPM / 4;
const LOOKAHEAD_SECONDS = 0.15;
const TICK_MS = 40;
const MASTER_GAIN = 0.14;
const FADE_SECONDS = 0.25;
const ROOT_HZ = 55;
const SCALE = [0, 3, 5, 7, 10];
const BASS_PATTERN = [0, -1, 0, -1, 2, -1, 0, 3, 0, -1, 0, -1, 4, -1, 3, 2];
const LEAD_PATTERN = [-1, -1, 4, -1, -1, 2, -1, -1, 3, -1, -1, 1, -1, 4, -1, -1];
const NOISE_SECONDS = 0.08;

const noteHz = (degree, octave) =>
  ROOT_HZ * 2 ** octave * 2 ** (SCALE[degree % SCALE.length] / 12);

/** Tiny synthesized loop (kick, hat, bass, pluck). No samples. */
export function createSound() {
  let ctx = null;
  let master = null;
  let noise = null;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  let isOn = false;

  function envelope(gainValue, start, length) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainValue, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + length);
    g.connect(master);
    return g;
  }

  function tone(type, hz, start, length, gainValue, endHz) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, start);
    if (endHz) osc.frequency.exponentialRampToValueAtTime(endHz, start + length);
    osc.connect(envelope(gainValue, start, length));
    osc.start(start);
    osc.stop(start + length + 0.02);
  }

  function hat(start) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    src.connect(filter);
    filter.connect(envelope(0.18, start, 0.05));
    src.start(start);
  }

  function schedule(time, index) {
    const s = index % 16;
    if (s % 4 === 0) tone('sine', 130, time, 0.16, 0.9, 42);
    if (s % 2 === 1) hat(time);
    if (BASS_PATTERN[s] >= 0) tone('triangle', noteHz(BASS_PATTERN[s], 0), time, 0.22, 0.5);
    if (LEAD_PATTERN[s] >= 0) tone('sine', noteHz(LEAD_PATTERN[s], 4), time, 0.4, 0.16);
  }

  function tick() {
    while (nextTime < ctx.currentTime + LOOKAHEAD_SECONDS) {
      schedule(nextTime, step);
      nextTime += STEP_SECONDS;
      step += 1;
    }
  }

  function buildNoise() {
    const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function ensureContext() {
    if (ctx) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    noise = buildNoise();
    return true;
  }

  function start() {
    if (isOn || !ensureContext()) return;
    isOn = true;
    ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(MASTER_GAIN, ctx.currentTime + FADE_SECONDS);
    nextTime = ctx.currentTime + 0.05;
    step = 0;
    timer = setInterval(tick, TICK_MS);
  }

  function stop() {
    if (!isOn) return;
    isOn = false;
    clearInterval(timer);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_SECONDS);
  }

  return {
    start,
    stop,
    /** value true/false forces on/off; undefined toggles. */
    toggle(value) {
      const next = typeof value === 'boolean' ? value : !isOn;
      if (next) start();
      else stop();
      return isOn;
    },
    isOn: () => isOn,
    dispose() {
      stop();
      if (ctx) ctx.close();
      ctx = null;
    },
  };
}
