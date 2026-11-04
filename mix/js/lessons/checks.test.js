import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findExcursion, holdSeconds, isPlayerEvent, jogTurns, lastCrossing, playerEvents, pressed, runBeats, runSeconds,
  tailByBeats, trailingRun, transitSeconds, valuesOf,
} from './checks.js';
import { control, ctxOf, deckAt, press, sample, samplesBetween, stateOf, withDeck } from './testing/kit.js';

const engineEvent = (type, t = 0) => ({ kind: 'engine', type, deck: 0, t, abs: 1000 + t, at: stateOf() });

test('only the learner counts: lesson setup moves and engine echoes are ignored', () => {
  assert.equal(isPlayerEvent(control('d1.play', true)), true);
  assert.equal(isPlayerEvent(control('d1.play', true, 0, { source: 'keyboard' })), true);
  assert.equal(isPlayerEvent(control('d1.play', true, 0, { source: 'lesson' })), false);
  assert.equal(isPlayerEvent(control('d1.play', true, 0, { source: 'engine' })), false);
  assert.equal(isPlayerEvent(engineEvent('play')), false);
});

test('pressed, valuesOf and playerEvents read one control', () => {
  const ctx = ctxOf({
    events: [
      press('d1.cue', 1), control('d1.cue', false, 1.1), control('m.low2', -0.4, 2), control('m.low2', -1, 2.1),
      control('d1.play', true, 3, { source: 'lesson' }), engineEvent('cue', 1),
    ],
  });
  assert.equal(pressed(ctx, 'd1.cue'), true);
  assert.equal(pressed(ctx, 'd1.play'), false, 'a lesson press is not the learner');
  assert.deepEqual(valuesOf(ctx, 'm.low2'), [-0.4, -1]);
  assert.equal(playerEvents(ctx, 'd1.cue').length, 2);
});

test('jogTurns adds up travel in both directions and ignores other controls', () => {
  const ctx = ctxOf({
    events: [
      control('d2.jog', { delta: 0.02, touch: false }), control('d2.jog', { delta: -0.03, touch: false }),
      control('d1.jog', { delta: 0.5, touch: false }), control('d2.jog', { touch: true }),
    ],
  });
  assert.ok(Math.abs(jogTurns(ctx, 'd2.jog') - 0.05) < 1e-9);
  assert.equal(jogTurns(ctxOf(), 'd2.jog'), 0);
});

test('trailingRun is the newest unbroken stretch where the predicate holds, up to now', () => {
  const okAt = (beat) => stateOf({ decks: [deckAt(beat, { playing: true }), deckAt(beat, { playing: true })] });
  const bad = stateOf();
  const samples = [
    sample(0, okAt(0)), sample(0.1, bad), sample(0.2, okAt(1)), sample(0.3, okAt(2)), sample(0.4, okAt(3)),
  ];
  const isPlaying = (state) => state.decks[0].playing;
  const ctx = ctxOf({ samples, state: okAt(4), elapsed: 0.5 });
  const run = trailingRun(ctx, isPlaying);
  assert.equal(run.length, 4, 'three samples plus now, the earlier bad sample ends the run');
  assert.equal(run[0].t, 0.2);
  assert.ok(Math.abs(runSeconds(run) - 0.3) < 1e-9);
  assert.equal(runBeats(run), 3);
  assert.deepEqual(trailingRun(ctxOf({ samples, state: bad, elapsed: 0.5 }), isPlaying), []);
  assert.equal(runBeats([]), 0);
  assert.equal(runSeconds([]), 0);
});

test('tailByBeats keeps only the final beats of a run and holdSeconds reads the same run', () => {
  const playingAt = (beat) => stateOf({ decks: [deckAt(beat, { playing: true }), deckAt(beat, { playing: true })] });
  const samples = [0, 1, 2, 3, 4, 5].map((beat) => sample(beat * 0.5, playingAt(beat)));
  const ctx = ctxOf({ samples, state: playingAt(6), elapsed: 3 });
  const run = trailingRun(ctx, (state) => state.decks[0].playing);
  assert.equal(run.length, 7);
  assert.deepEqual(tailByBeats(run, 2).map((item) => item.at.decks[0].beat), [4, 5, 6]);
  assert.equal(tailByBeats(run, 99).length, 7);
  assert.deepEqual(tailByBeats([], 4), []);
  assert.equal(holdSeconds(ctx, (state) => state.decks[0].playing), 3);
});

