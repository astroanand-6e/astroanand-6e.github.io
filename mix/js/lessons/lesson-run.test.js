/**
 * The lesson run against the contract: what it tells the controller ('focus', 'highlight'),
 * when it clears it, and how it behaves when stuck, paused, restarted or broken.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { on } from '../controls.js';
import { AUTO_ADVANCE_S, HINT_AFTER_S, SKIP_AFTER_S, createLessonRun } from './lesson-run.js';
import { SKIPPED_LINE } from './scoring.js';
import { proceed, settle, startLesson, statusOf } from './testing/harness.js';
import { createSim } from './testing/sim.js';

/** Records every highlight and focus event in order, as the controller would receive them. */
function trace(sim) {
  const log = [];
  on(sim.bus, 'highlight', ({ ids }) => log.push(['highlight', ids]));
  on(sim.bus, 'focus', ({ section }) => log.push(['focus', section]));
  return log;
}

function customLesson(steps, score = () => ({ stars: 2, lines: ['ok'] })) {
  return { id: 'custom', title: 'Custom', steps, score };
}

function runOf(lesson, sim = createSim()) {
  const run = createLessonRun({ bus: sim.bus, engine: sim.engine, lesson, clock: sim.clock, wait: sim.wait });
  sim.onFrame(run.tick);
  return { sim, run, log: trace(sim) };
}

test('arming a step asks for its section, then rings its targets', async () => {
  const { run, log } = runOf(customLesson([{ text: 'Go', targets: ['d2.sync', 'd2.play'], section: 'deck2', done: () => false }]));
  assert.equal(run.view().status, 'idle');
  await run.begin();
  assert.deepEqual(log, [['focus', 'deck2'], ['highlight', ['d2.sync', 'd2.play']]]);
  assert.equal(run.view().status, 'active');
});

test('highlight is cleared the moment a step is done, and re-sent for the next step', async () => {
  const handle = await startLesson('play-and-cue');
  const log = trace(handle.sim);
  handle.learner.press('d1.play');
  await settle(handle, () => statusOf(handle) !== 'active', 'step 1 to finish');
  assert.deepEqual(log[0], ['highlight', []], 'cleared as soon as the step completes');
  await settle(handle, () => handle.run.view().index === 1 && statusOf(handle) === 'active', 'step 2');
  assert.deepEqual(log.slice(-2), [['focus', 'deck1'], ['highlight', ['d1.cue']]]);
});

test('every step of every lesson names a valid section and valid control ids', async () => {
  const { LESSONS } = await import('./curriculum.js');
  const { CONTROL_BY_ID, SECTIONS } = await import('../controls.js');
  for (const lesson of LESSONS) {
    for (const step of lesson.steps) {
      assert.ok(SECTIONS.includes(step.section), `${lesson.id}: section ${step.section}`);
      assert.ok(step.targets.length > 0);
      step.targets.forEach((id) => assert.ok(CONTROL_BY_ID.has(id), `${lesson.id}: unknown control ${id}`));
    }
  }
});

test('the glow is cleared when the lesson finishes, and on dispose', async () => {
  const { run, log, sim } = runOf(customLesson([{ text: 'Go', targets: ['d1.play'], section: 'deck1', done: () => true }]));
  await run.begin();
  sim.advance(0.1);
  await run.advance();
  assert.equal(run.view().status, 'finished');
  assert.deepEqual(log.at(-1), ['highlight', []]);
  assert.deepEqual(run.result(), { stars: 2, lines: ['ok'] });
  log.length = 0;
  run.dispose();
  assert.deepEqual(log, [['highlight', []]]);
});

