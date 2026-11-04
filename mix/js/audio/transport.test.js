import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TAU, bendAt, bendTo, createTransport, glideRate, hasEnded, pause, play, positionAt, rateAt, seek, setLoop,
} from './transport.js';
import { makeLoop } from './grid.js';

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);

/** Reference integrator for a segment's rate function. */
function integrate(base, bend, tau, from, to, steps = 200000) {
  const dt = (to - from) / steps;
  let position = 0;
  for (let i = 0; i < steps; i += 1) {
    const t = from + (i + 0.5) * dt;
    position += base * (1 + bend * Math.exp(-(t - from) / tau)) * dt;
  }
  return position;
}

test('a paused transport stays put', () => {
  const t = createTransport({ duration: 100, position: 12 });
  near(positionAt(t, 50), 12);
  near(rateAt(t, 50), 0);
});

test('play advances at the base rate', () => {
  const t = play(createTransport({ duration: 100, position: 10 }), 5);
  near(positionAt(t, 5), 10);
  near(positionAt(t, 9), 14);
});

test('pause freezes the position at the pause time', () => {
  const playing = play(createTransport({ duration: 100 }), 0);
  const paused = pause(playing, 3);
  near(positionAt(paused, 3), 3);
  near(positionAt(paused, 30), 3);
});

test('base rate scales the motion and glide keeps the instantaneous rate continuous', () => {
  const start = play(createTransport({ duration: 1000 }), 0);
  const faster = glideRate(start, 10, 1.08, 0.03);
  near(rateAt(faster, 10), 1, 1e-9);
  near(rateAt(faster, 10 + 1), 1.08, 1e-3);
  near(positionAt(faster, 10), 10, 1e-9);
});

test('position under a decaying bend matches numerical integration', () => {
  const base = play(createTransport({ duration: 1000, position: 20 }), 2);
  const bent = bendTo({ ...base, base: 1.04 }, 2, 0.1, 0.18);
  const expected = 20 + integrate(1.04, 0.1, 0.18, 2, 4.5);
  near(positionAt(bent, 4.5), expected, 1e-4);
});

test('bend decays toward zero and the rate returns to base', () => {
  const t = bendTo(play(createTransport({ duration: 100 }), 0), 1, 0.2, 0.1);
  near(bendAt(t, 1), 0.2);
  assert.ok(bendAt(t, 2) < 1e-4);
  near(rateAt(t, 5), 1, 1e-6);
});

test('position is continuous across a segment change', () => {
  let t = play(createTransport({ duration: 1000 }), 0);
  t = bendTo(t, 1, 0.15, DEFAULT_TAU);
  const before = positionAt(t, 1.5);
  t = glideRate(t, 1.5, 1.05, 0.03);
  near(positionAt(t, 1.5), before, 1e-9);
  const later = bendTo(t, 2, -0.1, DEFAULT_TAU);
  near(positionAt(later, 2), positionAt(t, 2), 1e-9);
});

test('querying just before a scheduled change still sees the old motion', () => {
  const t0 = play(createTransport({ duration: 1000 }), 0);
  const t1 = glideRate(t0, 10.01, 1.08, 0.03);
  near(positionAt(t1, 10.005), 10.005, 1e-9);
  near(positionAt(t1, 10.01), 10.01, 1e-9);
});

test('seek moves the position and keeps playing', () => {
  const t = seek(play(createTransport({ duration: 100 }), 0), 2, 50);
  near(positionAt(t, 2), 50);
  near(positionAt(t, 3), 51);
  near(positionAt(seek(t, 3, 500), 3), 100);
  near(positionAt(seek(t, 3, -5), 3), 0);
});

test('a loop wraps the playhead seamlessly and keeps wrapping', () => {
  const loop = makeLoop(8, 10, 120);
  let t = play(createTransport({ duration: 100, position: 8 }), 0);
  t = setLoop(t, 0, loop);
  near(positionAt(t, 1.5), 9.5);
  near(positionAt(t, 2.25), 8.25);
  near(positionAt(t, 100.5), 8.5);
});

test('engaging a loop pulls the playhead inside it', () => {
  const loop = makeLoop(8, 10, 120);
  const ahead = setLoop(play(createTransport({ duration: 100, position: 12.5 }), 0), 0, loop);
  near(positionAt(ahead, 0), 8.5);
  const behind = setLoop(play(createTransport({ duration: 100, position: 7 }), 0), 0, loop);
  near(positionAt(behind, 0), 8);
});

test('clearing a loop lets the playhead run on from where it is', () => {
  const loop = makeLoop(8, 10, 120);
  let t = setLoop(play(createTransport({ duration: 100, position: 8 }), 0), 0, loop);
  t = setLoop(t, 2.5, null);
  near(positionAt(t, 2.5), 8.5);
  near(positionAt(t, 4.5), 10.5);
});

test('playback stops at the end of the track', () => {
  const t = play(createTransport({ duration: 10, position: 8 }), 0);
  assert.equal(hasEnded(t, 1), false);
  assert.equal(hasEnded(t, 2), true);
  near(positionAt(t, 5), 10);
});

test('a looping transport never ends', () => {
  const t = setLoop(play(createTransport({ duration: 10, position: 8 }), 0), 0, makeLoop(8, 9, 120));
  assert.equal(hasEnded(t, 1000), false);
});

test('segments are immutable', () => {
  const t = createTransport({ duration: 10 });
  assert.throws(() => { 'use strict'; t.p0 = 5; }, TypeError);
  const p = play(t, 1);
  assert.notEqual(p, t);
  assert.equal(t.playing, false);
});
