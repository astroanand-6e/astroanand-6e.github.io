import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, emptyProgress, isOpen, loadProgress, saveProgress, starsOf, totalStars, withOpened, withResult,
} from './progress.js';

const IDS = ['one', 'two', 'three'];
const quiet = () => {};

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
  };
}

const brokenStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('full'); },
};

test('progress starts empty and loads nothing from missing or broken storage', () => {
  assert.deepEqual(loadProgress(IDS, { storage: null }), emptyProgress());
  assert.deepEqual(loadProgress(IDS, { storage: memoryStorage() }), emptyProgress());
  assert.deepEqual(loadProgress(IDS, { storage: brokenStorage, warn: quiet }), emptyProgress());
});

test('save then load round-trips stars and opened levels', () => {
  const storage = memoryStorage();
  const progress = withOpened(withResult(withResult(emptyProgress(), 'one', 3), 'two', 2), 'three');
  assert.equal(saveProgress(progress, { storage }), true);
  assert.ok(STORAGE_KEY in storage.data);
  assert.equal(STORAGE_KEY, 'mix.progress.v1');
  assert.deepEqual(loadProgress(IDS, { storage }), progress);
});

test('saving reports failure instead of throwing when storage refuses', () => {
  assert.equal(saveProgress(emptyProgress(), { storage: brokenStorage, warn: quiet }), false);
  assert.equal(saveProgress(emptyProgress(), { storage: null }), false);
});

test('junk in storage is dropped: bad JSON, wrong version, unknown ids, out of range stars', () => {
  assert.deepEqual(loadProgress(IDS, { storage: memoryStorage({ [STORAGE_KEY]: '{nope' }), warn: quiet }), emptyProgress());
  assert.deepEqual(loadProgress(IDS, { storage: memoryStorage({ [STORAGE_KEY]: JSON.stringify({ v: 9, stars: { one: 3 } }) }) }), emptyProgress());
  const messy = JSON.stringify({ v: 1, stars: { one: 7, two: 2, ghost: 3, three: 1.5 }, opened: { three: true, ghost: true, one: 'yes' } });
  assert.deepEqual(loadProgress(IDS, { storage: memoryStorage({ [STORAGE_KEY]: messy }) }), {
    v: 1, stars: { two: 2 }, opened: { three: true },
  });
});

test('withResult keeps the best stars and never mutates', () => {
  const start = emptyProgress();
  const first = withResult(start, 'one', 2);
  assert.equal(starsOf(start, 'one'), 0);
  assert.equal(starsOf(first, 'one'), 2);
  assert.equal(starsOf(withResult(first, 'one', 1), 'one'), 2, 'a worse run keeps the best');
  assert.equal(starsOf(withResult(first, 'one', 3), 'one'), 3);
  assert.equal(starsOf(withResult(first, 'one', 9), 'one'), 3, 'clamped to 3');
  assert.equal(withResult(start, 'one', 0), start, 'nothing earned, nothing stored');
});

test('totalStars sums stars over the known levels', () => {
  const progress = withResult(withResult(emptyProgress(), 'one', 3), 'three', 2);
  assert.equal(totalStars(progress, IDS), 5);
  assert.equal(totalStars(emptyProgress(), IDS), 0);
});

test('levels open in order, and skip ahead opens one level for good', () => {
  const none = emptyProgress();
  assert.equal(isOpen(none, IDS, 0), true);
  assert.equal(isOpen(none, IDS, 1), false);
  assert.equal(isOpen(none, IDS, 2), false);
  const afterOne = withResult(none, 'one', 1);
  assert.equal(isOpen(afterOne, IDS, 1), true);
  assert.equal(isOpen(afterOne, IDS, 2), false);
  const skipped = withOpened(none, 'three');
  assert.equal(isOpen(skipped, IDS, 2), true);
  assert.equal(isOpen(skipped, IDS, 1), false, 'skipping to the last level does not open the middle one');
  assert.equal(withOpened(skipped, 'three'), skipped);
});