test('setup runs before the step is armed, and its moves are not counted as the learner', async () => {
  const seen = [];
  const sim = createSim();
  const { run } = runOf(customLesson([{
    text: 'Go',
    targets: ['m.low2'],
    section: 'mixer',
    setup: async (api) => {
      api.set('m.low2', -1);
      await api.wait(500);
      seen.push(api.state().mixer.low[1]);
    },
    done: () => false,
  }]), sim);
  await run.begin();
  sim.advance(0.2);
  assert.deepEqual(seen, [-1]);
  assert.equal(run.view().status, 'active');
  assert.equal(sim.engine.getState().mixer.low[1], -1);
  const recorded = [];
  on(sim.bus, 'control', (detail) => recorded.push(detail.source));
  sim.learner.set('m.low2', 0);
  assert.deepEqual(recorded, ['pointer']);
});

test('the text fills in live numbers once the setup has run', async () => {
  const handle = await startLesson('tempo-and-sync');
  assert.match(handle.run.view().text, /^Deck 1 plays at 124\.0 BPM\. Press PLAY on deck 2: it runs at 120\.0 BPM/);
  assert.ok(!handle.run.view().text.includes('{'));
});

test('a hint appears after about 15 seconds without success, and not before or after success', async () => {
  const handle = await startLesson('play-and-cue');
  handle.sim.advance(HINT_AFTER_S - 1);
  assert.equal(handle.run.view().hint, null);
  handle.sim.advance(2);
  assert.match(handle.run.view().hint, /PLAY button on deck 1/);
  handle.learner.press('d1.play');
  handle.sim.advance(0.1);
  assert.equal(handle.run.view().hint, null, 'no hint once the step is done');
});

test('a hint can read the live state', async () => {
  const handle = await startLesson('nudge-with-the-jog');
  handle.sim.advance(4.5);
  await proceed(handle);
  handle.sim.advance(HINT_AFTER_S + 0.5);
  assert.match(handle.run.view().hint, /Deck 2 is ahead of deck 1.*counter-clockwise/);
});

test('Continue opens on done, and a step can auto-advance after a short pause', async () => {
  const handle = await startLesson('play-and-cue');
  handle.learner.press('d1.play');
  handle.sim.advance(0.1);
  assert.equal(statusOf(handle), 'done');
  assert.equal(handle.run.view().index, 0);
  handle.sim.advance(AUTO_ADVANCE_S - 0.3);
  assert.equal(handle.run.view().index, 0, 'still waiting');
  await settle(handle, () => handle.run.view().index === 1, 'auto-advance');
  assert.equal(handle.run.view().text.startsWith('Let it run'), true);
});

test('a step without auto-advance waits for Continue', async () => {
  const handle = await startLesson('nudge-with-the-jog');
  handle.sim.advance(10);
  assert.equal(statusOf(handle), 'done');
  assert.equal(handle.run.view().index, 0);
  await handle.run.advance();
  assert.equal(handle.run.view().index, 1);
});

test('a step stays done after the learner undoes it', async () => {
  const handle = await startLesson('play-and-cue');
  handle.learner.press('d1.play');
  handle.sim.advance(0.1);
  assert.equal(statusOf(handle), 'done');
  handle.learner.press('d1.play');
  handle.sim.advance(0.5);
  assert.equal(handle.state().decks[0].playing, false);
  assert.equal(statusOf(handle), 'done');
});

test('skipping needs a long wait, then moves on with 1 star at most', async () => {
  const handle = await startLesson('nudge-with-the-jog');
  handle.sim.advance(10);
  await handle.run.advance();
  await handle.run.skip();
  assert.equal(handle.run.view().index, 1, 'too early to skip');
  assert.equal(handle.run.view().canSkip, false);
  handle.sim.advance(SKIP_AFTER_S + 1);
  assert.equal(handle.run.view().canSkip, true);
  await handle.run.skip();
  assert.equal(statusOf(handle), 'finished');
  assert.deepEqual(handle.run.result(), { stars: 1, lines: [SKIPPED_LINE], rows: null });
});

test('restart goes back to step 1, clears the result and runs the setup again', async () => {
  const handle = await startLesson('nudge-with-the-jog');
  handle.sim.advance(10);
  await handle.run.advance();
  handle.learner.set('d2.tempo', 0.9);
  await handle.run.restart();
  assert.equal(handle.run.view().index, 0);
  assert.equal(statusOf(handle), 'active');
  assert.equal(handle.run.result(), null);
  assert.ok(Math.abs(handle.state().decks[1].tempo - 0.9) > 0.01, 'the setup reset the tempo fader');
});

