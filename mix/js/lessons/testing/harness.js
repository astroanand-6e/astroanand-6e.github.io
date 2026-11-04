/**
 * Plays a lesson against the simulated engine. Records the contract traffic
 * ('highlight', 'focus') so tests can check what the controller would see.
 * Setup is async, so waits here flush pending promises between frames.
 */
import { on } from '../../controls.js';
import { lessonById } from '../curriculum.js';
import { createLessonRun } from '../lesson-run.js';
import { createSim } from './sim.js';

const FRAME_S = 1 / 60;
const MAX_FRAMES = 60000;
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Creates the sim and a lesson run, arms the first step, and returns the handles. */
export async function startLesson(id, simOptions) {
  const sim = createSim(simOptions);
  const run = createLessonRun({
    bus: sim.bus, engine: sim.engine, lesson: lessonById(id), clock: sim.clock, wait: sim.wait,
  });
  sim.onFrame(run.tick);
  const traffic = { highlights: [], focuses: [] };
  on(sim.bus, 'highlight', ({ ids }) => traffic.highlights.push(ids));
  on(sim.bus, 'focus', ({ section }) => traffic.focuses.push(section));
  await run.begin();
  return { sim, run, learner: sim.learner, traffic, state: () => sim.engine.getState() };
}

/** Runs frames until pred() holds, letting async setup finish between frames. */
export async function settle(handle, pred, what = 'the condition') {
  for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
    if (pred()) return;
    handle.sim.advance(FRAME_S);
    await flush();
  }
  throw new Error(`Timed out waiting for ${what}`);
}

export const statusOf = (handle) => handle.run.view().status;

/** Waits for the current step to be done, presses Continue (or lets it auto-advance), and waits for the next. */
export async function proceed(handle) {
  const before = handle.run.view().index;
  await settle(handle, () => {
    const view = handle.run.view();
    return view.status === 'done' || view.status === 'finished' || view.index !== before;
  }, 'the step to finish');
  if (statusOf(handle) === 'done') await handle.run.advance();
  await settle(handle, () => ['active', 'finished', 'error'].includes(statusOf(handle)), 'the next step to arm');
}
