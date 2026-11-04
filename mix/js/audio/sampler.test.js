import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLER_NAMES, SAMPLER_PEAK, SAMPLER_REFERENCE_BPM, renderSamplerBank } from './sampler.js';
import { SAMPLER_SOUNDS } from './deck-pads.js';

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);
const bank = renderSamplerBank();
const rms = (x, from, to) => Math.sqrt(x.slice(from, to).reduce((s, v) => s + v * v, 0) / (to - from));

test('the bank has exactly the sounds the pads trigger', () => {
  assert.deepEqual([...SAMPLER_NAMES].sort(), [...SAMPLER_SOUNDS].sort());
  SAMPLER_NAMES.forEach((name) => assert.ok(bank[name] instanceof Float32Array));
});

test('every sound is audible, finite and peaks where promised', () => {
  for (const name of SAMPLER_NAMES) {
    const data = bank[name];
    assert.ok(data.every(Number.isFinite), name);
    near(Math.max(...data.map(Math.abs)), SAMPLER_PEAK, 1e-4);
    assert.ok(data.length > 8000, `${name} is too short`);
  }
});

test('tempo-based sounds are a whole number of beats at the reference tempo', () => {
  const beat = (60 / SAMPLER_REFERENCE_BPM) * 32000;
  assert.ok(Math.abs(bank.riser.length - 8 * beat) < 2);
  assert.ok(Math.abs(bank.downlifter.length - 4 * beat) < 2);
});

test('the riser builds and the downlifter falls', () => {
  const r = bank.riser;
  const quarter = Math.floor(r.length / 4);
  assert.ok(rms(r, 3 * quarter, 4 * quarter - 200) > rms(r, 0, quarter) * 4);
  const d = bank.downlifter;
  const q = Math.floor(d.length / 4);
  assert.ok(rms(d, 0, q) > rms(d, 3 * q, 4 * q - 200) * 4);
});

test('the snare roll gets denser and louder', () => {
  const s = bank.snareRoll;
  const beat = Math.round((60 / SAMPLER_REFERENCE_BPM) * 32000);
  assert.ok(rms(s, 3 * beat, 4 * beat) > rms(s, 0, beat));
});
