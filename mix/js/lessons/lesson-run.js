/**
 * Runs one lesson, step by step, without touching the DOM.
 *
 * It owns the contract traffic: 'focus' and 'highlight' when a step arms,
 * highlight cleared when the step is done or the lesson stops. The UI reads
 * view() every frame, calls tick() once per frame, and calls advance() when
 * Continue is pressed.
 *
 * status: 'idle' | 'busy' (setting up) | 'active' | 'done' | 'paused' | 'error' | 'finished'
 */
import { emit } from '../controls.js';
import { barAndBeat } from './metrics.js';
import { createSession } from './session.js';
import { createSetupApi } from './setup.js';
import { resolveText } from './text.js';

export const HINT_AFTER_S = 15;
export const SKIP_AFTER_S = 40;
export const AUTO_ADVANCE_S = 0.9;
export const SETTLE_MS = 150;

const realClock = Object.freeze({ now: () => performance.now() / 1000 });
const realWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FALLBACK_RESULT = Object.freeze({ stars: 1, lines: ['Level complete.'], rows: null });

const resolveHint = (hint, ctx) => (typeof hint === 'function' ? hint(ctx) : hint || null);

export function createLessonRun({ bus, engine, lesson, clock = realClock, wait = realWait }) {
  const api = createSetupApi({ bus, engine, wait });
  const completions = [];
  const listeners = new Set();
  let token = 0;
  let index = 0;
  let status = 'idle';
  let session = null;
  let stepText = '';
  let doneAt = 0;
  let result = null;
  let failure = null;

  const notify = () => listeners.forEach((listener) => listener());
  const clearHighlight = () => emit(bus, 'highlight', { ids: [] });
  const lastIndex = lesson.steps.length - 1;

  function disposeSession() {
    if (session) session.dispose();
    session = null;
  }

  function fail(error) {
    console.error(`Lesson "${lesson.id}" step ${index + 1} failed`, error);
    failure = error;
    status = 'error';
    notify();
  }

  async function armStep(stepIndex) {
    const mine = (token += 1);
    const step = lesson.steps[stepIndex];
    disposeSession();
    index = stepIndex;
    status = 'busy';
    stepText = '';
    failure = null;
    notify();
    try {
      await engine.ready;
      if (mine !== token) return;
      if (step.setup) await step.setup(api);
      if (mine !== token) return;
      await wait(SETTLE_MS);
      if (mine !== token) return;
      stepText = resolveText(step.text, engine.getState());
      session = createSession({ bus, engine, step, clock });
      session.tick();
    } catch (error) {
      if (mine === token) fail(error);
      return;
    }
    emit(bus, 'focus', { section: step.section });
    emit(bus, 'highlight', { ids: [...step.targets] });
    status = 'active';
    notify();
  }

  function finish() {
    disposeSession();
    clearHighlight();
    const ordered = lesson.steps.map((_, i) => completions[i] || null);
    try {
      result = lesson.score(ordered);
    } catch (error) {
      console.error(`Lesson "${lesson.id}" could not be scored`, error);
      result = FALLBACK_RESULT;
    }
    status = 'finished';
    notify();
  }

  /** Call once per animation frame while the step is on screen. */
  function tick() {
    if (!session || (status !== 'active' && status !== 'done')) return;
    const { completion } = session.tick();
    if (status === 'active' && completion) {
      completions[index] = completion;
      status = 'done';
      doneAt = clock.now();
      clearHighlight();
      notify();
    }
    if (status === 'done' && lesson.steps[index].autoAdvance && clock.now() - doneAt >= AUTO_ADVANCE_S) advance();
  }

  /** Continue: arms the next step, or scores the lesson after the last one. */
  function advance() {
    if (status !== 'done') return Promise.resolve();
    if (index < lastIndex) return armStep(index + 1);
    finish();
    return Promise.resolve();
  }

  /** Moves on without credit; only offered once the learner has been stuck a long while. */
  function skip() {
    const ctx = session && session.ctx();
    if (status !== 'active' || !ctx || ctx.elapsed < SKIP_AFTER_S) return Promise.resolve();
    completions[index] = null;
    clearHighlight();
    if (index < lastIndex) return armStep(index + 1);
    finish();
    return Promise.resolve();
  }

  function restart() {
    completions.length = 0;
    result = null;
    return armStep(0);
  }

  /** Free play took over: stop recording and clear the glow. A finished step stays finished. */
  function pause() {
    if (status === 'idle' || status === 'finished') return;
    token += 1;
    disposeSession();
    if (status !== 'done') status = 'paused';
    clearHighlight();
    notify();
  }

  function resume() {
    return status === 'paused' ? armStep(index) : Promise.resolve();
  }

  function dispose() {
    token += 1;
    disposeSession();
    clearHighlight();
    listeners.clear();
    status = 'idle';
  }

  function view() {
    const step = lesson.steps[index];
    const ctx = session && session.ctx();
    const elapsed = ctx ? ctx.elapsed : 0;
    const pulseDeck = ctx && Number.isInteger(step.pulse) ? ctx.state.decks[step.pulse] : null;
    return {
      lessonId: lesson.id,
      status,
      index,
      count: lesson.steps.length,
      isLast: index === lastIndex,
      text: stepText,
      targets: step.targets,
      section: step.section,
      hint: status === 'active' && ctx && elapsed >= HINT_AFTER_S ? resolveHint(step.hint, ctx) : null,
      readout: ctx && step.readout ? step.readout(ctx) : null,
      progress: ctx && step.progress ? step.progress(ctx) : null,
      beat: pulseDeck ? { ...barAndBeat(pulseDeck), playing: pulseDeck.playing } : null,
      canSkip: status === 'active' && elapsed >= SKIP_AFTER_S,
      error: failure ? String(failure.message || failure) : null,
    };
  }

  return {
    begin: () => armStep(0),
    tick,
    advance,
    skip,
    restart,
    pause,
    resume,
    dispose,
    view,
    result: () => result,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
