/**
 * Units 3 and 4 done() and score() on synthetic ctx objects: hot cues, loops, the bass swap.
 * Decks run a 120 BPM track: 1 beat = 500 ms = 0.5 s of track, a phrase is 32 beats.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonById } from './curriculum.js';
import { findSwap, swapTiming } from './unit4-mix.js';
import { control, ctxOf, deckAt, mixerState, press, sample, stateOf } from './testing/kit.js';

const BEAT_MS = 500;
const cues = (...slots) => Object.assign(Array(8).fill(null), Object.fromEntries(slots.map((s, i) => [i, s])));
const deckWith = (beat, over = {}) => stateOf({ decks: [deckAt(beat, { playing: true, ...over }), deckAt(0)] });

/* Level 7 */
const [modeStep, firstCueStep, secondCueStep, jumpStep] = lessonById('hot-cues').steps;

const padPress = (id, { cued = [null, null], padMode = 'hotcue', beat = 64 } = {}) =>
  press(id, 1, deckWith(beat, { padMode, hotCues: cues(...cued) }));

test('level 7 step 1 needs HOT CUE pressed and the pads in hot cue mode', () => {
  const state = deckWith(64, { padMode: 'hotcue' });
  assert.equal(modeStep.done(ctxOf({ state, events: [press('d1.mode.hotcue', 1)] })), true);
  assert.equal(modeStep.done(ctxOf({ state, events: [] })), false);
  assert.equal(modeStep.done(ctxOf({ state: deckWith(64, { padMode: 'padfx' }), events: [press('d1.mode.hotcue', 1)] })), false);
});

test('level 7 steps 2 and 3 follow the stored hot cues', () => {
  assert.equal(firstCueStep.done(ctxOf({ state: deckWith(64, { hotCues: cues(32) }) })), true);
  assert.equal(firstCueStep.done(ctxOf({ state: deckWith(64, { hotCues: cues(null, 40) }) })), false);
  const two = (second) => ctxOf({ state: deckWith(70, { hotCues: cues(32, second) }) });
  assert.equal(secondCueStep.done(two(34)), true, '4 beats apart');
  assert.equal(secondCueStep.done(two(33.9)), false, 'closer than 1 bar');
  assert.equal(secondCueStep.done(two(30)), true, 'before the first cue also counts');
  assert.equal(secondCueStep.done(two(null)), false);
  assert.equal(secondCueStep.done(ctxOf({ state: deckWith(70, { hotCues: cues(null, 40) }) })), false);
});

test('level 7 step 4 counts presses on lit pads, needs both pads and 3 jumps', () => {
  const lit = { cued: [32, 40] };
  const jump = (id) => padPress(id, lit);
  const ctx = (events) => ctxOf({ events });
  assert.equal(jumpStep.done(ctx([jump('d1.pad1'), jump('d1.pad2'), jump('d1.pad1')])), true);
  assert.equal(jumpStep.done(ctx([jump('d1.pad1'), jump('d1.pad2')])), false, 'two jumps');
  assert.equal(jumpStep.done(ctx([jump('d1.pad1'), jump('d1.pad1'), jump('d1.pad1')])), false, 'one pad only');
  const unlit = padPress('d1.pad2', { cued: [32, null] });
  assert.equal(jumpStep.done(ctx([jump('d1.pad1'), unlit, jump('d1.pad1'), jump('d1.pad1')])), false, 'an unlit pad sets, not jumps');
  const wrongMode = padPress('d1.pad2', { cued: [32, 40], padMode: 'padfx' });
  assert.equal(jumpStep.done(ctx([jump('d1.pad1'), wrongMode, jump('d1.pad1'), jump('d1.pad1')])), false);
  const release = control('d1.pad2', false, 2, { at: deckWith(64, { hotCues: cues(32, 40) }) });
  assert.equal(jumpStep.done(ctx([jump('d1.pad1'), release, jump('d1.pad1'), jump('d1.pad1')])), false, 'releases do not count');
});

test('level 7 step 4 readout counts jumps up to 3', () => {
  const jump = (id) => padPress(id, { cued: [32, 40] });
  assert.equal(jumpStep.readout(ctxOf({ events: [jump('d1.pad1')] })), 'Jumps 1 / 3');
  assert.equal(jumpStep.readout(ctxOf({ events: [jump('d1.pad1'), jump('d1.pad2'), jump('d1.pad1'), jump('d1.pad2')] })), 'Jumps 3 / 3');
});

function level7Score(errorsMs, { cued = [32, 40] } = {}) {
  const events = errorsMs.map((ms, i) => press(i % 2 ? 'd1.pad2' : 'd1.pad1', i, deckWith(64 + ms / BEAT_MS, { hotCues: cues(...cued) })));
  return lessonById('hot-cues').score([ctxOf(), ctxOf({ events: events.slice(0, 1) }), ctxOf({ events: events.slice(1, 2) }), ctxOf({ events: events.slice(2) })]);
}

