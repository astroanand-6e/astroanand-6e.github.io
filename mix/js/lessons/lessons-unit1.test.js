/**
 * Unit 1 done() and score() on synthetic ctx objects: no engine, no clock.
 * Decks run a 120 BPM track, so one beat is 500 ms and one second is 2 beats.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonById } from './curriculum.js';
import { SKIPPED_LINE } from './scoring.js';
import { control, ctxOf, deckAt, press, sample, samplesBetween, stateOf, withDeck } from './testing/kit.js';

const BEAT_MS = 500;
const playing = (over = {}) => deckAt(64, { playing: true, ...over });

/* Level 1 */
const [playStep, returnStep, setStep] = lessonById('play-and-cue').steps;
const cueAtBeat = (beat) => beat * 0.5;

test('level 1 step 1 is done once deck 1 plays', () => {
  assert.equal(playStep.done(ctxOf({ state: stateOf({ decks: [playing(), deckAt(0)] }) })), true);
  assert.equal(playStep.done(ctxOf()), false);
});

test('level 1 step 2 needs CUE pressed during playback and the deck back at its cue', () => {
  const back = withDeck(stateOf(), 0, { playing: false, position: 0.05, cuePoint: 0 });
  const whilePlaying = press('d1.cue', 3, stateOf({ decks: [playing(), deckAt(0)] }));
  assert.equal(returnStep.done(ctxOf({ state: back, events: [whilePlaying] })), true);
  const whilePaused = press('d1.cue', 3, stateOf());
  assert.equal(returnStep.done(ctxOf({ state: back, events: [whilePaused] })), false, 'a press while paused sets a cue');
  assert.equal(returnStep.done(ctxOf({ state: back, events: [] })), false);
  const stillPlaying = withDeck(stateOf(), 0, { playing: true });
  assert.equal(returnStep.done(ctxOf({ state: stillPlaying, events: [whilePlaying] })), false);
  const farFromCue = withDeck(stateOf(), 0, { playing: false, position: 5, cuePoint: 0 });
  assert.equal(returnStep.done(ctxOf({ state: farFromCue, events: [whilePlaying] })), false);
});

test('level 1 step 3 accepts a cue within half a beat of bar 17 beat 1', () => {
  const stateWithCue = (beat) => withDeck(stateOf(), 0, { beat: 65, position: 32.5, cuePoint: cueAtBeat(beat) });
  assert.equal(setStep.done(ctxOf({ state: stateWithCue(64) })), true);
  assert.equal(setStep.done(ctxOf({ state: stateWithCue(63.6) })), true);
  assert.equal(setStep.done(ctxOf({ state: stateWithCue(64.5) })), true);
  assert.equal(setStep.done(ctxOf({ state: stateWithCue(64.6) })), false);
  assert.equal(setStep.done(ctxOf({ state: stateWithCue(0) })), false, 'the starting cue is not bar 17');
  assert.equal(setStep.done(ctxOf({ state: stateWithCue(56) })), false);
});

test('level 1 step 3 readout shows where you are, where the cue is, and the target', () => {
  const state = withDeck(stateOf(), 0, { beat: 60.5, cuePoint: cueAtBeat(0), position: 30.25 });
  assert.equal(setStep.readout(ctxOf({ state })), 'Now 16.1   Cue 1.1   Target 17.1');
});

function level1Score(offsetMs, extra = {}) {
  const beat = 64 + offsetMs / BEAT_MS;
  const state = withDeck(stateOf(), 0, { beat: 65, position: 32.5, cuePoint: cueAtBeat(beat) });
  const ctxs = [ctxOf({ elapsed: 2 }), ctxOf({ elapsed: 4 }), ctxOf({ state, elapsed: 8, ...extra })];
  return lessonById('play-and-cue').score(ctxs);
}

test('level 1 awards 3 stars within 50 ms, 2 within 150 ms, otherwise 1', () => {
  assert.equal(level1Score(0).stars, 3);
  assert.equal(level1Score(49).stars, 3);
  assert.equal(level1Score(-49).stars, 3);
  assert.equal(level1Score(60).stars, 2);
  assert.equal(level1Score(149).stars, 2);
  assert.equal(level1Score(-160).stars, 1);
  assert.equal(level1Score(240).stars, 1);
});

test('level 1 feedback names the offset and gives one useful line', () => {
  assert.deepEqual(level1Score(0).lines, ['New cue landed right on bar 17 beat 1.', 'Done in 14 s.']);
  assert.equal(level1Score(100).lines[0], 'New cue landed 100 ms after bar 17 beat 1.');
  assert.equal(level1Score(-100).lines[0], 'New cue landed 100 ms before bar 17 beat 1.');
  assert.match(level1Score(200).lines[1], /Pause right as the counter flips to 17\.1/);
});

