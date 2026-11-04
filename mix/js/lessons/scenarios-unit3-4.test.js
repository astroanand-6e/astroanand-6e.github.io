/**
 * Plays levels 7 to 9 (hot cues, loops, the bass swap) against the simulated engine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { proceed, startLesson, statusOf } from './testing/harness.js';

const BEAT_SECONDS_124 = 60 / 124;

/** Presses a pad `late` beats after a beat boundary. */
function tap(handle, id, late) {
  handle.learner.untilNextBeat(0);
  handle.sim.advance(late * BEAT_SECONDS_124);
  handle.learner.press(id);
}

async function hotCueRun(handle, late) {
  handle.learner.press('d1.mode.hotcue');
  await proceed(handle);
  tap(handle, 'd1.pad1', late);
  await proceed(handle);
  handle.sim.advance(5 * BEAT_SECONDS_124);
  tap(handle, 'd1.pad2', late);
  await proceed(handle);
  ['d1.pad1', 'd1.pad2', 'd1.pad1'].forEach((pad) => tap(handle, pad, late));
  await proceed(handle);
}

test('level 7: hot cues set and jumped on the beat earn 3 stars', async () => {
  const handle = await startLesson('hot-cues');
  assert.equal(handle.state().decks[0].padMode, 'padfx', 'the level starts in another pad mode');
  await hotCueRun(handle, 0);
  assert.equal(statusOf(handle), 'finished');
  const result = handle.run.result();
  assert.equal(result.stars, 3);
  assert.match(result.lines[0], /from the beat on average/);
});

test('level 7: presses 0.2 beats late earn 2 stars, 0.45 beats late earn 1', async () => {
  const close = await startLesson('hot-cues');
  await hotCueRun(close, 0.2);
  assert.equal(close.run.result().stars, 2);

  const loose = await startLesson('hot-cues');
  await hotCueRun(loose, 0.45);
  const result = loose.run.result();
  assert.equal(result.stars, 1);
  assert.match(result.lines[1], /beat dot/);
});

test('level 7: a second hot cue within a bar of the first does not finish step 3', async () => {
  const handle = await startLesson('hot-cues');
  handle.learner.press('d1.mode.hotcue');
  await proceed(handle);
  tap(handle, 'd1.pad1', 0);
  await proceed(handle);
  tap(handle, 'd1.pad2', 0);
  handle.sim.advance(2);
  assert.equal(statusOf(handle), 'active');
  assert.match(handle.run.view().text, /Let the track run/);
});

test('level 7: pads pressed outside HOT CUE mode set nothing and the step waits', async () => {
  const handle = await startLesson('hot-cues');
  handle.learner.press('d1.pad1');
  handle.sim.advance(1);
  assert.equal(handle.state().decks[0].hotCues[0], null);
  assert.equal(statusOf(handle), 'active');
});

async function loopRun(handle, { exitAfterRestartBeats, startAtPhrase }) {
  const { learner, sim } = handle;
  if (startAtPhrase) learner.untilPhrase(0, 0);
  learner.press('d1.loop.exit');
  await proceed(handle);
  learner.press('d1.loop.half');
  await proceed(handle);
  learner.press('d1.loop.double');
  learner.press('d1.loop.double');
  await proceed(handle);
  learner.untilLoopWrap(0);
  sim.advance(exitAfterRestartBeats * BEAT_SECONDS_124);
  learner.press('d1.loop.exit');
  await proceed(handle);
}

test('level 8: a loop on the phrase, resized and exited at the restart, earns 3 stars', async () => {
  const handle = await startLesson('loops');
  await loopRun(handle, { exitAfterRestartBeats: 0, startAtPhrase: true });
  assert.equal(statusOf(handle), 'finished');
  const result = handle.run.result();
  assert.equal(result.stars, 3);
  assert.match(result.lines[0], /exited (right on|0\.\d beats after) the loop restart/);
  assert.match(result.lines[1], /started (right on|0\.\d beats (after|before)) the phrase start/);
  assert.equal(handle.state().decks[0].loop, null);
});