test('pausing for free play clears the glow, stops recording, and resuming re-arms the step', async () => {
  const handle = await startLesson('play-and-cue');
  const log = trace(handle.sim);
  handle.run.pause();
  assert.equal(statusOf(handle), 'paused');
  assert.deepEqual(log, [['highlight', []]]);
  handle.learner.press('d1.play');
  handle.sim.advance(1);
  assert.equal(statusOf(handle), 'paused', 'play in free mode does not complete the step');
  log.length = 0;
  await handle.run.resume();
  assert.equal(statusOf(handle), 'active');
  assert.deepEqual(log, [['focus', 'deck1'], ['highlight', ['d1.play']]]);
  assert.equal(handle.run.view().index, 0);
});

test('a finished step stays finished through free play, and a finished lesson ignores pause', async () => {
  const handle = await startLesson('play-and-cue');
  handle.learner.press('d1.play');
  handle.sim.advance(0.1);
  handle.run.pause();
  assert.equal(statusOf(handle), 'done');
  await handle.run.resume();
  assert.equal(statusOf(handle), 'done');
  await handle.run.advance();
  assert.equal(handle.run.view().index, 1);

  const { run } = runOf(customLesson([{ text: 'Go', targets: ['d1.play'], section: 'deck1', done: () => true }]));
  await run.begin();
  run.tick();
  await run.advance();
  run.pause();
  assert.equal(run.view().status, 'finished');
});

test('a failing setup shows an error and a restart recovers', async () => {
  let attempts = 0;
  const sim = createSim();
  const lesson = customLesson([{
    text: 'Go', targets: ['d1.play'], section: 'deck1', done: () => false,
    setup: () => { attempts += 1; if (attempts === 1) throw new Error('Deck 1 did not load'); },
  }]);
  const { run } = runOf(lesson, sim);
  const errors = console.error;
  console.error = () => {};
  try {
    await run.begin();
  } finally {
    console.error = errors;
  }
  assert.equal(run.view().status, 'error');
  assert.equal(run.view().error, 'Deck 1 did not load');
  await run.restart();
  assert.equal(run.view().status, 'active');
  assert.equal(run.view().error, null);
});

test('a restart during a slow setup drops the stale step instead of arming it twice', async () => {
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = [];
  const lesson = customLesson([{
    text: 'Go', targets: ['d1.play'], section: 'deck1', done: () => false,
    setup: async () => { started.push(started.length + 1); await gate; },
  }]);
  const { run, log } = runOf(lesson);
  const first = run.begin();
  await settled();
  const second = run.restart();
  await settled();
  assert.deepEqual(started, [1, 2], 'both setups are in flight');
  assert.equal(run.view().status, 'busy');
  release();
  await Promise.all([first, second]);
  assert.equal(run.view().status, 'active');
  assert.equal(log.filter(([kind]) => kind === 'highlight').length, 1, 'only the newest step was armed');
  assert.equal(log.filter(([kind]) => kind === 'focus').length, 1);
});

test('the view carries beat dots for timing steps and a progress value for hold steps', async () => {
  const handle = await startLesson('play-and-cue');
  handle.learner.press('d1.play');
  await proceed(handle);
  handle.sim.advance(2);
  handle.learner.press('d1.cue');
  await proceed(handle);
  handle.sim.advance(0.1);
  const view = handle.run.view();
  assert.equal(view.index, 2);
  assert.ok(view.beat && view.beat.beat >= 1 && view.beat.beat <= 4 && view.beat.playing === true);
  assert.match(view.readout, /^Now \d+\.\d {3}Cue 1\.1 {3}Target 17\.1$/);
  assert.equal(view.progress, null);
  assert.equal(view.count, 3);
  assert.equal(view.isLast, true);
});
