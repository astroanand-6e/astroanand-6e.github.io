/**
 * Try the decks, lessons entry point: mountLessons(host, { bus, engine }) -> { dispose }.
 *
 * Draws into `host` (the #lesson element): the home view (units, stars, Free play), then a
 * lesson one step at a time, then a result card. Talks to the rest of the page only through
 * the contract in ../controls.js: it asks the controller to ring controls ('highlight') and
 * zoom ('focus'), asks for free play with 'mode', and pauses while the page is in free play.
 * Stars live in localStorage under 'mix.progress.v1' (every access guarded).
 *
 * Optional extras for tests and dev pages: storage, clock, wait, frames.
 */
import { emit, on } from '../controls.js';
import {
  FINALE_ID, LESSON_IDS, MAX_TOTAL, UNITS, lessonAfter, unitOf,
} from './curriculum.js';
import { createLessonRun } from './lesson-run.js';
import {
  isOpen, loadProgress, saveProgress, starsOf, totalStars, withOpened, withResult,
} from './progress.js';
import { h } from './ui/dom.js';
import { renderHome } from './ui/home.js';
import { renderResult } from './ui/result.js';
import { createStepView } from './ui/step.js';

const browserFrames = Object.freeze({
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
});

export function mountLessons(host, { bus, engine, storage, clock, wait, frames = browserFrames } = {}) {
  const storageOptions = storage === undefined ? {} : { storage };
  let progress = loadProgress(LESSON_IDS, storageOptions);
  let run = null;
  let stepView = null;
  let lesson = null;
  let frameId = 0;
  let paused = false;

  const totalNow = () => totalStars(progress, LESSON_IDS);

  function show(node) {
    const hadFocus = host.contains(document.activeElement);
    host.replaceChildren(node);
    if (hadFocus && node.tabIndex === -1) node.focus({ preventScroll: true });
  }

  function stopLoop() {
    if (frameId) frames.cancel(frameId);
    frameId = 0;
  }

  function teardownRun() {
    stopLoop();
    if (run) run.dispose();
    run = null;
    stepView = null;
  }

  /** Audio needs a gesture; opening a level is one. The page's own gate does the same on first touch. */
  function wakeAudio() {
    try {
      Promise.resolve(engine.resume()).catch((error) => console.warn('lessons: audio did not resume', error));
    } catch (error) {
      console.warn('lessons: audio did not resume', error);
    }
  }

  const goFree = () => emit(bus, 'mode', { mode: 'free' });

  function showProblem(error) {
    console.error('lessons: something went wrong', error);
    teardownRun();
    show(h(
      'div',
      { class: 'lz lz-problem', role: 'alert' },
      h('p', { class: 'lz-text', text: 'The lesson hit a problem. Go back to the levels and try again.' }),
      h('button', { class: 'lz-btn', type: 'button', text: 'All levels', onClick: () => guarded(showHome)() }),
    ));
  }

  function guarded(action) {
    return (...args) => {
      try {
        return action(...args);
      } catch (error) {
        return showProblem(error);
      }
    };
  }

  function loop() {
    if (!run) return;
    run.tick();
    const view = run.view();
    stepView.update(view);
    if (view.status === 'finished') {
      finishLesson();
      return;
    }
    frameId = frames.request(guarded(loop));
  }

  function startLoop() {
    stopLoop();
    frameId = frames.request(guarded(loop));
  }

  function startLesson(target, { skipped = false } = {}) {
    teardownRun();
    if (skipped) {
      progress = withOpened(progress, target.id);
      saveProgress(progress, storageOptions);
    }
    lesson = target;
    wakeAudio();
    run = createLessonRun({ bus, engine, lesson: target, clock, wait });
    stepView = createStepView({
      lesson: target,
      unit: unitOf(target),
      onBack: guarded(showHome),
      onRestart: () => run.restart(),
      onContinue: () => run.advance(),
      onSkipStep: () => run.skip(),
    });
    show(stepView.el);
    stepView.update(run.view());
    const view = stepView;
    const current = run;
    current.onChange(() => view.update(current.view()));
    run.begin();
    if (!paused) startLoop();
  }

  function finishLesson() {
    const result = run.result();
    const previousBest = starsOf(progress, lesson.id);
    const finished = lesson;
    const next = lessonAfter(finished.id);
    progress = withResult(progress, finished.id, result.stars);
    saveProgress(progress, storageOptions);
    teardownRun();
    show(renderResult({
      lesson: finished,
      unit: unitOf(finished),
      result,
      previousBest,
      total: totalNow(),
      max: MAX_TOTAL,
      next,
      isFinale: finished.id === FINALE_ID,
      onRetry: guarded(() => startLesson(finished)),
      onNext: guarded(() => startLesson(next)),
      onHome: guarded(showHome),
      onFree: goFree,
    }));
  }

  function showHome() {
    teardownRun();
    show(renderHome({
      units: UNITS,
      starsOf: (id) => starsOf(progress, id),
      isOpen: (candidate) => isOpen(progress, LESSON_IDS, LESSON_IDS.indexOf(candidate.id)),
      total: totalNow(),
      max: MAX_TOTAL,
      onStart: guarded((candidate) => startLesson(candidate)),
      onSkip: guarded((candidate) => startLesson(candidate, { skipped: true })),
      onFree: goFree,
    }));
  }

  /** The page switches tabs and tells us; free play must not count as lesson play. */
  const stopListening = on(bus, 'mode', ({ mode }) => {
    if (mode === 'free') {
      paused = true;
      stopLoop();
      if (run) run.pause();
    } else if (mode === 'lessons' && paused) {
      paused = false;
      if (run) {
        run.resume();
        startLoop();
      }
    }
  });

  showHome();

  return {
    dispose() {
      stopListening();
      teardownRun();
      host.replaceChildren();
    },
  };
}
