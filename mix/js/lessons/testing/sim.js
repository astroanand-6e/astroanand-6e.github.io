/**
 * Deterministic simulation for lesson tests: a manual clock, a bus, the fake
 * engine and a "learner" that presses buttons and drags knobs as a pointer.
 * Time only moves when the test says so, in 1/60 s frames, and each frame
 * calls the registered frame hooks (a lesson run's tick).
 */
import { BEATS_PER_BAR, PHRASE_BEATS, createBus, emitControl } from '../../controls.js';
import { mod } from '../util.js';
import { createFakeEngine } from './fake-engine.js';

const FRAME_S = 1 / 60;
const FLOAT_SLACK = 1e-9;
const DEFAULT_TIMEOUT_S = 180;
const PRESS_HOLD_S = 0.06;
const LEARNER = 'pointer';

export function createSim({ tracks, quantize } = {}) {
  let nowSeconds = 1000;
  const clock = { now: () => nowSeconds };
  const bus = createBus();
  const engine = createFakeEngine({ bus, tracks, clock, quantize });
  const frameHooks = new Set();

  function advance(seconds) {
    let left = seconds;
    while (left > FLOAT_SLACK) {
      const dt = Math.min(FRAME_S, left);
      nowSeconds += dt;
      left -= dt;
      frameHooks.forEach((hook) => hook());
    }
  }

  const send = (id, value) => emitControl(bus, id, value, LEARNER);

  /** Runs frames until pred() is true; throws when it takes longer than timeoutS. */
  function until(pred, timeoutS = DEFAULT_TIMEOUT_S) {
    for (let waited = 0; !pred(); waited += FRAME_S) {
      if (waited > timeoutS) throw new Error('Timed out waiting for the condition');
      advance(FRAME_S);
    }
  }

  const deckBeat = (deckIndex) => engine.getState().decks[deckIndex].beat;

  /** Runs frames until a quantity that grows steadily drops (it wrapped around or jumped back). */
  function untilWraps(read) {
    let previous = read();
    until(() => {
      const current = read();
      const wrapped = current < previous;
      previous = current;
      return wrapped;
    });
  }

  const learner = {
    press(id, holdSeconds = PRESS_HOLD_S) {
      send(id, true);
      advance(holdSeconds);
      send(id, false);
    },
    set: (id, value) => send(id, value),
    /** Moves a knob or fader smoothly from one value to another. */
    drag(id, from, to, seconds) {
      const steps = Math.max(1, Math.round(seconds / FRAME_S));
      for (let i = 1; i <= steps; i += 1) {
        send(id, from + ((to - from) * i) / steps);
        advance(FRAME_S);
      }
    },
    /** Turns the jog by `turns` in total over `seconds`. */
    jog(id, turns, seconds) {
      const steps = Math.max(1, Math.round(seconds / FRAME_S));
      for (let i = 0; i < steps; i += 1) {
        send(id, { delta: turns / steps, touch: false });
        advance(FRAME_S);
      }
    },
    /** Waits until a deck's counter passes `beat` (a float on the track's grid). */
    untilBeat(deckIndex, beat) {
      until(() => engine.getState().decks[deckIndex].beat >= beat);
    },
    /** Waits until the deck's counter next crosses a whole beat. */
    untilNextBeat: (deckIndex) => untilWraps(() => mod(deckBeat(deckIndex), 1)),
    /** Waits until the deck's counter next crosses a bar line. */
    untilBar: (deckIndex) => untilWraps(() => mod(deckBeat(deckIndex), BEATS_PER_BAR)),
    /** Waits until the deck's phrase position next passes `target` (0..32; 0 is the phrase start). */
    untilPhrase: (deckIndex, target) =>
      untilWraps(() => mod(engine.getState().decks[deckIndex].phraseBeat - target, PHRASE_BEATS)),
    /** Waits until the deck's loop restarts (its position jumps back). */
    untilLoopWrap: (deckIndex) => untilWraps(() => engine.getState().decks[deckIndex].position),
  };

  return {
    clock,
    bus,
    engine,
    learner,
    advance,
    until,
    wait: (ms) => {
      advance(ms / 1000);
      return Promise.resolve();
    },
    onFrame(hook) {
      frameHooks.add(hook);
      return () => frameHooks.delete(hook);
    },
  };
}
