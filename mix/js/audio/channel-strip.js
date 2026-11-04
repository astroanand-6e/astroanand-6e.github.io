/**
 * One mixer channel as a Web Audio graph:
 *
 *   input -> trim -> 3-band isolator EQ -> CFX filter -> (FX send)
 *                                                     -> channel fader -> (meter)
 *                                                                      -> crossfader gain -> output
 *
 * The EQ splits the signal with Linkwitz-Riley (4th order) crossovers at
 * 200 Hz and 2.5 kHz and recombines the bands through per-band gains, so a
 * band at "kill" is silent for real. The low band passes an all-pass that
 * matches the second crossover's phase, which keeps the flat setting flat.
 */
import {
  cfxSettings, eqGain, faderGain, trimGain, webAudioQ,
} from './mixer-math.js';

export const PARAM_SMOOTH_SECONDS = 0.012;
const CFX_SMOOTH_SECONDS = 0.02;
const EXACT_ZERO_AFTER_TAUS = 10;
const LOW_CROSSOVER_HZ = 200;
const HIGH_CROSSOVER_HZ = 2500;
const BUTTERWORTH_Q = Math.SQRT1_2;
const METER_FFT_SIZE = 256;

/**
 * Moves `param` toward `value` with a ~10-20 ms exponential glide (no zipper
 * noise). `immediate` jumps straight there (used when the graph is built).
 */
export function smooth(ctx, param, value, { tau = PARAM_SMOOTH_SECONDS, immediate = false } = {}) {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  if (immediate) {
    param.setValueAtTime(value, now);
    return;
  }
  param.setTargetAtTime(value, now, tau);
  if (value === 0) param.setValueAtTime(0, now + tau * EXACT_ZERO_AFTER_TAUS);
}

function biquad(ctx, type, frequency, q = BUTTERWORTH_Q) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = webAudioQ(type, q);
  return node;
}

/** Linkwitz-Riley 4th order filter: two Butterworth sections in series. */
function linkwitzRiley(ctx, type, frequency) {
  const first = biquad(ctx, type, frequency);
  const second = biquad(ctx, type, frequency);
  first.connect(second);
  return { input: first, output: second };
}

function buildEq(ctx, trim) {
  const sum = ctx.createGain();
  const gains = { low: ctx.createGain(), mid: ctx.createGain(), high: ctx.createGain() };
  const lowPass = linkwitzRiley(ctx, 'lowpass', LOW_CROSSOVER_HZ);
  const aboveLow = linkwitzRiley(ctx, 'highpass', LOW_CROSSOVER_HZ);
  const belowHigh = linkwitzRiley(ctx, 'lowpass', HIGH_CROSSOVER_HZ);
  const aboveHigh = linkwitzRiley(ctx, 'highpass', HIGH_CROSSOVER_HZ);
  trim.connect(lowPass.input);
  lowPass.output.connect(gains.low).connect(biquad(ctx, 'allpass', HIGH_CROSSOVER_HZ)).connect(sum);
  trim.connect(aboveLow.input);
  aboveLow.output.connect(belowHigh.input);
  belowHigh.output.connect(gains.mid).connect(sum);
  aboveLow.output.connect(aboveHigh.input);
  aboveHigh.output.connect(gains.high).connect(sum);
  return { sum, gains };
}

export function createChannelStrip(ctx) {
  const input = ctx.createGain();
  const trim = ctx.createGain();
  input.connect(trim);
  const eq = buildEq(ctx, trim);
  const cfxHighpass = biquad(ctx, 'highpass', 20);
  const cfxLowpass = biquad(ctx, 'lowpass', 20000);
  eq.sum.connect(cfxHighpass).connect(cfxLowpass);
  const fxSend = ctx.createGain();
  fxSend.gain.value = 0;
  cfxLowpass.connect(fxSend);
  const fader = ctx.createGain();
  cfxLowpass.connect(fader);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = METER_FFT_SIZE;
  fader.connect(analyser);
  const crossfade = ctx.createGain();
  fader.connect(crossfade);
  const meterBuffer = new Float32Array(METER_FFT_SIZE);

  return {
    input,
    output: crossfade,
    fxSend,
    setTrim: (value, o) => smooth(ctx, trim.gain, trimGain(value), o),
    setEq: (band, value, o) => smooth(ctx, eq.gains[band].gain, eqGain(value), o),
    setCfx(value, o) {
      const s = cfxSettings(value);
      const options = { tau: CFX_SMOOTH_SECONDS, ...o };
      smooth(ctx, cfxLowpass.frequency, s.lowpassHz, options);
      smooth(ctx, cfxHighpass.frequency, s.highpassHz, options);
      smooth(ctx, cfxLowpass.Q, webAudioQ('lowpass', s.q), options);
      smooth(ctx, cfxHighpass.Q, webAudioQ('highpass', s.q), options);
    },
    setFader: (value, o) => smooth(ctx, fader.gain, faderGain(value), o),
    setCrossfade: (gain, o) => smooth(ctx, crossfade.gain, gain, o),
    setFxSend: (on, o) => smooth(ctx, fxSend.gain, on ? 1 : 0, o),
    /** Peak of the last few milliseconds after the channel fader, 0..1+. */
    readPeak() {
      analyser.getFloatTimeDomainData(meterBuffer);
      let peak = 0;
      for (let i = 0; i < meterBuffer.length; i += 1) peak = Math.max(peak, Math.abs(meterBuffer[i]));
      return peak;
    },
  };
}
