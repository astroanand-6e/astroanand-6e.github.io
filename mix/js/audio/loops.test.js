import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOP_CROSSFADE_SECONDS, makeLoopSamples, snapLoopToSamples } from './loops.js';
import { makeLoop } from './grid.js';

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);
const SAMPLE_RATE = 32000;

function ramp(length) {
  return Float32Array.from({ length }, (_, i) => i / length);
}

test('loop samples copy the source region before the crossfade', () => {
  const source = ramp(1000);
  const loop = makeLoopSamples(source, 200, 400, 20);
  assert.equal(loop.length, 400);
  near(loop[0], source[200]);
  near(loop[100], source[300]);
  near(loop[379], source[579]);
});

test('the loop end is continuous with the loop start (no click on wrap)', () => {
  // A 220 Hz tone: a naive loop at an arbitrary point would jump at the wrap.
  const source = Float32Array.from({ length: 32000 }, (_, i) => Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE));
  const start = 5000;
  const length = 6001; // not a whole number of periods
  const fade = Math.round(LOOP_CROSSFADE_SECONDS * SAMPLE_RATE);
  const loop = makeLoopSamples(source, start, length, fade);
  const wrapJump = Math.abs(loop[0] - loop[length - 1]);
  const naive = Math.abs(source[start] - source[start + length - 1]);
  const typicalStep = Math.abs(source[start + 1] - source[start]);
  assert.ok(wrapJump <= typicalStep * 2.5, `wrap jump ${wrapJump} vs typical step ${typicalStep}`);
  assert.ok(naive > wrapJump, 'the crossfade must beat a naive loop point');
});

test('the crossfade tail approaches the audio just before the loop start', () => {
  const source = ramp(1000);
  const loop = makeLoopSamples(source, 500, 200, 40);
  near(loop[199], source[499], 0.02);
});

test('reads before the start of the track are silence', () => {
  const source = Float32Array.from({ length: 100 }, () => 1);
  const loop = makeLoopSamples(source, 0, 50, 10);
  near(loop[49], 0, 0.2);
  near(loop[0], 1);
});

test('crossfade never exceeds half the loop', () => {
  const source = ramp(100);
  const loop = makeLoopSamples(source, 10, 8, 400);
  assert.equal(loop.length, 8);
  assert.ok(loop.every(Number.isFinite));
});

test('snapLoopToSamples makes model length equal buffer length exactly', () => {
  const bpm = 122;
  const loop = makeLoop(10.123456, 10.123456 + (4 * 60) / bpm, bpm);
  const { loop: snapped, startSample, lengthSamples } = snapLoopToSamples(loop, SAMPLE_RATE, bpm);
  near(snapped.end - snapped.start, lengthSamples / SAMPLE_RATE, 1e-12);
  near(snapped.start, startSample / SAMPLE_RATE, 1e-12);
  assert.equal(snapped.beats, loop.beats);
});
