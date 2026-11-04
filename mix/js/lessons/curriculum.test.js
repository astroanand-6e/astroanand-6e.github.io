import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROL_BY_ID, SECTIONS } from '../controls.js';
import {
  FINALE_ID, LESSONS, LESSON_IDS, MAX_TOTAL, UNITS, lessonAfter, lessonById, unitOf,
} from './curriculum.js';

const TOKEN = /\{(\w+)\}/g;
const KNOWN_TOKENS = ['bpm1', 'bpm2', 'phaseMs'];
const MAX_BLURB_CHARS = 70;

test('the course is 4 units and 9 lessons in the planned order', () => {
  assert.deepEqual(UNITS.map((unit) => unit.title), ['The deck', 'The mixer', 'Performance', 'Your first mix']);
  assert.deepEqual(UNITS.map((unit) => unit.lessons.length), [3, 3, 2, 1]);
  assert.deepEqual(LESSONS.map((lesson) => lesson.title), [
    'Play and cue', 'Tempo and sync', 'Nudge with the jog', 'Faders and crossfader', 'EQ',
    'The filter', 'Hot cues', 'Loops', 'The bass swap',
  ]);
  assert.deepEqual(LESSONS.map((lesson) => lesson.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(MAX_TOTAL, 27);
  assert.equal(FINALE_ID, 'the-bass-swap');
});

test('ids are unique and lookups work', () => {
  assert.equal(new Set(LESSON_IDS).size, LESSON_IDS.length);
  assert.equal(lessonById('eq').title, 'EQ');
  assert.equal(lessonById('nope'), null);
  assert.equal(lessonAfter('eq').id, 'the-filter');
  assert.equal(lessonAfter(FINALE_ID), null);
  assert.equal(unitOf(lessonById('loops')).id, 'performance');
});

test('every lesson has a title, a short blurb, a score function and at least 2 steps', () => {
  for (const lesson of LESSONS) {
    assert.ok(lesson.title.length > 0 && lesson.title.length <= 28, `${lesson.id} title`);
    assert.ok(lesson.blurb.length > 0 && lesson.blurb.length <= MAX_BLURB_CHARS, `${lesson.id} blurb`);
    assert.equal(typeof lesson.score, 'function');
    assert.ok(lesson.steps.length >= 2 && lesson.steps.length <= 4, `${lesson.id} has ${lesson.steps.length} steps`);
  }
});

test('every step has the documented shape', () => {
  for (const lesson of LESSONS) {
    lesson.steps.forEach((step, index) => {
      const where = `${lesson.id} step ${index + 1}`;
      assert.equal(typeof step.text, 'string', where);
      assert.ok(step.text.length > 20 && step.text.length <= 240, `${where} text length ${step.text.length}`);
      assert.ok(Array.isArray(step.targets) && step.targets.length > 0, where);
      step.targets.forEach((id) => assert.ok(CONTROL_BY_ID.has(id), `${where}: unknown control ${id}`));
      assert.ok(SECTIONS.includes(step.section), where);
      assert.equal(typeof step.done, 'function', where);
      for (const optional of ['setup', 'readout', 'progress']) {
        assert.ok(step[optional] === undefined || typeof step[optional] === 'function', `${where} ${optional}`);
      }
      assert.ok(step.hint === undefined || ['string', 'function'].includes(typeof step.hint), where);
      assert.ok(step.pulse === undefined || step.pulse === 0 || step.pulse === 1, where);
      assert.ok(step.autoAdvance === undefined || typeof step.autoAdvance === 'boolean', where);
    });
  }
});

test('text tokens are known, and every step that can leave a learner stuck has a hint', () => {
  for (const lesson of LESSONS) {
    lesson.steps.forEach((step, index) => {
      const tokens = [...step.text.matchAll(TOKEN)].map((match) => match[1]);
      tokens.forEach((token) => assert.ok(KNOWN_TOKENS.includes(token), `${lesson.id}: token {${token}}`));
      const listening = lesson.id === 'nudge-with-the-jog' && index === 0;
      if (!listening) assert.ok(step.hint, `${lesson.id} step ${index + 1} needs a hint`);
    });
  }
});

test('each lesson names its section to match where the action is', () => {
  const sectionsOf = (id) => lessonById(id).steps.map((step) => step.section);
  assert.deepEqual(sectionsOf('play-and-cue'), ['deck1', 'deck1', 'deck1']);
  assert.deepEqual(sectionsOf('tempo-and-sync'), ['deck2', 'deck2', 'deck2']);
  assert.deepEqual(sectionsOf('faders-and-crossfader'), ['mixer', 'mixer', 'mixer']);
  assert.deepEqual(sectionsOf('hot-cues'), ['deck1', 'deck1', 'deck1', 'deck1']);
  assert.deepEqual(sectionsOf('the-bass-swap'), ['mixer', 'mixer', 'mixer']);
});

test('the finale is the last lesson and the only one in its unit', () => {
  assert.equal(LESSONS.at(-1).id, FINALE_ID);
  assert.equal(unitOf(LESSONS.at(-1)).lessons.length, 1);
});
