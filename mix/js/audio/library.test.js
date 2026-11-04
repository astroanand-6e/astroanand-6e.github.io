import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary } from './library.js';
import { runSliced } from './schedule.js';

test('ensure renders once and shares the work between concurrent callers', async () => {
  const library = createLibrary();
  const [a, b] = await Promise.all([library.ensure('night-bus'), library.ensure('night-bus')]);
  assert.equal(a, b);
  assert.equal(library.isRendered('night-bus'), true);
  assert.equal(library.get('night-bus'), a);
  assert.equal(await library.ensure('night-bus'), a);
  assert.equal(a.info.title, 'Night Bus');
  assert.equal(a.buffer.sampleRate, 32000);
  assert.equal(a.buffer.length, Math.round((64 * 4 * 60 / 120) * 32000));
});

test('unrendered tracks report no record and a placeholder waveform', () => {
  const library = createLibrary();
  assert.equal(library.get('paper-tiger'), null);
  assert.equal(library.isRendered('paper-tiger'), false);
  const wave = library.waveform('paper-tiger');
  assert.equal(wave.pending, true);
  assert.ok(wave.low.length > 12000);
});

test('rendered records are frozen and carry a real waveform', async () => {
  const library = createLibrary();
  const record = await library.ensure('night-bus');
  assert.throws(() => { 'use strict'; record.info = null; }, TypeError);
  const wave = library.waveform('night-bus');
  assert.notEqual(wave.pending, true);
  assert.equal(wave.binSeconds, 0.01);
  assert.ok(wave.low.some((v) => v > 0.9));
});

test('an unknown track id is an error', async () => {
  const library = createLibrary();
  await assert.rejects(library.ensure('nope'), /Unknown track id/);
});

test('runSliced yields to the event loop and returns the generator result', async () => {
  function* work() {
    for (let i = 0; i < 5; i += 1) {
      const until = performance.now() + 3;
      while (performance.now() < until);
      yield i;
    }
    return 'done';
  }
  let turns = 0;
  const timer = setInterval(() => { turns += 1; }, 1);
  const result = await runSliced(work(), { sliceMs: 2, idleMs: 2 });
  clearInterval(timer);
  assert.equal(result, 'done');
  assert.ok(turns >= 1, 'the event loop got a turn while the generator ran');
});