test('lastCrossing finds the newest move across a threshold in one direction', () => {
  const events = [
    control('m.low2', -0.2, 1), control('m.low2', -0.6, 1.1), control('m.low2', -1, 1.2),
    control('m.low2', -0.7, 2), control('m.low2', -0.3, 2.1), control('m.low2', 0, 2.2),
    control('m.low1', -1, 2.3),
  ];
  const up = lastCrossing(events, 'm.low2', { threshold: -0.5, direction: 'up', startValue: 0 });
  assert.equal(up.t, 2.1);
  const down = lastCrossing(events, 'm.low2', { threshold: -0.5, direction: 'down', startValue: 0 });
  assert.equal(down.t, 1.1);
  assert.equal(lastCrossing(events, 'm.low2', { threshold: 5, direction: 'up', startValue: 0 }), null);
  assert.equal(lastCrossing(events, 'm.hi2', { threshold: -0.5, direction: 'up', startValue: 0 }), null);
});

test('lastCrossing starts from the value the control had when the step began', () => {
  const events = [control('m.low2', -0.4, 1), control('m.low2', 0, 1.1)];
  const up = lastCrossing(events, 'm.low2', { threshold: -0.5, direction: 'up', startValue: -1 });
  assert.equal(up.t, 1, 'jumping from -1 straight past the threshold counts at the first event');
});

test('transitSeconds measures the last leg from the low zone to the target', () => {
  const slide = [0.02, 0.05, 0.3, 0.6, 0.95].map((value, i) => control('m.xfader', value, i * 0.8));
  assert.ok(Math.abs(transitSeconds(slide, 'm.xfader', { lo: 0.1, hi: 0.9 }) - 2.4) < 1e-9);
  const jump = [control('m.xfader', 0.02, 1), control('m.xfader', 1, 1.05)];
  assert.ok(Math.abs(transitSeconds(jump, 'm.xfader', { lo: 0.1, hi: 0.9 }) - 0.05) < 1e-9);
  const wobble = [control('m.xfader', 0.5, 1), control('m.xfader', 0.05, 5), control('m.xfader', 0.95, 6)];
  assert.ok(Math.abs(transitSeconds(wobble, 'm.xfader', { lo: 0.1, hi: 0.9 }) - 1) < 1e-9, 'measured from the last time it sat low');
  assert.equal(transitSeconds(slide.slice(0, 3), 'm.xfader', { lo: 0.1, hi: 0.9 }), null);
});

test('findExcursion needs a knob to leave center, reach the peak and come back', () => {
  const build = (values) => values.map((value, i) => control('m.cfx1', value, i));
  const full = findExcursion(build([0.02, 0.2, 0.5, 0.8, 0.05]), 'm.cfx1', { inner: 0.1, peak: 0.6 });
  assert.equal(full.leave.t, 1);
  assert.equal(full.back.t, 4);
  assert.equal(findExcursion(build([0.02, 0.2, 0.4, 0.05]), 'm.cfx1', { inner: 0.1, peak: 0.6 }), null, 'never peaked');
  assert.equal(findExcursion(build([0.2, 0.7]), 'm.cfx1', { inner: 0.1, peak: 0.6 }), null, 'never came back');
  const retry = findExcursion(build([0.3, 0.05, 0.2, 0.9, -0.02]), 'm.cfx1', { inner: 0.1, peak: 0.6 });
  assert.equal(retry.leave.t, 2, 'a false start resets the excursion');
  const left = findExcursion(build([-0.3, -0.8, 0]), 'm.cfx1', { inner: 0.1, peak: 0.6 });
  assert.equal(left.back.t, 2, 'either direction counts');
});

test('samplesBetween and withDeck build what the lesson tests need', () => {
  const samples = samplesBetween(0, 1, (t) => withDeck(stateOf(), 0, { position: t }));
  assert.equal(samples.length, 11);
  assert.equal(samples[10].at.decks[0].position, samples[10].t);
});
