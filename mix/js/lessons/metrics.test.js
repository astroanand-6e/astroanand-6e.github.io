import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIBLE_GAIN, barAndBeat, barOffset, beatAtSeconds, beatOffset, beatsBetween, beatsToMs, bpmGap, channel,
  channelGain, crossfadeGain, isOverlapping, phaseErrorMs, phraseOffset, phrasePos, phrasePosAtSeconds,
  secondsAtBeat,
} from './metrics.js';
import { capture, extrapolate } from './snapshot.js';
import { deckAt, mixerState, playingBoth, stateOf, withDeck, withMixer } from './testing/kit.js';

const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('beatsToMs converts beats at a tempo and rejects unusable input', () => {
  near(beatsToMs(1, 120), 500);
  near(beatsToMs(0.25, 128), 117.1875, 1e-3); // rounded to a microsecond
  assert.equal(beatsToMs(1, 0), Infinity);
  assert.equal(beatsToMs(NaN, 120), Infinity);
});

test('phaseErrorMs is |phaseOffset| x 60 / bpm x 1000 with deck 1 as the reference', () => {
  const state = withDeck(stateOf({ phaseOffset: -0.05 }), 0, { bpm: 120 });
  near(phaseErrorMs(state), 25);
  near(phaseErrorMs({ ...state, phaseOffset: 0 }), 0);
  assert.equal(phaseErrorMs({ ...state, phaseOffset: undefined }), Infinity);
});

test('bpmGap is the absolute difference of effective BPM', () => {
  const state = withDeck(withDeck(stateOf(), 0, { bpm: 124 }), 1, { bpm: 120.5 });
  near(bpmGap(state), 3.5);
});

test('phrasePos uses phraseBeat, and adds the fraction when it is reported as a whole number', () => {
  near(phrasePos({ phraseBeat: 12.4, beat: 76.4 }), 12.4);
  near(phrasePos({ phraseBeat: 12, beat: 76.4 }), 12.4);
  near(phrasePos({ phraseBeat: undefined, beat: 70.25 }), 6.25);
  assert.ok(Number.isNaN(phrasePos({})));
});

test('offsets are signed distances to the nearest phrase, bar and beat', () => {
  near(phraseOffset(0.3), 0.3);
  near(phraseOffset(31.8), -0.2);
  near(phraseOffset(16), 16);
  near(barOffset(65.2), 1.2);
  near(barOffset(66.5), -1.5);
  near(beatOffset(10.1), 0.1);
  near(beatOffset(10.9), -0.1);
});

test('beat and phrase maths follow a track position', () => {
  const deck = deckAt(64, { playing: true });
  near(beatAtSeconds(deck, 40), 80);
  near(beatsBetween(deck, 30, 32), 4);
  near(secondsAtBeat(deck, 72), 36);
  near(phrasePosAtSeconds(deck, 32), 0);
  near(phrasePosAtSeconds(deck, 33), 2);
  near(phrasePosAtSeconds(deck, 30), 28);
});

test('barAndBeat reports bar 17 beat 1 at beat 64 and beat 3 two beats later', () => {
  assert.deepEqual(barAndBeat(deckAt(64)), { bar: 17, beat: 1 });
  assert.deepEqual(barAndBeat(deckAt(66.4)), { bar: 17, beat: 3 });
});

test('channel reads [ch1, ch2] arrays and plain numbers', () => {
  assert.equal(channel({ low: [-1, 0.5] }, 'low', 1), 0.5);
  assert.equal(channel({ low: 0.2 }, 'low', 1), 0.2);
  assert.equal(channel(undefined, 'low', 0), undefined);
});

test('crossfadeGain is full on its own side and in the middle, silent on the far side', () => {
  assert.equal(crossfadeGain(0, 0), 1);
  assert.equal(crossfadeGain(0, 1), 1);
  assert.equal(crossfadeGain(-1, 0), 1);
  assert.equal(crossfadeGain(-1, 1), 0);
  assert.equal(crossfadeGain(1, 0), 0);
  near(crossfadeGain(0.5, 0), 0.5);
  near(crossfadeGain(-0.25, 1), 0.75);
});

test('channelGain multiplies the channel fader by the crossfader gain', () => {
  const mixer = mixerState({ fader: [0.8, 0.5], xfader: 0.5 });
  near(channelGain(mixer, 0), 0.4);
  near(channelGain(mixer, 1), 0.5);
});

test('isOverlapping needs both decks playing and both channels audible', () => {
  assert.equal(isOverlapping(playingBoth()), true);
  assert.equal(isOverlapping(withMixer(playingBoth(), { fader: [1, 0] })), false);
  assert.equal(isOverlapping(withMixer(playingBoth(), { xfader: 1 })), false);
  assert.equal(isOverlapping(withDeck(playingBoth(), 1, { playing: false })), false);
  assert.ok(AUDIBLE_GAIN > 0 && AUDIBLE_GAIN < 0.5);
});

test('capture copies state so later engine changes cannot reach it', () => {
  const live = stateOf();
  live.decks[0].hotCues[2] = 5;
  live.decks[0].loop = { start: 1, end: 2, beats: 4 };
  const copy = capture(live);
  live.decks[0].hotCues[2] = null;
  live.decks[0].loop.end = 99;
  live.mixer.low[1] = -1;
  assert.equal(copy.decks[0].hotCues[2], 5);
  assert.equal(copy.decks[0].loop.end, 2);
  assert.equal(copy.mixer.low[1], 0);
});

test('extrapolate runs playing decks forward and wraps loops', () => {
  const snapshot = capture(stateOf({ decks: [deckAt(64, { playing: true }), deckAt(64)] }));
  const later = extrapolate(snapshot, 0.5);
  near(later.decks[0].beat, 65);
  near(later.decks[0].phraseBeat, 1);
  near(later.decks[0].position, 32.5);
  assert.equal(later.decks[1].beat, 64, 'a paused deck stays put');
  assert.equal(extrapolate(snapshot, 0), snapshot);

  const looping = capture(stateOf({
    decks: [deckAt(64, { playing: true, loop: { start: 32, end: 34, beats: 4 } }), deckAt(0)],
  }));
  const inside = extrapolate(looping, 1.5);
  near(inside.decks[0].position, 33.5);
  const wrapped = extrapolate(looping, 2.5);
  near(wrapped.decks[0].position, 32.5);
  near(wrapped.decks[0].beat, 65);
});
