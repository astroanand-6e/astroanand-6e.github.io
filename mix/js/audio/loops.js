/**
 * Click-free loop material. A loop is played from its own small buffer whose
 * last few milliseconds are cross-faded with the audio *before* the loop start,
 * so the jump from the loop end back to its start is continuous (no click).
 * The same buffer serves manual loops, auto loops and beat-repeat rolls.
 */
import { makeLoop } from './grid.js';

export const LOOP_CROSSFADE_SECONDS = 0.003;

/**
 * Copies `lengthSamples` of `source` from `startSample` and blends the tail
 * toward the samples preceding the start (equal-power), so wrapping is seamless.
 * Samples outside `source` read as silence.
 */
export function makeLoopSamples(source, startSample, lengthSamples, crossfadeSamples) {
  const length = Math.max(1, Math.round(lengthSamples));
  const out = new Float32Array(length);
  const read = (i) => (i >= 0 && i < source.length ? source[i] : 0);
  for (let i = 0; i < length; i += 1) out[i] = read(startSample + i);
  const fade = Math.min(Math.round(crossfadeSamples), length >> 1);
  for (let i = 0; i < fade; i += 1) {
    const t = (i + 0.5) / fade;
    const target = length - fade + i;
    out[target] = out[target] * Math.cos((t * Math.PI) / 2) + read(startSample - fade + i) * Math.sin((t * Math.PI) / 2);
  }
  return out;
}

/**
 * Snaps a loop to whole samples so the model's loop length equals the loop
 * buffer length exactly (no drift between model and audio over many repeats).
 */
export function snapLoopToSamples(loop, sampleRate, bpm) {
  const startSample = Math.round(loop.start * sampleRate);
  const lengthSamples = Math.max(1, Math.round((loop.end - loop.start) * sampleRate));
  const snapped = makeLoop(startSample / sampleRate, (startSample + lengthSamples) / sampleRate, bpm);
  return { loop: { ...snapped, beats: loop.beats }, startSample, lengthSamples };
}
