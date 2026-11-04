import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEAT_FX_BEATS, CFX_MAX_HIGHPASS_HZ, CFX_MAX_LOWPASS_HZ, CFX_MIN_HIGHPASS_HZ, CFX_MIN_LOWPASS_HZ, cfxSettings, crossfaderGains,
  dbToGain, eqGain, faderGain, fxIncludesChannel, fxReferenceBpm, gainToDb, masterGain, stepBeatFx, trimGain, webAudioQ,
} from './mixer-math.js';

const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);

test('trim maps -1..1 to -12..+12 dB with 0 at unity', () => {
  near(trimGain(0), 1);
  near(gainToDb(trimGain(1)), 12, 1e-6);
  near(gainToDb(trimGain(-1)), -12, 1e-6);
  near(trimGain(3), trimGain(1));
});

test('EQ kill silences the band, flat is unity, +1 boosts 6 dB', () => {
  assert.equal(eqGain(-1), 0);
  near(eqGain(0), 1);
  near(gainToDb(eqGain(1)), 6, 1e-6);
  near(eqGain(-0.5), 0.25);
});

test('EQ is monotonic across its whole range', () => {
  let last = -1;
  for (let v = -1; v <= 1.0001; v += 0.05) {
    const gain = eqGain(v);
    assert.ok(gain >= last, `eqGain not monotonic at ${v}`);
    last = gain;
  }
});

test('channel fader is silent at 0, unity at 1 and monotonic', () => {
  assert.equal(faderGain(0), 0);
  assert.equal(faderGain(1), 1);
  assert.ok(faderGain(0.5) < 0.5);
  assert.ok(faderGain(0.6) > faderGain(0.5));
});

test('crossfader is constant power with full ends', () => {
  const left = crossfaderGains(-1);
  const right = crossfaderGains(1);
  near(left.left, 1); near(left.right, 0, 1e-12);
  near(right.left, 0, 1e-12); near(right.right, 1);
  for (let x = -1; x <= 1.0001; x += 0.1) {
    const { left: l, right: r } = crossfaderGains(x);
    near(l * l + r * r, 1);
  }
  const center = crossfaderGains(0);
  near(center.left, Math.SQRT1_2);
  near(center.right, Math.SQRT1_2);
});

test('master knob is unity at its default and quadratic below', () => {
  near(masterGain(0.8), 1);
  near(masterGain(0.4), 0.25);
  assert.equal(masterGain(0), 0);
  assert.ok(masterGain(1) > 1);
});

test('CFX is bypassed at center, low-pass below zero, high-pass above', () => {
  const off = cfxSettings(0);
  assert.equal(off.active, false);
  near(off.lowpassHz, CFX_MAX_LOWPASS_HZ);
  near(off.highpassHz, CFX_MIN_HIGHPASS_HZ);
  const low = cfxSettings(-1);
  near(low.lowpassHz, CFX_MIN_LOWPASS_HZ, 1e-6);
  near(low.highpassHz, CFX_MIN_HIGHPASS_HZ);
  const high = cfxSettings(1);
  near(high.highpassHz, CFX_MAX_HIGHPASS_HZ, 1e-6);
  near(high.lowpassHz, CFX_MAX_LOWPASS_HZ);
  assert.ok(low.q > off.q);
});

test('CFX sweeps monotonically and ignores a tiny deadzone', () => {
  assert.equal(cfxSettings(0.01).active, false);
  let last = Infinity;
  for (let v = 0; v >= -1.0001; v -= 0.1) {
    const { lowpassHz } = cfxSettings(v);
    assert.ok(lowpassHz <= last);
    last = lowpassHz;
  }
});

test('beat FX length steps through 1/4, 1/2, 3/4, 1, 2 and clamps', () => {
  assert.deepEqual([...BEAT_FX_BEATS], [0.25, 0.5, 0.75, 1, 2]);
  assert.equal(stepBeatFx(3, 1), 4);
  assert.equal(stepBeatFx(4, 1), 4);
  assert.equal(stepBeatFx(0, -1), 0);
  assert.equal(stepBeatFx(3, -1), 2);
});

test('FX channel switch includes the right channels', () => {
  assert.equal(fxIncludesChannel('1', 1), true);
  assert.equal(fxIncludesChannel('1', 2), false);
  assert.equal(fxIncludesChannel('2', 2), true);
  assert.equal(fxIncludesChannel('1&2', 1), true);
  assert.equal(fxIncludesChannel('1&2', 2), true);
});

test('FX reference tempo averages the playing selected decks', () => {
  const decks = [{ playing: true, bpm: 120 }, { playing: true, bpm: 126 }];
  near(fxReferenceBpm('1&2', decks), 123);
  near(fxReferenceBpm('1', decks), 120);
  near(fxReferenceBpm('2', decks), 126);
  assert.equal(fxReferenceBpm('1', [{ playing: false, bpm: 0 }, { playing: false, bpm: 0 }]), 0);
});

test('FX reference tempo falls back to a paused selected deck', () => {
  near(fxReferenceBpm('1&2', [{ playing: false, bpm: 122 }, { playing: true, bpm: 126 }]), 126);
  near(fxReferenceBpm('1', [{ playing: false, bpm: 122 }, { playing: true, bpm: 126 }]), 122);
});

test('dB helpers are inverses', () => {
  near(gainToDb(dbToGain(-7.5)), -7.5, 1e-9);
});

test('lowpass/highpass Q is converted to Web Audio dB, other types stay linear', () => {
  near(webAudioQ('lowpass', Math.SQRT1_2), -3.0103, 1e-3);
  near(webAudioQ('highpass', 1), 0);
  near(webAudioQ('highpass', 1.9), 5.575, 1e-3);
  assert.equal(webAudioQ('allpass', 0.7071), 0.7071);
  assert.equal(webAudioQ('bandpass', 2), 2);
});