test('a skipped step caps any level at 1 star with an explanation', () => {
  const skipped = lessonById('play-and-cue').score([ctxOf(), null, ctxOf()]);
  assert.equal(skipped.stars, 1);
  assert.deepEqual(skipped.lines, [SKIPPED_LINE]);
});

/* Level 2 */
const [startStep, matchStep, syncStep] = lessonById('tempo-and-sync').steps;
const tempoState = (gap, { synced = false, p1 = true, p2 = true } = {}) => {
  const decks = [deckAt(64, { playing: p1, bpm: 124 }), deckAt(64, { playing: p2, bpm: 124 - gap, synced })];
  return stateOf({ decks });
};
const heldGap = (gap, from, to, over) => ctxOf({
  state: tempoState(gap, over),
  samples: samplesBetween(from, to, () => tempoState(gap, over)),
  elapsed: to,
});

test('level 2 step 1 is done once deck 2 plays', () => {
  assert.equal(startStep.done(ctxOf({ state: tempoState(4) })), true);
  assert.equal(startStep.done(ctxOf({ state: tempoState(4, { p2: false }) })), false);
});

test('level 2 step 2 needs the gap under 0.5 BPM held for 2 seconds, matched by hand', () => {
  assert.equal(matchStep.done(heldGap(0.4, 0, 2.2)), true);
  assert.equal(matchStep.done(heldGap(0.4, 0, 1.5)), false, 'only 1.5 s');
  assert.equal(matchStep.done(heldGap(0.6, 0, 3)), false, 'gap too wide');
  assert.equal(matchStep.done(heldGap(0.1, 0, 3, { synced: true })), false, 'SYNC is the next step');
  assert.equal(matchStep.done(heldGap(0.1, 0, 3, { p1: false })), false, 'both decks must play');
});

test('level 2 step 2 reports progress and a hint that points the right way', () => {
  assert.equal(matchStep.progress(heldGap(0.4, 0, 1)), 0.5);
  assert.equal(matchStep.progress(heldGap(2, 0, 1)), 0);
  assert.match(matchStep.hint(ctxOf({ state: tempoState(3.2) })), /3\.2 BPM slower\. Pull the tempo fader toward you/);
  assert.match(matchStep.hint(ctxOf({ state: tempoState(-2) })), /2\.0 BPM faster\. Push the tempo fader away/);
  assert.match(matchStep.hint(ctxOf({ state: tempoState(0.3) })), /Hold the fader still/);
  assert.equal(matchStep.readout(ctxOf({ state: tempoState(4) })), 'Deck 1 124.0   Deck 2 120.0   Gap 4.0');
});

test('level 2 step 3 needs the learner to press SYNC and deck 2 to lock on', () => {
  const synced = tempoState(0, { synced: true });
  const pressedSync = press('d2.sync', 2);
  assert.equal(syncStep.done(ctxOf({ state: synced, events: [pressedSync] })), true);
  assert.equal(syncStep.done(ctxOf({ state: synced, events: [] })), false);
  assert.equal(syncStep.done(ctxOf({ state: tempoState(0), events: [pressedSync] })), false, 'not locked');
  assert.equal(syncStep.done(ctxOf({ state: tempoState(0.2, { synced: true }), events: [pressedSync] })), false);
});

function level2Score(gap, { from = 0, slowBy = 0 } = {}) {
  const matchCtx = ctxOf({
    state: tempoState(gap),
    samples: [
      ...samplesBetween(0, slowBy, () => tempoState(3)),
      ...samplesBetween(from + slowBy, from + slowBy + 2.5, () => tempoState(gap)),
    ],
    elapsed: from + slowBy + 2.5,
  });
  return lessonById('tempo-and-sync').score([ctxOf(), matchCtx, ctxOf()]);
}

test('level 2 awards 3 stars under 0.15 BPM within a minute, 2 under 0.3, otherwise 1', () => {
  assert.equal(level2Score(0.14).stars, 3);
  assert.equal(level2Score(0.16).stars, 2);
  assert.equal(level2Score(0.29).stars, 2);
  assert.equal(level2Score(0.31).stars, 1);
  assert.equal(level2Score(0.1, { slowBy: 70 }).stars, 2, 'a precise match found slowly');
  assert.equal(level2Score(0.1, { slowBy: 50 }).stars, 3);
});

test('level 2 feedback gives the gap and the time it took', () => {
  const result = level2Score(0.1, { slowBy: 12 });
  assert.equal(result.lines[0], 'Tempo gap held at 0.10 BPM.');
  assert.equal(result.lines[1], 'It took 12 s to find the match.');
  assert.match(level2Score(0.4).lines[1], /Aim for under 0\.15 BPM in under 60 s/);
});

