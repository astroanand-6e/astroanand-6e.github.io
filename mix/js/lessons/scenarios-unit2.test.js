/**
 * Plays levels 4 to 6 (faders and crossfader, EQ, the filter) against the simulated engine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { proceed, startLesson, statusOf } from './testing/harness.js';

const BEAT_SECONDS_124 = 60 / 124;

async function blendThenCrossfade(handle, crossfadeSeconds) {
  const { learner, sim } = handle;
  learner.drag('m.fader2', 0, 0.6, 1);
  sim.advance(1.2);
  await proceed(handle);
  learner.drag('m.xfader', 0, 1, crossfadeSeconds);
  await proceed(handle);
  learner.drag('m.xfader', 1, 0, 1);
  await proceed(handle);
}

test('level 4: raising channel 2 halfway, then a slow crossfade, earns 3 stars', async () => {
  const handle = await startLesson('faders-and-crossfader');
  assert.deepEqual(handle.traffic.highlights.at(-1), ['m.fader2']);
  assert.equal(handle.traffic.focuses.at(-1), 'mixer');
  await blendThenCrossfade(handle, 4);
  assert.equal(statusOf(handle), 'finished');
  const result = handle.run.result();
  assert.equal(result.stars, 3);
  assert.match(result.lines[0], /crossfade took 3\.\d s \(\d+(\.\d)? beats\)/);
  assert.match(result.lines[1], /60% under deck 1/);
});

test('level 4: a 2.5 second slide earns 2 stars and a quick cut earns 1', async () => {
  const medium = await startLesson('faders-and-crossfader');
  await blendThenCrossfade(medium, 2.5);
  assert.equal(medium.run.result().stars, 2);

  const quick = await startLesson('faders-and-crossfader');
  await blendThenCrossfade(quick, 0.2);
  const result = quick.run.result();
  assert.equal(result.stars, 1);
  assert.match(result.lines[1], /4 seconds or more/);
});

test('level 4: a fader pushed to full, or left too low, does not finish step 1', async () => {
  const handle = await startLesson('faders-and-crossfader');
  handle.learner.drag('m.fader2', 0, 1, 0.5);
  handle.sim.advance(3);
  assert.equal(statusOf(handle), 'active', 'full is louder than deck 1, not under it');
  handle.learner.drag('m.fader2', 1, 0.2, 0.5);
  handle.sim.advance(3);
  assert.equal(statusOf(handle), 'active', 'barely open is not blended in');
  handle.learner.set('m.fader2', 0.5);
  handle.sim.advance(1.2);
  assert.equal(statusOf(handle), 'done');
});

async function eqRun(handle, restoreAfterBeats) {
  const { learner, sim } = handle;
  learner.drag('m.hi2', 0, -1, 0.3);
  learner.drag('m.hi2', -1, 0, 0.3);
  await proceed(handle);
  learner.drag('m.low2', 0, -1, 0.4);
  await proceed(handle);
  learner.untilBar(1);
  sim.advance(restoreAfterBeats * BEAT_SECONDS_124);
  learner.set('m.low2', 0);
  await proceed(handle);
}

test('level 5: cutting HI, killing LOW and restoring it on the downbeat earns 3 stars', async () => {
  const handle = await startLesson('eq');
  assert.deepEqual(handle.traffic.highlights.at(-1), ['m.hi2']);
  await eqRun(handle, 0);
  assert.equal(statusOf(handle), 'finished');
  const result = handle.run.result();
  assert.equal(result.stars, 3);
  assert.match(result.lines[0], /right on the downbeat|beats? (after|before) the downbeat/);
});

test('level 5: restoring 0.4 beats late earns 2 stars, 1.9 beats away earns 1', async () => {
  const close = await startLesson('eq');
  await eqRun(close, 0.4);
  assert.equal(close.run.result().stars, 2);
  assert.match(close.run.result().lines[1], /earlier/);

  const far = await startLesson('eq');
  await eqRun(far, 1.9);
  const result = far.run.result();
  assert.equal(result.stars, 1);
  assert.match(result.lines[0], /after the downbeat/);
});

test('level 5: step 3 needs the bass cut first, so restoring an uncut knob does nothing', async () => {
  const handle = await startLesson('eq');
  const { learner, sim } = handle;
  learner.drag('m.hi2', 0, -1, 0.3);
  learner.drag('m.hi2', -1, 0, 0.3);
  await proceed(handle);
  learner.drag('m.low2', 0, -1, 0.4);
  await proceed(handle);
  assert.equal(handle.state().mixer.low[1], -1, 'step 3 starts with the bass cut');
  sim.advance(3);
  assert.equal(statusOf(handle), 'active');
});

async function filterRun(handle, { startPhrase, sweepBeats }) {
  const { learner } = handle;
  learner.drag('m.cfx1', 0, -1, 0.5);
  learner.drag('m.cfx1', -1, 0, 0.5);
  await proceed(handle);
  if (startPhrase !== null) learner.untilPhrase(0, startPhrase);
  learner.drag('m.cfx1', 0, 0.9, sweepBeats * BEAT_SECONDS_124);
  learner.set('m.cfx1', 0);
  await proceed(handle);
}

test('level 6: a 16 beat sweep that lets go on the phrase start earns 3 stars', async () => {
  const handle = await startLesson('the-filter');
  await filterRun(handle, { startPhrase: 16, sweepBeats: 16 });
  assert.equal(statusOf(handle), 'finished');
  const result = handle.run.result();
  assert.equal(result.stars, 3);
  assert.match(result.lines[0], /phrase start/);
  assert.match(result.lines[0], /phrase start/);
  assert.match(result.lines[1], /stayed on for 1[3-6](\.\d)? beats/);
});

test('level 6: landing on the phrase with a short sweep earns 2, missing the phrase earns 1', async () => {
  const short = await startLesson('the-filter');
  await filterRun(short, { startPhrase: 24, sweepBeats: 8 });
  assert.equal(short.run.result().stars, 2);

  const missed = await startLesson('the-filter');
  await filterRun(missed, { startPhrase: null, sweepBeats: 10 });
  const result = missed.run.result();
  assert.equal(result.stars, 1);
  assert.match(result.lines[0], /before the phrase start/);
});

test('level 6: the sweep readout shows the phrase counter and the sweep length', async () => {
  const handle = await startLesson('the-filter');
  const { learner } = handle;
  learner.drag('m.cfx1', 0, -1, 0.5);
  learner.drag('m.cfx1', -1, 0, 0.5);
  await proceed(handle);
  assert.match(handle.run.view().readout, /Phrase beat \d+ \/ 32 {3}Sweep 0\.0 beats/);
  learner.drag('m.cfx1', 0, 0.5, 2);
  assert.match(handle.run.view().readout, /Sweep [3-5]\.\d beats/);
  assert.deepEqual(handle.traffic.highlights.at(-1), ['m.cfx1']);
});
