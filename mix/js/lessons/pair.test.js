import test from 'node:test';
import assert from 'node:assert/strict';
import { keyPenalty, planPair } from './pair.js';
import { faderForBpm, readControl } from './setup.js';
import { DEMO_TRACKS } from './testing/fake-engine.js';
import { deckAt, mixerState, stateOf, withDeck } from './testing/kit.js';

const track = (id, bpm, camelot) => ({ id, title: id, artist: 'x', bpm, key: camelot, camelot, duration: 200 });

test('keyPenalty is 0 for the same or relative key and grows with distance on the wheel', () => {
  assert.equal(keyPenalty({ camelot: '8A' }, { camelot: '8A' }), 0);
  assert.equal(keyPenalty({ camelot: '8A' }, { camelot: '8B' }), 0);
  assert.equal(keyPenalty({ camelot: '8A' }, { camelot: '9A' }), 0.5);
  assert.equal(keyPenalty({ camelot: '12A' }, { camelot: '1A' }), 0.5, 'the wheel wraps');
  assert.equal(keyPenalty({ camelot: '8A' }, { camelot: '3A' }), 2);
  assert.equal(keyPenalty({ camelot: '8A' }, { camelot: '9B' }), 2);
  assert.equal(keyPenalty({ camelot: '8A' }, {}), 1);
});

test('planPair picks a gap close to the wanted one that the tempo fader can reach', () => {
  const tracks = [track('a', 124, '8A'), track('b', 120, '8A'), track('c', 128, '8A'), track('d', 90, '8A')];
  const pair = planPair(tracks, { minGapBpm: 2, wantGapBpm: 4 });
  assert.equal(pair.forced, false);
  assert.equal(pair.gap, 4);
  assert.notEqual(pair.a, 3, 'a 90 BPM track is out of reach');
  assert.notEqual(pair.b, 3);
});

test('planPair prefers friendly keys when the gaps are equal', () => {
  const tracks = [track('a', 124, '8A'), track('b', 120, '3A'), track('c', 120, '9A')];
  const pair = planPair(tracks, { minGapBpm: 2, wantGapBpm: 4 });
  assert.deepEqual([pair.a, pair.b], [0, 2]);
});

test('planPair with no wanted gap lets a mix level take the closest tempos', () => {
  const pair = planPair(DEMO_TRACKS, {});
  assert.equal(pair.forced, false);
  assert.ok(pair.gap <= 4);
});

test('planPair puts one track on both decks when nothing fits', () => {
  const far = [track('a', 80, '8A'), track('b', 170, '8A')];
  assert.deepEqual(planPair(far, { minGapBpm: 2 }), { a: 0, b: 0, gap: 0, forced: true });
  assert.deepEqual(planPair([track('only', 120, '8A')]), { a: 0, b: 0, gap: 0, forced: true });
  assert.throws(() => planPair([]), /no tracks/);
});

test('faderForBpm maps a target tempo onto the -1..1 fader and clamps', () => {
  assert.equal(faderForBpm(120, 120), 0);
  assert.ok(Math.abs(faderForBpm(124.8, 120) - 0.5) < 1e-9);
  assert.ok(Math.abs(faderForBpm(115.2, 120) - -0.5) < 1e-9);
  assert.equal(faderForBpm(200, 120), 1);
  assert.equal(faderForBpm(60, 120), -1);
});

test('readControl reads the values lessons ensure, and nothing else', () => {
  const state = withDeck(stateOf({ mixer: mixerState({ low: [0, -1], fader: [1, 0.4], xfader: 0.3, master: 0.8 }) }), 1, { tempo: 0.25 });
  assert.equal(readControl(state, 'm.low2'), -1);
  assert.equal(readControl(state, 'm.fader2'), 0.4);
  assert.equal(readControl(state, 'm.xfader'), 0.3);
  assert.equal(readControl(state, 'm.master'), 0.8);
  assert.equal(readControl(state, 'd2.tempo'), 0.25);
  assert.equal(readControl(state, 'd1.play'), undefined);
  assert.ok(deckAt(0));
});
