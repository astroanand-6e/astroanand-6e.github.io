import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_INTERVAL_S, createSession } from './session.js';
import { emit, emitControl } from '../controls.js';
import { createSim } from './testing/sim.js';

function startSession(done = () => false) {
  const sim = createSim();
  const session = createSession({ bus: sim.bus, engine: sim.engine, step: { done }, clock: sim.clock });
  sim.onFrame(session.tick);
  return { sim, session };
}

async function loaded(sim) {
  sim.learner.set('m.load1', true);
  sim.learner.set('m.load1', false);
  await sim.wait(10);
}

test('events are recorded with a step-relative time, the clock time and the state before the engine reacted', async () => {
  const { sim, session } = startSession();
  await loaded(sim);
  sim.advance(0.5);
  sim.learner.press('d1.play');
  sim.advance(0.5);
  sim.learner.press('d1.cue');
  const { events } = session.ctx();
  const play = events.find((event) => event.kind === 'control' && event.id === 'd1.play' && event.value === true);
  const cue = events.find((event) => event.kind === 'control' && event.id === 'd1.cue' && event.value === true);
  assert.ok(play && cue);
  assert.equal(play.at.decks[0].playing, false, 'play was pressed on a stopped deck');
  assert.equal(cue.at.decks[0].playing, true, 'cue was pressed on a playing deck, before the engine paused it');
  assert.ok(cue.t > play.t && cue.abs - play.abs === cue.t - play.t);
  assert.ok(cue.at.decks[0].beat > 0, 'the snapshot has run on with the music');
  assert.equal(sim.engine.getState().decks[0].playing, false, 'the live state moved on');
});

test('engine events are recorded too, and lesson setup moves are not', async () => {
  const { sim, session } = startSession();
  emitControl(sim.bus, 'm.low2', -1, 'lesson');
  emit(sim.bus, 'engine', { type: 'sync', deck: 1 });
  emitControl(sim.bus, 'm.low1', -0.5, 'engine');
  sim.learner.set('m.hi1', 0.3);
  sim.advance(0.1);
  const { events } = session.ctx();
  assert.deepEqual(events.map((event) => event.kind === 'engine' ? event.type : event.id), ['sync', 'm.low1', 'm.hi1']);
  assert.equal(events[1].source, 'engine', 'engine echoes are kept, marked, and ignored by isPlayerEvent');
});

test('samples are taken about every 100 ms and each frame sees the previous one', () => {
  const { sim, session } = startSession();
  const seen = [];
  const stop = sim.onFrame(() => seen.push(session.ctx()));
  sim.advance(1);
  stop();
  const { samples, elapsed, start } = session.ctx();
  assert.ok(samples.length >= 10 && samples.length <= 12, `got ${samples.length} samples`);
  assert.ok(Math.abs(samples[2].t - samples[1].t - SAMPLE_INTERVAL_S) < 0.02);
  assert.ok(Math.abs(elapsed - 1) < 0.02);
  assert.notEqual(seen[5].prev, seen[5].state, 'prev is the previous frame, a separate snapshot');
  assert.equal(seen[5].start, start);
});

test('a stale frame makes events read the engine instead of guessing', async () => {
  const sim = createSim();
  const session = createSession({ bus: sim.bus, engine: sim.engine, step: { done: () => false }, clock: sim.clock });
  await loaded(sim);
  session.tick();
  sim.learner.press('d1.play');
  sim.advance(2);
  sim.learner.set('m.fader1', 0.4);
  const events = session.tick().ctx.events;
  const stale = events.find((event) => event.id === 'm.fader1');
  assert.equal(stale.at.decks[0].playing, true, 'the last frame was 2 s old, so the engine was read directly');
  assert.ok(stale.at.decks[0].beat > 3);
});

test('done() latches: the completion keeps the moment it became true', () => {
  const { sim, session } = startSession((ctx) => ctx.elapsed >= 0.5);
  sim.advance(0.4);
  assert.equal(session.completion(), null);
  sim.learner.set('m.fader2', 0.2);
  sim.advance(0.3);
  const completion = session.completion();
  assert.ok(completion);
  assert.ok(completion.elapsed >= 0.5 && completion.elapsed < 0.55);
  assert.equal(completion.events.length, 1);
  sim.learner.set('m.fader2', 0.9);
  sim.advance(1);
  assert.equal(session.completion(), completion, 'the first completion stays');
  assert.equal(completion.events.length, 1, 'and is not extended by later events');
});

test('dispose stops recording', () => {
  const { sim, session } = startSession();
  session.dispose();
  sim.learner.set('m.fader1', 0.5);
  assert.equal(session.ctx(), null);
  assert.equal(session.tick().ctx.events.length, 0);
});