test('level 7 awards 3 stars within 70 ms on average, 2 within 140 ms, otherwise 1', () => {
  assert.equal(level7Score([0, 0, 0, 0]).stars, 3);
  assert.equal(level7Score([70, 70, 70, 70]).stars, 3);
  assert.equal(level7Score([-70, 70, -70, 70]).stars, 3, 'early and late both count as off the beat');
  assert.equal(level7Score([71, 71, 71, 71]).stars, 2);
  assert.equal(level7Score([140, 140, 140, 140]).stars, 2);
  assert.equal(level7Score([141, 141, 141, 141]).stars, 1);
  assert.equal(level7Score([240, 240, 240, 240]).stars, 1);
});

test('level 7 averages across every pad press, so one loose press can be covered by tight ones', () => {
  assert.equal(level7Score([0, 0, 0, 0, 0, 0, 200]).stars, 3, 'mean 29 ms');
  assert.equal(level7Score([200, 200, 0, 0]).stars, 2, 'mean 100 ms');
});

test('level 7 feedback gives the mean and either the loosest press or a tip', () => {
  assert.deepEqual(level7Score([20, 40, 60, 0]).lines, ['Your pad presses landed 30 ms from the beat on average.', 'The loosest was 60 ms off.']);
  assert.deepEqual(level7Score([200, 200, 200, 200]).lines, ['Your pad presses landed 200 ms from the beat on average.', 'Press the pad right as the beat dot lights.']);
});

/* Level 8 */
const [startLoopStep, halveStep, doubleStep, exitStep] = lessonById('loops').steps;
const loopOf = (beats, start = 32) => ({ start, end: start + beats * 0.5, beats });
const withLoop = (beats) => ctxOf({ state: deckWith(64, { loop: beats ? loopOf(beats) : null }) });

test('level 8 steps 1 to 3 follow the loop length', () => {
  assert.equal(startLoopStep.done(withLoop(4)), true);
  assert.equal(startLoopStep.done(withLoop(8)), false);
  assert.equal(startLoopStep.done(withLoop(0)), false);
  assert.equal(halveStep.done(withLoop(2)), true);
  assert.equal(halveStep.done(withLoop(4)), false);
  assert.equal(doubleStep.done(withLoop(8)), true);
  assert.equal(doubleStep.done(withLoop(4)), false, 'one press of 2X is not enough');
  assert.equal(doubleStep.done(ctxOf({ state: deckWith(64, { loop: undefined }) })), false);
});

const exitPress = (position = 34, loop = loopOf(8)) =>
  press('d1.loop.exit', 5, deckWith(66, { loop, position }));

test('level 8 step 4 needs the loop off after an exit press made while looping', () => {
  assert.equal(exitStep.done(ctxOf({ state: deckWith(70, { loop: null }), events: [exitPress()] })), true);
  assert.equal(exitStep.done(ctxOf({ state: deckWith(70, { loop: loopOf(8) }), events: [exitPress()] })), false, 'still looping');
  assert.equal(exitStep.done(ctxOf({ state: deckWith(70, { loop: null }), events: [] })), false);
  const startedLoop = press('d1.loop.exit', 5, deckWith(66, { loop: null }));
  assert.equal(exitStep.done(ctxOf({ state: deckWith(70, { loop: null }), events: [startedLoop] })), false, 'that press started a loop');
});

test('level 8 readouts count down to the phrase or to the loop restart', () => {
  assert.equal(startLoopStep.readout(ctxOf({ state: deckWith(80) })), 'Phrase restarts in 16.0 beats');
  assert.equal(halveStep.readout(ctxOf({ state: deckWith(66, { loop: loopOf(2), position: 32.5 }) })), 'Loop of 2 beats   Restarts in 1.0 beats');
});

function level8Score({ startBeatsAfterPhrase, exitBeatsAfterRestart }) {
  const loopStart = 32 + startBeatsAfterPhrase * 0.5;
  const loopCtx = ctxOf({ state: deckWith(66 + startBeatsAfterPhrase, { loop: loopOf(4, loopStart) }) });
  const exitLoop = loopOf(8, 32);
  const exitCtx = ctxOf({ events: [exitPress(32 + exitBeatsAfterRestart * 0.5, exitLoop)] });
  return lessonById('loops').score([loopCtx, ctxOf(), ctxOf(), exitCtx]);
}