test('level 8: an exit 0.8 beats after the restart earns 2, a mid-loop exit earns 1', async () => {
  const near = await startLesson('loops');
  await loopRun(near, { exitAfterRestartBeats: 0.8, startAtPhrase: true });
  assert.equal(near.run.result().stars, 2);

  const mid = await startLesson('loops');
  await loopRun(mid, { exitAfterRestartBeats: 4, startAtPhrase: true });
  assert.equal(mid.run.result().stars, 1);
});

test('level 8: a loop started far from the phrase caps the level at 2 stars', async () => {
  const handle = await startLesson('loops');
  await loopRun(handle, { exitAfterRestartBeats: 0, startAtPhrase: false });
  const result = handle.run.result();
  assert.equal(result.stars, 2);
  assert.match(result.lines[1], /16 beats after the phrase start/);
});

test('level 8: each loop step carries on from the loop the learner made', async () => {
  const handle = await startLesson('loops');
  handle.learner.press('d1.loop.exit');
  assert.equal(handle.state().decks[0].loop.beats, 4);
  await proceed(handle);
  assert.match(handle.run.view().text, /1\/2X/);
  assert.equal(handle.state().decks[0].loop.beats, 4, 'step 2 keeps the 4 beat loop');
  assert.deepEqual(handle.traffic.highlights.at(-1), ['d1.loop.half']);
});

async function swapRun(handle, { firstAfter, secondAfter }) {
  const { learner, sim } = handle;
  learner.drag('m.fader2', 0, 1, 1);
  await proceed(handle);
  learner.untilPhrase(1, 0);
  sim.advance(firstAfter * BEAT_SECONDS_124);
  learner.set('m.low1', -1);
  sim.advance((secondAfter - firstAfter) * BEAT_SECONDS_124);
  learner.set('m.low2', 0);
  await proceed(handle);
  learner.drag('m.fader1', 1, 0, 1);
  await proceed(handle);
}

test('level 9: a swap on the phrase with a tight handover earns 3 stars and a full breakdown', async () => {
  const handle = await startLesson('the-bass-swap');
  assert.equal(handle.state().mixer.low[1], -1, 'deck 2 starts with its bass cut');
  assert.equal(handle.state().decks[1].synced, true);
  await swapRun(handle, { firstAfter: 0, secondAfter: 0.3 });
  assert.equal(statusOf(handle), 'finished');
  const result = handle.run.result();
  assert.equal(result.stars, 3);
  assert.match(result.lines[0], /Swap landed/);
  assert.match(result.lines[1], /Phase held within \d+ ms over \d+ s of overlap/);
  assert.equal(result.rows.length, 4);
  assert.ok(result.rows.every((row) => row.ok));
});

test('level 9: a swap about a beat off the phrase earns 2 stars', async () => {
  const handle = await startLesson('the-bass-swap');
  await swapRun(handle, { firstAfter: 0.2, secondAfter: 1.4 });
  const result = handle.run.result();
  assert.equal(result.stars, 2);
  assert.equal(result.rows[0].ok, true);
});

test('level 9: a late, loose swap still completes the level with 1 star', async () => {
  const handle = await startLesson('the-bass-swap');
  await swapRun(handle, { firstAfter: 3, secondAfter: 9 });
  const result = handle.run.result();
  assert.equal(result.stars, 1);
  assert.equal(result.rows[0].ok, false);
  assert.equal(result.rows[1].ok, false);
});

test('level 9: both knobs must move, and deck 1 must go out, before the level ends', async () => {
  const handle = await startLesson('the-bass-swap');
  handle.learner.drag('m.fader2', 0, 1, 1);
  await proceed(handle);
  handle.learner.set('m.low1', -1);
  handle.sim.advance(2);
  assert.equal(statusOf(handle), 'active', 'cutting deck 1 alone is not a swap');
  handle.learner.set('m.low2', 0);
  await proceed(handle);
  handle.sim.advance(2);
  assert.equal(statusOf(handle), 'active', 'the finish step waits until deck 1 is out');
});
