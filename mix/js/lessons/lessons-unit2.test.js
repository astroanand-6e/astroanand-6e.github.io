/**
 * Unit 2 done() and score() on synthetic ctx objects: faders and crossfader, EQ, the filter.
 * Decks run a 120 BPM track: one beat is 500 ms, a bar is 4 beats, a phrase is 32.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonById } from './curriculum.js';
import { control, ctxOf, deckAt, mixerState, samplesBetween, stateOf } from './testing/kit.js';

const mixerCtx = (mixer, over = {}) => ctxOf({ state: stateOf({ mixer: mixerState(mixer) }), ...over });
const ramp = (id, values, step = 0.5) => values.map((value, i) => control(id, value, i * step));

/* Level 4 */
const [blendStep, slideStep, backStep] = lessonById('faders-and-crossfader').steps;

const blendCtx = (fader, { seconds = 1.5, fader1 = 1 } = {}) => {
  const state = stateOf({ mixer: mixerState({ fader: [fader1, fader] }) });
  return ctxOf({ state, samples: samplesBetween(0, seconds, () => state), elapsed: seconds });
};

test('level 4 step 1 needs channel 2 between 35% and 85% for a second with deck 1 near full', () => {
  assert.equal(blendStep.done(blendCtx(0.6)), true);
  assert.equal(blendStep.done(blendCtx(0.35)), true);
  assert.equal(blendStep.done(blendCtx(0.34)), false);
  assert.equal(blendStep.done(blendCtx(0.86)), false, 'louder than deck 1 is not under it');
  assert.equal(blendStep.done(blendCtx(0.6, { seconds: 0.5 })), false, 'held for half a second');
  assert.equal(blendStep.done(blendCtx(0.6, { fader1: 0.5 })), false, 'deck 1 dropped out');
  assert.equal(blendStep.readout(blendCtx(0.62)), 'Channel 2 fader 62%');
});

test('level 4 steps 2 and 3 follow the crossfader', () => {
  assert.equal(slideStep.done(mixerCtx({ xfader: 0.9 })), true);
  assert.equal(slideStep.done(mixerCtx({ xfader: 0.89 })), false);
  assert.equal(slideStep.done(mixerCtx({ xfader: -1 })), false, 'the wrong way fades out deck 2');
  assert.equal(backStep.done(mixerCtx({ xfader: 0.1 })), true);
  assert.equal(backStep.done(mixerCtx({ xfader: -0.1 })), true);
  assert.equal(backStep.done(mixerCtx({ xfader: 0.11 })), false);
  assert.equal(slideStep.readout(mixerCtx({ xfader: 0.4 })), 'Crossfader 40% toward deck 2');
  assert.equal(slideStep.readout(mixerCtx({ xfader: -0.25 })), 'Crossfader 25% toward deck 1');
  assert.equal(slideStep.readout(mixerCtx({ xfader: 0 })), 'Crossfader in the middle');
});

function level4Score(slideSeconds, level = 0.6) {
  const events = [control('m.xfader', 0.02, 0), control('m.xfader', 0.1, 1), control('m.xfader', 0.9, 1 + slideSeconds)];
  const fadeCtx = ctxOf({ events, state: stateOf({ decks: [deckAt(64, { bpm: 120 }), deckAt(64)] }) });
  const mixed = mixerCtx({ fader: [1, level] });
  return lessonById('faders-and-crossfader').score([mixed, fadeCtx, ctxOf()]);
}

test('level 4 awards 3 stars for a 3 second slide through the middle, 2 from 1.5 s, otherwise 1', () => {
  assert.equal(level4Score(3).stars, 3);
  assert.equal(level4Score(2.9).stars, 2);
  assert.equal(level4Score(1.5).stars, 2);
  assert.equal(level4Score(1.4).stars, 1);
  assert.equal(level4Score(0).stars, 1, 'a jump to the end');
});

test('level 4 feedback gives the slide time in seconds and beats, and the channel 2 level', () => {
  assert.deepEqual(level4Score(3.5, 0.62).lines, ['The crossfade took 3.5 s (7 beats).', 'Deck 2 came in at 62% under deck 1.']);
  assert.deepEqual(level4Score(1).lines, ['The crossfade took 1.0 s (2 beats).', 'Take 4 seconds or more for a smooth blend.']);
});

/* Level 5 */
const [hiStep, killStep, restoreStep] = lessonById('eq').steps;
const lowOf = (low2) => mixerState({ low: [0, low2] });

