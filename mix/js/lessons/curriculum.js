/**
 * The curriculum: units, then lessons, then steps (data plus pure done() and score()).
 *
 * Step: { text, targets, section, setup?, done, autoAdvance?, hint?, readout?, progress?, pulse? }
 *   text      string with {bpm1} {bpm2} {phaseMs} tokens, or (state) => string
 *   targets   control ids the controller rings; section is the part it zooms to
 *   setup     (api) => void | Promise: puts decks and mixer in a known state first
 *   done      (ctx) => boolean, a pure function of the ctx (see checks.js)
 *   hint      string or (ctx) => string, shown after about 15 s without success
 *   readout   (ctx) => string shown live under the text; progress (ctx) => 0..1 for hold steps
 *   pulse     deck index whose beat dots to show (timing steps)
 * Lesson: { id, title, blurb, steps, score(ctxs) }, numbered 1 to 9 here.
 */
import { DECK_UNIT } from './unit1-deck.js';
import { MIXER_UNIT } from './unit2-mixer.js';
import { PERFORMANCE_UNIT } from './unit3-performance.js';
import { MIX_UNIT } from './unit4-mix.js';
import { MAX_STARS } from './scoring.js';

const RAW_UNITS = [DECK_UNIT, MIXER_UNIT, PERFORMANCE_UNIT, MIX_UNIT];

/** Lessons before each unit, so numbers run 1 to 9 across the units. */
const lessonsBefore = (unitIndex) =>
  RAW_UNITS.slice(0, unitIndex).reduce((total, unit) => total + unit.lessons.length, 0);

export const UNITS = Object.freeze(
  RAW_UNITS.map((unit, unitIndex) =>
    Object.freeze({
      ...unit,
      number: unitIndex + 1,
      lessons: Object.freeze(
        unit.lessons.map((lesson, i) =>
          Object.freeze({ ...lesson, number: lessonsBefore(unitIndex) + i + 1, unitId: unit.id }),
        ),
      ),
    }),
  ),
);

export const LESSONS = Object.freeze(UNITS.flatMap((unit) => unit.lessons));
export const LESSON_IDS = Object.freeze(LESSONS.map((lesson) => lesson.id));
export const MAX_TOTAL = LESSONS.length * MAX_STARS;
export const FINALE_ID = LESSONS[LESSONS.length - 1].id;

export const lessonById = (id) => LESSONS.find((lesson) => lesson.id === id) || null;
export const lessonAfter = (id) => LESSONS[LESSONS.findIndex((lesson) => lesson.id === id) + 1] || null;
export const unitOf = (lesson) => UNITS.find((unit) => unit.id === lesson.unitId);
