/**
 * Mono Freeverb-style room (8 damped combs into 4 allpasses) with a pre-delay.
 * Delay lengths are the classic 44.1 kHz tunings scaled to our sample rate.
 */
import { SAMPLE_RATE } from './dsp.js';

const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_TUNING = [556, 441, 341, 225];
const TUNING_RATE = 44100;
const ALLPASS_FEEDBACK = 0.5;
const INPUT_GAIN = 0.015;
const OUTPUT_GAIN = 3;

class Comb {
  constructor(size) {
    this.buffer = new Float32Array(size);
    this.index = 0;
    this.filter = 0;
  }

  process(x, feedback, damp) {
    const out = this.buffer[this.index];
    this.filter = out * (1 - damp) + this.filter * damp;
    this.buffer[this.index] = x + this.filter * feedback;
    this.index = this.index + 1 === this.buffer.length ? 0 : this.index + 1;
    return out;
  }
}

class Allpass {
  constructor(size) {
    this.buffer = new Float32Array(size);
    this.index = 0;
  }

  process(x) {
    const held = this.buffer[this.index];
    const out = held - x;
    this.buffer[this.index] = x + held * ALLPASS_FEEDBACK;
    this.index = this.index + 1 === this.buffer.length ? 0 : this.index + 1;
    return out;
  }
}

/**
 * @param {{ room?: number, damp?: number, preDelay?: number }} options
 *   room 0..1 (tail length), damp 0..1 (high-frequency absorption), preDelay in seconds.
 */
export function createReverb({ room = 0.8, damp = 0.4, preDelay = 0.015 } = {}, fs = SAMPLE_RATE) {
  const scale = fs / TUNING_RATE;
  const combs = COMB_TUNING.map((n) => new Comb(Math.round(n * scale)));
  const allpasses = ALLPASS_TUNING.map((n) => new Allpass(Math.round(n * scale)));
  const feedback = 0.7 + room * 0.28;
  const delaySamples = Math.max(1, Math.round(preDelay * fs));
  const preLine = new Float32Array(delaySamples);
  let preIndex = 0;

  function tick(x) {
    const delayed = preLine[preIndex];
    preLine[preIndex] = x;
    preIndex = preIndex + 1 === delaySamples ? 0 : preIndex + 1;
    const input = delayed * INPUT_GAIN;
    let sum = 0;
    for (let c = 0; c < combs.length; c += 1) sum += combs[c].process(input, feedback, damp);
    for (let a = 0; a < allpasses.length; a += 1) sum = allpasses[a].process(sum);
    return sum * OUTPUT_GAIN;
  }

  /** Reads `source[start..end)` and writes the wet signal into `target` (added). */
  function processInto(target, source, start, end, wet = 1) {
    for (let i = start; i < end; i += 1) target[i] += tick(source[i]) * wet;
  }

  return { processInto };
}