test('level 5 step 1 needs HI on channel 2 cut and brought back', () => {
  const back = mixerCtx({ hi: [0, 0] }, { events: ramp('m.hi2', [-0.3, -0.7, -1, -0.5, 0]) });
  assert.equal(hiStep.done(back), true);
  const cutOnly = mixerCtx({ hi: [0, -1] }, { events: ramp('m.hi2', [-0.3, -0.7, -1]) });
  assert.equal(hiStep.done(cutOnly), false);
  const notCutEnough = mixerCtx({ hi: [0, 0] }, { events: ramp('m.hi2', [-0.3, -0.4, 0]) });
  assert.equal(hiStep.done(notCutEnough), false);
  const returnedLow = mixerCtx({ hi: [0, -0.4] }, { events: ramp('m.hi2', [-1, -0.4]) });
  assert.equal(hiStep.done(returnedLow), false, 'it has to come back to about flat');
  assert.equal(hiStep.done(ctxOf()), false);
});

test('level 5 step 2 needs LOW on channel 2 fully cut', () => {
  assert.equal(killStep.done(mixerCtx({ low: [0, -1] })), true);
  assert.equal(killStep.done(mixerCtx({ low: [0, -0.9] })), true);
  assert.equal(killStep.done(mixerCtx({ low: [0, -0.89] })), false);
  assert.equal(killStep.done(mixerCtx({ low: [-1, 0] })), false, 'wrong channel');
});

const restoreCtx = ({ lowNow, events, startLow = -1 }) =>
  ctxOf({
    state: stateOf({ mixer: lowOf(lowNow) }),
    start: stateOf({ mixer: lowOf(startLow) }),
    events,
  });

test('level 5 step 3 needs the bass to come back up past halfway and end near flat', () => {
  const upAtBar = control('m.low2', 0, 5, { at: stateOf({ decks: [deckAt(0), deckAt(68)] }) });
  assert.equal(restoreStep.done(restoreCtx({ lowNow: 0, events: [upAtBar] })), true);
  assert.equal(restoreStep.done(restoreCtx({ lowNow: 0, events: [] })), false, 'flat, but you never turned it');
  assert.equal(restoreStep.done(restoreCtx({ lowNow: -0.5, events: [control('m.low2', -0.5, 5)] })), false);
  const halfway = control('m.low2', -0.4, 5);
  assert.equal(restoreStep.done(restoreCtx({ lowNow: -0.4, events: [halfway] })), false, 'past halfway but not flat yet');
  const lessonMove = control('m.low2', 0, 5, { source: 'lesson' });
  assert.equal(restoreStep.done(restoreCtx({ lowNow: 0, events: [lessonMove] })), false);
});

function level5Score(offsetBeats) {
  const upEvent = control('m.low2', 0, 5, { at: stateOf({ decks: [deckAt(0), deckAt(68 + offsetBeats)] }) });
  const ctxs = [ctxOf(), ctxOf(), restoreCtx({ lowNow: 0, events: [upEvent] })];
  return lessonById('eq').score(ctxs);
}

test('level 5 awards 3 stars within 0.25 beats of the downbeat, 2 within 0.5, otherwise 1', () => {
  assert.equal(level5Score(0).stars, 3);
  assert.equal(level5Score(0.25).stars, 3);
  assert.equal(level5Score(-0.25).stars, 3);
  assert.equal(level5Score(0.26).stars, 2);
  assert.equal(level5Score(-0.5).stars, 2);
  assert.equal(level5Score(0.51).stars, 1);
  assert.equal(level5Score(1.9).stars, 1);
  assert.equal(level5Score(2).stars, 1, 'half a bar away is as far as it gets');
});

test('level 5 feedback names the offset and which way to adjust', () => {
  assert.deepEqual(level5Score(0).lines, ['The bass came back right on the downbeat.', 'The kick returned right on beat 1.']);
  assert.deepEqual(level5Score(0.4).lines, ['The bass came back 0.4 beats after the downbeat.', 'Start turning a little earlier.']);
  assert.deepEqual(level5Score(-0.8).lines, ['The bass came back 0.8 beats before the downbeat.', 'Wait a little longer before you turn.']);
});

test('level 5 step 3 readout shows the bar and beat of deck 2', () => {
  const ctx = ctxOf({ state: stateOf({ decks: [deckAt(0), deckAt(66.4)] }) });
  assert.equal(restoreStep.readout(ctx), 'Bar 17   Beat 3 of 4');
});