test('level 8 awards 3 stars for an exit within half a beat of a loop that began on the phrase', () => {
  assert.equal(level8Score({ startBeatsAfterPhrase: 0, exitBeatsAfterRestart: 0 }).stars, 3);
  assert.equal(level8Score({ startBeatsAfterPhrase: 1, exitBeatsAfterRestart: 0.5 }).stars, 3);
  assert.equal(level8Score({ startBeatsAfterPhrase: -1, exitBeatsAfterRestart: -0.5 }).stars, 3);
  assert.equal(level8Score({ startBeatsAfterPhrase: 1.1, exitBeatsAfterRestart: 0 }).stars, 2, 'the loop began off the phrase');
  assert.equal(level8Score({ startBeatsAfterPhrase: 0, exitBeatsAfterRestart: 0.51 }).stars, 2);
  assert.equal(level8Score({ startBeatsAfterPhrase: 0, exitBeatsAfterRestart: 1 }).stars, 2);
  assert.equal(level8Score({ startBeatsAfterPhrase: 0, exitBeatsAfterRestart: 1.1 }).stars, 1);
  assert.equal(level8Score({ startBeatsAfterPhrase: 0, exitBeatsAfterRestart: 4 }).stars, 1, 'mid loop');
});

test('level 8 measures an early exit against the coming restart', () => {
  const early = level8Score({ startBeatsAfterPhrase: 0, exitBeatsAfterRestart: 7.7 });
  assert.equal(early.stars, 3, '0.3 beats before the restart is as good as 0.3 after');
  assert.match(early.lines[0], /exited 0\.3 beats before the loop restart/);
});

test('level 8 feedback reports the exit and where the loop started', () => {
  assert.deepEqual(
    level8Score({ startBeatsAfterPhrase: 0.4, exitBeatsAfterRestart: 0.2 }).lines,
    ['You exited 0.2 beats after the loop restart.', 'The loop started 0.4 beats after the phrase start.'],
  );
});

/* Level 9 */
const [fadeInStep, swapStep, outStep] = lessonById('the-bass-swap').steps;
const PHRASE = 96; // a phrase start on deck 2's grid
const lowStart = stateOf({ mixer: mixerState({ low: [0, -1], fader: [1, 1] }) });

/** The two LOW moves: they straddle `landing` beats after the phrase start, `gap` beats apart. */
function swapEvents({ landing, gap, downFirst = true }) {
  const at = (beat) => stateOf({ decks: [deckAt(beat), deckAt(beat, { playing: true })] });
  const early = PHRASE + landing - gap / 2;
  const late = PHRASE + landing + gap / 2;
  const down = control('m.low1', -1, 10, { at: at(downFirst ? early : late), abs: 1000 + (downFirst ? 10 : 10 + gap / 2) });
  const up = control('m.low2', 0, 10, { at: at(downFirst ? late : early), abs: 1000 + (downFirst ? 10 + gap / 2 : 10) });
  return downFirst ? [down, up] : [up, down];
}

const swappedState = stateOf({ mixer: mixerState({ low: [-1, 0], fader: [1, 1] }) });

test('findSwap needs deck 1 LOW to fall past halfway and deck 2 LOW to rise past it', () => {
  const events = swapEvents({ landing: 0, gap: 1 });
  assert.ok(findSwap(ctxOf({ start: lowStart, events })));
  assert.equal(findSwap(ctxOf({ start: lowStart, events: events.slice(0, 1) })), null, 'only deck 1 moved');
  assert.equal(findSwap(ctxOf({ start: lowStart, events: events.slice(1) })), null, 'only deck 2 moved');
  const earlyKill = [control('m.low1', -1, 1), ...events.slice(1)];
  assert.equal(findSwap(ctxOf({ start: stateOf({ mixer: mixerState({ low: [-1, -1] }) }), events: earlyKill })), null, 'deck 1 was already cut');
  assert.equal(findSwap(ctxOf({ start: lowStart, events: events.map((e) => ({ ...e, source: 'lesson' })) })), null);
});

test('swapTiming uses the midpoint of the two moves, whichever knob goes first', () => {
  const tight = swapTiming(findSwap(ctxOf({ start: lowStart, events: swapEvents({ landing: 0.3, gap: 1 }) })));
  assert.ok(Math.abs(tight.landing - 0.3) < 1e-9);
  assert.ok(Math.abs(tight.gap - 1) < 1e-9);
  const reversed = swapTiming(findSwap(ctxOf({ start: lowStart, events: swapEvents({ landing: -0.6, gap: 2, downFirst: false }) })));
  assert.ok(Math.abs(reversed.landing + 0.6) < 1e-9);
  assert.ok(Math.abs(reversed.gap - 2) < 1e-9);
  const wrapped = swapTiming(findSwap(ctxOf({ start: lowStart, events: swapEvents({ landing: -0.2, gap: 1 }) })));
  assert.ok(Math.abs(wrapped.landing + 0.2) < 1e-9, 'a swap just before the phrase reads as negative');
});