/* Level 3 */
const [listenStep, nudgeStep] = lessonById('nudge-with-the-jog').steps;
const BEATS_PER_SAMPLE = 0.2; // 100 ms at 120 BPM
const phaseState = (beat, phaseMs, over = {}) => stateOf({
  decks: [deckAt(beat, { playing: true, bpm: 120, ...over }), deckAt(beat, { playing: true, id: 2, ...over })],
  phaseOffset: phaseMs / BEAT_MS,
});
const nudgeCtx = ({ beats, phaseAt = () => 5, jog = 0.05, over }) => {
  const count = Math.round(beats / BEATS_PER_SAMPLE);
  const at = (i) => phaseState(64 + i * BEATS_PER_SAMPLE, phaseAt(i), over);
  return ctxOf({
    state: at(count),
    samples: Array.from({ length: count }, (_, i) => sample(i * 0.1, at(i))),
    events: jog ? [control('d2.jog', { delta: jog, touch: false }, 1)] : [],
    elapsed: count * 0.1,
  });
};

test('level 3 step 1 is the listening step: done after 4 seconds', () => {
  assert.equal(listenStep.done(ctxOf({ elapsed: 3.9 })), false);
  assert.equal(listenStep.done(ctxOf({ elapsed: 4 })), true);
  assert.equal(listenStep.readout(ctxOf({ state: phaseState(64, 132) })), 'Phase +132 ms');
  assert.equal(listenStep.readout(ctxOf({ state: phaseState(64, -20) })), 'Phase -20 ms');
});

test('level 3 step 2 needs a jog nudge and 4 bars (16 beats) within 40 ms', () => {
  assert.equal(nudgeStep.done(nudgeCtx({ beats: 16.2 })), true);
  assert.equal(nudgeStep.done(nudgeCtx({ beats: 15 })), false, 'only 15 beats');
  assert.equal(nudgeStep.done(nudgeCtx({ beats: 20, jog: 0 })), false, 'the jog was never used');
  assert.equal(nudgeStep.done(nudgeCtx({ beats: 20, jog: 0.01 })), false, 'a touch is not a nudge');
  assert.equal(nudgeStep.done(nudgeCtx({ beats: 20, phaseAt: () => 50 })), false, 'out of range');
  assert.equal(nudgeStep.done(nudgeCtx({ beats: 20, over: { playing: false } })), false, 'both decks must play');
});

test('level 3 step 2 restarts the hold when the phase leaves the 40 ms window', () => {
  const wobble = nudgeCtx({ beats: 20, phaseAt: (i) => (i === 40 ? 80 : 5) });
  assert.equal(nudgeStep.done(wobble), false, 'only the beats after the wobble count');
});

test('level 3 step 2 shows the signed phase and how much of the hold is done', () => {
  const ctx = nudgeCtx({ beats: 8, phaseAt: () => -12 });
  assert.equal(nudgeStep.readout(ctx), 'Phase -12 ms   Held 8.0 / 16 beats');
  assert.equal(nudgeStep.progress(ctx), 0.5);
});

test('level 3 hint tells you which way to turn the jog', () => {
  assert.match(nudgeStep.hint(ctxOf({ state: phaseState(64, 150) })), /ahead of deck 1.*counter-clockwise/);
  assert.match(nudgeStep.hint(ctxOf({ state: phaseState(64, -150) })), /behind deck 1.*clockwise/);
  assert.match(nudgeStep.hint(ctxOf({ state: phaseState(64, 10) })), /In range/);
});

function level3Score(phaseAt, beats = 20) {
  return lessonById('nudge-with-the-jog').score([ctxOf(), nudgeCtx({ beats, phaseAt })]);
}

test('level 3 awards 3 stars within 12 ms, 2 within 25 ms, otherwise 1, over the last 2 bars', () => {
  assert.equal(level3Score(() => 12).stars, 3);
  assert.equal(level3Score(() => 13).stars, 2);
  assert.equal(level3Score(() => 25).stars, 2);
  assert.equal(level3Score(() => 26).stars, 1);
  assert.equal(level3Score(() => 39).stars, 1);
});

test('level 3 ignores the approach: only the final 2 bars of the hold are scored', () => {
  const approachThenSteady = (i) => (i < 40 ? 35 : 6);
  assert.equal(level3Score(approachThenSteady, 20).stars, 3, 'a rough first 8 beats do not count');
  const slipInTheLastBar = (i) => (i > 90 ? 30 : 6);
  assert.equal(level3Score(slipInTheLastBar, 20).stars, 1);
  const slipEarly = (i) => (i === 50 ? 30 : 6);
  assert.equal(level3Score(slipEarly, 20).stars, 3, 'a slip 10 beats before the end is outside the last 2 bars');
});

test('level 3 feedback reports the worst phase error and when you centered it', () => {
  const result = level3Score((i) => (i === 95 ? 9.2 : 4));
  assert.equal(result.lines[0], 'Phase held within 10 ms over the last 2 bars.');
  assert.match(result.lines[1], /^You centered it after \d+ s\.$/);
  assert.match(level3Score(() => 30).lines[1], /Small, steady nudges hold it tighter/);
});