/* Level 6 */
const [warmStep, sweepStep] = lessonById('the-filter').steps;
const cfxCtx = (cfx1, values) => mixerCtx({ cfx: [cfx1, 0] }, { events: ramp('m.cfx1', values) });

test('level 6 step 1 needs the filter turned left and back to the middle', () => {
  assert.equal(warmStep.done(cfxCtx(0, [-0.3, -0.8, -0.4, 0])), true);
  assert.equal(warmStep.done(cfxCtx(-0.8, [-0.3, -0.8])), false, 'still on');
  assert.equal(warmStep.done(cfxCtx(0, [0.4, 0.8, 0])), false, 'that was the other direction');
  assert.equal(warmStep.done(cfxCtx(0.05, [-0.2, -0.3, 0.05])), false, 'never reached halfway');
  assert.equal(warmStep.done(cfxCtx(0, [])), false);
});

test('level 6 step 2 needs a full sweep: leave the middle, reach 60%, come back', () => {
  assert.equal(sweepStep.done(cfxCtx(0, [0.05, 0.2, 0.5, 0.9, 0])), true);
  assert.equal(sweepStep.done(cfxCtx(0, [0.05, 0.2, 0.5, 0])), false, 'never reached 60%');
  assert.equal(sweepStep.done(cfxCtx(0.9, [0.05, 0.2, 0.9])), false, 'still away from the middle');
  assert.equal(sweepStep.done(cfxCtx(0, [-0.3, -0.8, 0])), true, 'either direction is a sweep');
});

test('level 6 step 2 readout shows the phrase counter and how long the sweep has run', () => {
  const at = (beat, cfx) => ctxOf({
    state: stateOf({ decks: [deckAt(beat), deckAt(0)], mixer: mixerState({ cfx: [cfx, 0] }) }),
    events: [control('m.cfx1', 0.3, 1, { at: stateOf({ decks: [deckAt(80), deckAt(0)] }) })],
  });
  assert.equal(sweepStep.readout(at(86, 0.5)), 'Phrase beat 23 / 32   Sweep 6.0 beats');
  assert.equal(sweepStep.readout(ctxOf({ state: stateOf({ decks: [deckAt(70), deckAt(0)] }) })), 'Phrase beat 7 / 32   Sweep 0.0 beats');
});

/** `landing` is beats after the phrase midpoint (beat 80); the knob leaves `length` beats earlier. */
function level6Score({ landing, length }) {
  const startBeat = 64 + 16 - length;
  const leave = control('m.cfx1', 0.3, 1, { at: stateOf({ decks: [deckAt(startBeat + landing), deckAt(0)] }) });
  const back = control('m.cfx1', 0, 9, { at: stateOf({ decks: [deckAt(64 + 16 + landing), deckAt(0)] }) });
  const events = [control('m.cfx1', 0.02, 0), leave, control('m.cfx1', 0.9, 5), back];
  return lessonById('the-filter').score([ctxOf(), ctxOf({ events })]);
}

test('level 6 needs a landing near the phrase start, and about 4 bars of sweep for 3 stars', () => {
  assert.equal(level6Score({ landing: 0, length: 16 }).stars, 1, 'half a phrase away');
  const nearPhrase = (landing, length) => level6Score({ landing: landing - 16, length }).stars;
  assert.equal(nearPhrase(0, 16), 3);
  assert.equal(nearPhrase(0.5, 12), 3);
  assert.equal(nearPhrase(-0.5, 20), 3);
  assert.equal(nearPhrase(0.51, 16), 2);
  assert.equal(nearPhrase(0, 11), 2, 'too short for 3 stars');
  assert.equal(nearPhrase(0, 21), 2, 'too long for 3 stars');
  assert.equal(nearPhrase(1, 16), 2);
  assert.equal(nearPhrase(-1.01, 16), 1);
});

test('level 6 feedback names the landing and the sweep length', () => {
  const result = level6Score({ landing: -16 + 0.3, length: 14 });
  assert.deepEqual(result.lines, ['The filter came back 0.3 beats after the phrase start.', 'The filter stayed on for 14 beats. Aim for about 16.']);
  assert.match(level6Score({ landing: -16 - 0.7, length: 16 }).lines[0], /0\.7 beats before the phrase start/);
});
