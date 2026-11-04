import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWaveform, emptyWaveform, normalizeBand, percentile, waveformSteps } from './waveform.js';

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);
const SAMPLE_RATE = 32000;

const sine = (hz, seconds, amplitude = 0.5) => Float32Array.from(
  { length: Math.round(seconds * SAMPLE_RATE) },
  (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE),
);

const mean = (band, from = 0.2, to = 0.9) => {
  const a = Math.floor(band.length * from);
  const b = Math.floor(band.length * to);
  let sum = 0;
  for (let i = a; i < b; i += 1) sum += band[i];
  return sum / (b - a);
};

test('about 100 bins per second, every value between 0 and 1', () => {
  const wave = computeWaveform(sine(100, 3), SAMPLE_RATE);
  assert.equal(wave.binSeconds, 0.01);
  for (const band of [wave.low, wave.mid, wave.high]) {
    assert.ok(band instanceof Float32Array);
    assert.equal(band.length, 300);
    assert.ok(band.every((v) => v >= 0 && v <= 1));
  }
});

test('a bass tone lights the low band, a mid tone the mid band, a hiss the high band', () => {
  const low = computeWaveform(sine(60, 2), SAMPLE_RATE);
  assert.ok(mean(low.low) > 0.8);
  assert.ok(mean(low.mid) < mean(low.low) * 0.5 || mean(low.mid) < 0.3);
  const mid = computeWaveform(sine(900, 2), SAMPLE_RATE);
  assert.ok(mean(mid.mid) > 0.7);
  assert.ok(mean(mid.low) < 0.5);
  const high = computeWaveform(sine(7000, 2), SAMPLE_RATE);
  assert.ok(mean(high.high) > 0.7);
  assert.ok(mean(high.low) < 0.3);
});

test('silence gives an all-zero waveform', () => {
  const wave = computeWaveform(new Float32Array(SAMPLE_RATE), SAMPLE_RATE);
  assert.ok(wave.low.every((v) => v === 0));
  assert.ok(wave.high.every((v) => v === 0));
});

test('the sliced generator returns the same result as the one-shot call', () => {
  const samples = sine(200, 25);
  const run = waveformSteps(samples, SAMPLE_RATE);
  let step = run.next();
  let yields = 0;
  while (!step.done) {
    yields += 1;
    step = run.next();
  }
  assert.ok(yields >= 1);
  assert.deepEqual(Array.from(step.value.low), Array.from(computeWaveform(samples, SAMPLE_RATE).low));
});

test('percentile and normalizeBand scale against a shared reference', () => {
  const values = Float32Array.from({ length: 100 }, (_, i) => (i + 1) / 100);
  near(percentile(values, 0.5), 0.51);
  const normalized = normalizeBand(values, 1);
  near(normalized[99], 1);
  assert.ok(normalized[0] < normalized[50]);
  assert.ok(normalizeBand(values, 2)[99] < 1, 'a larger reference keeps quieter material below full height');
});

test('bands share one scale: a quiet hiss stays visibly smaller than a loud kick', () => {
  const kick = sine(60, 2, 0.8);
  const hiss = sine(7000, 2, 0.1);
  const mixed = Float32Array.from(kick, (v, i) => v + hiss[i]);
  const wave = computeWaveform(mixed, SAMPLE_RATE);
  assert.ok(mean(wave.low) > 0.9);
  assert.ok(mean(wave.high) < mean(wave.low) * 0.7);
  assert.ok(mean(wave.high) > 0.2, 'but still readable');
});

test('an unrendered track gets a zero placeholder of the right length', () => {
  const wave = emptyWaveform(10);
  assert.equal(wave.low.length, 1000);
  assert.equal(wave.pending, true);
  assert.ok(wave.mid.every((v) => v === 0));
});
