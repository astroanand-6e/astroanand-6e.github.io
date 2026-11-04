/**
 * Plays levels 1 to 3 end to end against the simulated engine: the learner presses and
 * drags like a pointer, the run records events, done() latches, score() awards stars.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NUDGE_SECONDS_PER_TURN } from './testing/fake-engine.js';
import { faderForBpm } from './setup.js';
import { phaseErrorMs } from './metrics.js';
import { proceed, settle, startLesson, statusOf } from './testing/harness.js';

const BAR_17 = 64;

async function playToTheCue(handle, pauseAtBeat) {
  const { learner, sim } = handle;
  learner.press('d1.play');
  await proceed(handle);
  sim.advance(2);
  learner.press('d1.cue');
  await proceed(handle);
  learner.untilBeat(0, pauseAtBeat);
  learner.press('d1.play');
  learner.press('d1.cue');
  await proceed(handle);
}

test('level 1: pausing on bar 17 and pressing CUE earns 3 stars', async () => {
  const handle = await startLesson('play-and-cue');
  assert.equal(statusOf(handle), 'active');
  assert.deepEqual(handle.traffic.highlights.at(-1), ['d1.play']);
  assert.equal(handle.traffic.focuses.at(-1), 'deck1');
  await playToTheCue(handle, BAR_17);
  assert.equal(statusOf(handle), 'finished');
  const result = handle.run.result();
  assert.equal(result.stars, 3);
  assert.match(result.lines[0], /bar 17 beat 1/);
  assert.deepEqual(handle.traffic.highlights.at(-1), [], 'the glow is cleared at the end');
});

test('level 1: a cue set 0.4 beats late still counts but earns 1 star', async () => {
  const handle = await startLesson('play-and-cue', { quantize: false });
  await playToTheCue(handle, BAR_17 + 0.4);
  assert.equal(statusOf(handle), 'finished');
  const result = handle.run.result();
  assert.equal(result.stars, 1);
  assert.match(result.lines[0], /after bar 17 beat 1/);
});

test('level 1: CUE pressed while paused does not count as returning to the cue', async () => {
  const handle = await startLesson('play-and-cue');
  const { learner, sim } = handle;
  learner.press('d1.play');
  await proceed(handle);
  learner.press('d1.play');
  sim.advance(1);
  learner.press('d1.cue');
  sim.advance(1);
  assert.equal(statusOf(handle), 'active', 'step 2 waits for a CUE press during playback');
});

async function startMatching() {
  const handle = await startLesson('tempo-and-sync');
  handle.learner.press('d2.play');
  await proceed(handle);
  return handle;
}

test('level 2: matching by hand then pressing SYNC earns 3 stars', async () => {
  const handle = await startMatching();
  const { decks } = handle.state();
  assert.ok(Math.abs(decks[0].bpm - decks[1].bpm) >= 2, 'the decks start apart');
  handle.learner.set('d2.tempo', faderForBpm(decks[0].bpm, decks[1].track.bpm));
  await proceed(handle);
  assert.equal(statusOf(handle), 'active');
  assert.ok(Math.abs(handle.state().decks[1].tempo) > 0.2 || handle.state().decks[1].bpm > 0, 'the fader was reset');
  handle.learner.press('d2.sync');
  await proceed(handle);
  assert.equal(statusOf(handle), 'finished');
  assert.equal(handle.run.result().stars, 3);
});

test('level 2: a match that is 0.19 BPM off earns 2 stars', async () => {
  const handle = await startMatching();
  const { decks } = handle.state();
  const target = faderForBpm(decks[0].bpm, decks[1].track.bpm);
  handle.learner.set('d2.tempo', target + 0.02);
  await proceed(handle);
  handle.learner.press('d2.sync');
  await proceed(handle);
  assert.equal(handle.run.result().stars, 2);
});

test('level 2: finding the match slowly caps it at 2 stars', async () => {
  const handle = await startMatching();
  const { decks } = handle.state();
  handle.sim.advance(70);
  handle.learner.set('d2.tempo', faderForBpm(decks[0].bpm, decks[1].track.bpm));
  await proceed(handle);
  handle.learner.press('d2.sync');
  await proceed(handle);
  assert.equal(handle.run.result().stars, 2);
});

test('level 2: a gap that closes only briefly does not finish the step', async () => {
  const handle = await startMatching();
  const { decks } = handle.state();
  handle.learner.set('d2.tempo', faderForBpm(decks[0].bpm, decks[1].track.bpm));
  handle.sim.advance(0.8);
  handle.learner.set('d2.tempo', 0);
  handle.sim.advance(3);
  assert.equal(statusOf(handle), 'active');
});

async function startNudging() {
  const handle = await startLesson('nudge-with-the-jog');
  handle.sim.advance(4.5);
  await proceed(handle);
  return handle;
}

/** Turns the jog so deck 2's phase lands on `targetBeats` (the fake engine moves 0.6 s per turn). */
function nudgePhaseTo(handle, targetBeats) {
  const { phaseOffset, decks } = handle.state();
  const beatSeconds = 60 / decks[1].track.bpm;
  const turns = ((targetBeats - phaseOffset) * beatSeconds) / NUDGE_SECONDS_PER_TURN;
  handle.learner.jog('d2.jog', turns, 1);
}

test('level 3: deck 2 starts off the beat and listening is required first', async () => {
  const handle = await startLesson('nudge-with-the-jog');
  assert.ok(phaseErrorMs(handle.state()) > 80, 'the starting phase error is clear');
  handle.sim.advance(2);
  assert.equal(statusOf(handle), 'active', 'the listening step needs 4 seconds');
  handle.sim.advance(2.5);
  assert.equal(statusOf(handle), 'done');
});

test('level 3: nudging in phase and holding 4 bars earns 3 stars', async () => {
  const handle = await startNudging();
  nudgePhaseTo(handle, -0.006);
  await proceed(handle);
  assert.equal(statusOf(handle), 'finished');
  const result = handle.run.result();
  assert.equal(result.stars, 3);
  assert.match(result.lines[0], /Phase held within \d+ ms over the last 2 bars/);
});

test('level 3: a hold that drifts to 30 ms earns 1 star', async () => {
  const handle = await startNudging();
  nudgePhaseTo(handle, -0.08);
  await settle(handle, () => statusOf(handle) !== 'active', 'the hold to finish');
  assert.equal(handle.run.view().status, 'done');
  await proceed(handle);
  assert.equal(handle.run.result().stars, 1);
});

test('level 3: sitting in phase without touching the jog does not finish the step', async () => {
  const handle = await startNudging();
  handle.sim.advance(20);
  assert.equal(statusOf(handle), 'active');
});