test('level 9 step 1 needs channel 2 brought up, step 3 needs deck 1 out', () => {
  assert.equal(fadeInStep.done(ctxOf({ state: stateOf({ mixer: mixerState({ fader: [1, 0.8] }) }) })), true);
  assert.equal(fadeInStep.done(ctxOf({ state: stateOf({ mixer: mixerState({ fader: [1, 0.79] }) }) })), false);
  const out = (mixer) => ctxOf({ state: stateOf({ mixer: mixerState(mixer) }) });
  assert.equal(outStep.done(out({ fader: [0.05, 1] })), true);
  assert.equal(outStep.done(out({ fader: [0.06, 1] })), false);
  assert.equal(outStep.done(out({ fader: [1, 1], xfader: 1 })), true, 'the crossfader takes deck 1 out too');
  assert.equal(outStep.done(out({ fader: [1, 1], xfader: 0.6 })), false);
});

test('level 9 step 2 is done once both LOW moves happened and the knobs ended swapped', () => {
  const events = swapEvents({ landing: 0, gap: 1 });
  assert.equal(swapStep.done(ctxOf({ start: lowStart, state: swappedState, events })), true);
  assert.equal(swapStep.done(ctxOf({ start: lowStart, state: swappedState, events: [] })), false);
  const halfway = stateOf({ mixer: mixerState({ low: [-0.6, 0] }) });
  assert.equal(swapStep.done(ctxOf({ start: lowStart, state: halfway, events })), false, 'deck 1 is not cut enough');
  const bassStillCut = stateOf({ mixer: mixerState({ low: [-1, -0.4] }) });
  assert.equal(swapStep.done(ctxOf({ start: lowStart, state: bassStillCut, events })), false);
});

test('level 9 step 2 readout counts down to the phrase restart on deck 2', () => {
  const state = stateOf({ decks: [deckAt(0), deckAt(106)] });
  assert.equal(swapStep.readout(ctxOf({ state })), 'Phrase restarts in 22.0 beats');
});

function level9Score({ landing, gap, phaseMs = 4, outAfter = 6 }) {
  const events = swapEvents({ landing, gap });
  const overlapAt = () => stateOf({
    decks: [deckAt(90, { playing: true }), deckAt(90, { playing: true })],
    mixer: mixerState({ fader: [1, 1] }),
    phaseOffset: phaseMs / BEAT_MS,
  });
  const samples = [sample(0, overlapAt()), sample(0.1, overlapAt()), sample(0.2, overlapAt())];
  const finished = stateOf({ decks: [deckAt(0), deckAt(PHRASE + landing + gap / 2 + outAfter)] });
  return lessonById('the-bass-swap').score([
    ctxOf({ samples }), ctxOf({ start: lowStart, events, samples }), ctxOf({ state: finished, samples }),
  ]);
}

test('level 9 awards 3 stars for a swap within half a beat of the phrase, 2 beats apart, in phase', () => {
  assert.equal(level9Score({ landing: 0, gap: 0 }).stars, 3);
  assert.equal(level9Score({ landing: 0.5, gap: 2 }).stars, 3);
  assert.equal(level9Score({ landing: -0.5, gap: 2 }).stars, 3);
  assert.equal(level9Score({ landing: 0.51, gap: 2 }).stars, 2);
  assert.equal(level9Score({ landing: 0.5, gap: 2.1 }).stars, 2);
  assert.equal(level9Score({ landing: 1, gap: 4 }).stars, 2);
  assert.equal(level9Score({ landing: 1.1, gap: 1 }).stars, 1);
  assert.equal(level9Score({ landing: 0, gap: 4.1 }).stars, 1);
});

test('level 9 caps the score at 1 star when the beats drifted while both decks played', () => {
  assert.equal(level9Score({ landing: 0, gap: 0, phaseMs: 25 }).stars, 3);
  assert.equal(level9Score({ landing: 0, gap: 0, phaseMs: 26 }).stars, 1);
});

test('level 9 reports four rows and two feedback lines with numbers', () => {
  const result = level9Score({ landing: 0.3, gap: 1, phaseMs: 12, outAfter: 8 });
  assert.equal(result.lines[0], 'Swap landed 0.3 beats after the phrase.');
  assert.equal(result.lines[1], 'Phase held within 12 ms over 1 s of overlap.', 'three contexts share three samples: 0.9 s');
  assert.deepEqual(result.rows.map((row) => row.label), [
    'Swap against the phrase start', 'Gap between the LOW moves', 'Phase while both played', 'Deck 1 taken out',
  ]);
  assert.deepEqual(result.rows.map((row) => row.value), [
    '0.3 beats after the phrase', '1 beat', '12 ms on average', '8 beats after the swap',
  ]);
  assert.ok(result.rows.every((row) => row.ok));
  const loose = level9Score({ landing: 3, gap: 6 });
  assert.deepEqual(loose.rows.map((row) => row.ok), [false, false, true, true]);
});
