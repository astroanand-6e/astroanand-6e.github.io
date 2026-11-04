import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_LOOP_BEATS, MAX_LOOP_BEATS, MIN_LOOP_BEATS, SYNC_RATE_LIMIT, alignedPosition, autoLoop, barOf, beatJumpTarget,
  beatPhase, beatsToSeconds, doubleLoop, halveLoop, isInsideLoop, makeLoop, manualLoop, mod, phaseOffset, phraseBeatOf,
  quantizeBeat, rateToTempo, secondsToBeats, shiftLoop, snapToBeat, syncedRate, tempoToRate, wrapIntoLoop, wrapPhase,
} from './grid.js';

const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);

test('beats and seconds convert both ways at 120 BPM', () => {
  near(beatsToSeconds(4, 120), 2);
  near(secondsToBeats(2, 120), 4);
  near(secondsToBeats(beatsToSeconds(37.25, 123.4), 123.4), 37.25);
});

test('bar numbers are 1-based and phrase beat wraps every 32 beats', () => {
  assert.equal(barOf(0), 1);
  assert.equal(barOf(3.99), 1);
  assert.equal(barOf(4), 2);
  assert.equal(barOf(64 * 4 - 0.01), 64);
  near(phraseBeatOf(32), 0);
  near(phraseBeatOf(33.5), 1.5);
  near(phraseBeatOf(31.75), 31.75);
});

test('mod keeps negative values positive', () => {
  near(mod(-0.25, 1), 0.75);
  near(mod(5.5, 4), 1.5);
});

test('wrapPhase folds any offset into [-0.5, 0.5)', () => {
  near(wrapPhase(0.2), 0.2);
  near(wrapPhase(0.7), -0.3);
  near(wrapPhase(-0.7), 0.3);
  near(wrapPhase(1.25), 0.25);
  near(wrapPhase(0.5), -0.5);
  near(wrapPhase(-0.5), -0.5);
});

test('phaseOffset is deck B minus deck A on the beat grid', () => {
  near(phaseOffset(10.0, 20.0), 0);
  near(phaseOffset(10.0, 20.25), 0.25);
  near(phaseOffset(10.25, 20.0), -0.25);
  near(phaseOffset(10.9, 20.1), 0.2);
  near(beatPhase(7.75), 0.75);
});

test('quantizeBeat rounds to the nearest division', () => {
  near(quantizeBeat(4.4), 4);
  near(quantizeBeat(4.6), 5);
  near(quantizeBeat(4.4, 4), 4.5);
});

test('snapToBeat snaps only inside the window', () => {
  const bpm = 120; // beat = 0.5 s
  near(snapToBeat(1.02, bpm, 0.06), 1);
  near(snapToBeat(0.97, bpm, 0.06), 1);
  near(snapToBeat(1.2, bpm, 0.06), 1.2);
});

test('tempo fader maps +-1 to +-8% and round-trips', () => {
  near(tempoToRate(0), 1);
  near(tempoToRate(1), 1.08);
  near(tempoToRate(-1), 0.92);
  near(tempoToRate(5), 1.08);
  near(rateToTempo(1.04), 0.5);
  near(rateToTempo(2), 1);
});

test('syncedRate matches the leader and respects the limit', () => {
  near(syncedRate(120, 126), 1.05);
  near(syncedRate(126, 120), 120 / 126);
  near(syncedRate(120, 200), 1 + SYNC_RATE_LIMIT);
  near(syncedRate(120, 60), 1 - SYNC_RATE_LIMIT);
});

test('alignedPosition puts the follower on the leader beat phase', () => {
  const follower = { position: 10.1, bpm: 120 }; // beat 20.2
  const leader = { position: 20.0, bpm: 120 }; // beat 40.0 -> phase 0
  const aligned = alignedPosition(follower, leader);
  near(secondsToBeats(aligned, 120) % 1, 0, 1e-9);
  assert.ok(Math.abs(aligned - follower.position) <= 0.25 + 1e-9);
});

test('alignedPosition works across different track tempos', () => {
  const follower = { position: 33.3, bpm: 126 };
  const leader = { position: 47.7, bpm: 122 };
  const aligned = alignedPosition(follower, leader);
  const phaseGap = Math.abs(wrapPhase(beatPhase(secondsToBeats(aligned, 126)) - beatPhase(secondsToBeats(leader.position, 122))));
  near(phaseGap, 0, 1e-9);
});

test('autoLoop is four beats long and starts on the nearest beat', () => {
  const loop = autoLoop(10.12, 120); // beat 20.24 -> 20
  near(loop.start, 10);
  near(loop.end, 12);
  near(loop.beats, AUTO_LOOP_BEATS);
});

test('manualLoop snaps both points and keeps a minimum length', () => {
  const loop = manualLoop(10.03, 11.98, 120);
  near(loop.start, 10);
  near(loop.end, 12);
  const tiny = manualLoop(10, 10.001, 120);
  near(tiny.beats, MIN_LOOP_BEATS);
});

test('halveLoop halves from the start and stops at the minimum', () => {
  const loop = makeLoop(8, 10, 120);
  const half = halveLoop(loop, 120);
  near(half.end, 9);
  near(half.beats, 2);
  let small = loop;
  for (let i = 0; i < 20; i += 1) small = halveLoop(small, 120);
  near(small.beats, MIN_LOOP_BEATS);
});

test('doubleLoop doubles from the start and respects track end and max length', () => {
  const loop = makeLoop(8, 10, 120);
  near(doubleLoop(loop, 120, 100).end, 12);
  assert.equal(doubleLoop(loop, 120, 11), loop);
  const huge = makeLoop(0, MAX_LOOP_BEATS / 2 * 0.5, 120);
  assert.equal(doubleLoop(huge, 120, 1e6).beats, MAX_LOOP_BEATS);
  assert.equal(doubleLoop(doubleLoop(huge, 120, 1e6), 120, 1e6).beats, MAX_LOOP_BEATS);
});

test('wrapIntoLoop folds positions past the end back inside', () => {
  const loop = makeLoop(8, 10, 120);
  near(wrapIntoLoop(9.5, loop), 9.5);
  near(wrapIntoLoop(10.25, loop), 8.25);
  near(wrapIntoLoop(15.9, loop), 9.9);
  near(wrapIntoLoop(7, loop), 7);
  near(wrapIntoLoop(12, null), 12);
});

test('isInsideLoop treats the end as exclusive', () => {
  const loop = makeLoop(8, 10, 120);
  assert.equal(isInsideLoop(8, loop), true);
  assert.equal(isInsideLoop(10, loop), false);
  assert.equal(isInsideLoop(5, null), false);
});

test('shiftLoop keeps the length', () => {
  const shifted = shiftLoop(makeLoop(8, 10, 120), 2, 120);
  near(shifted.start, 10);
  near(shifted.end, 12);
  near(shifted.beats, 4);
});

test('beatJumpTarget moves by beats and clamps to the track', () => {
  near(beatJumpTarget(10, 8, 120, 100), 14);
  near(beatJumpTarget(10, -8, 120, 100), 6);
  near(beatJumpTarget(1, -8, 120, 100), 0);
  near(beatJumpTarget(99, 8, 120, 100), 100);
});
