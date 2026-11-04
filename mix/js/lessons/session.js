/**
 * One armed step: records what the learner does and asks step.done(ctx) once per tick.
 *
 * It listens on the bus for 'control' and 'engine' events. Setup moves
 * (source 'lesson') are dropped so only the learner's own actions count.
 * Each recorded event carries `at`, the state just before the engine reacted:
 * the engine hears a button before we do, so its post-press state would hide
 * the beat the learner actually pressed on. `at` is the last frame's snapshot,
 * run forward to the event's time.
 */
import { on } from '../controls.js';
import { SETUP_SOURCE } from './setup.js';
import { capture, extrapolate } from './snapshot.js';

export const SAMPLE_INTERVAL_S = 0.1;
/** Half a frame at 60 fps, so a sample lands on the 6th frame rather than waiting for the 7th. */
const SAMPLE_SLACK_S = 0.008;
const MAX_SAMPLES = 1500;
const MAX_EVENTS = 4000;
/** A frame older than this is stale (hidden tab, test): read the engine instead of guessing. */
const MAX_EXTRAPOLATE_S = 0.25;

export function createSession({ bus, engine, step, clock }) {
  const startAbs = clock.now();
  const start = capture(engine.getState());
  const events = [];
  const samples = [];
  let frame = { abs: startAbs, at: start };
  let prev = start;
  let lastSampleAbs = -Infinity;
  let latest = null;
  let completion = null;

  function stateJustBefore(abs) {
    const age = abs - frame.abs;
    if (age > MAX_EXTRAPOLATE_S) return capture(engine.getState());
    return extrapolate(frame.at, age);
  }

  function record(kind, detail) {
    const abs = clock.now();
    events.push({ kind, ...detail, t: abs - startAbs, abs, at: stateJustBefore(abs) });
    if (events.length > MAX_EVENTS) events.shift();
  }

  const stopListening = [
    on(bus, 'control', (detail) => {
      if (detail.source === SETUP_SOURCE) return;
      record('control', { id: detail.id, value: detail.value, source: detail.source });
    }),
    on(bus, 'engine', (detail) => record('engine', detail)),
  ];

  /** Reads the engine once, evaluates done(), and returns { ctx, completion }. */
  function tick() {
    const abs = clock.now();
    const state = capture(engine.getState());
    frame = { abs, at: state };
    if (abs - lastSampleAbs >= SAMPLE_INTERVAL_S - SAMPLE_SLACK_S) {
      samples.push({ t: abs - startAbs, abs, at: state });
      lastSampleAbs = abs;
      if (samples.length > MAX_SAMPLES) samples.shift();
    }
    const ctx = { state, prev, start, events, samples, elapsed: abs - startAbs };
    prev = state;
    latest = ctx;
    if (!completion && step.done(ctx)) {
      completion = { ...ctx, events: events.slice(), samples: samples.slice() };
    }
    return { ctx, completion };
  }

  return {
    tick,
    ctx: () => latest,
    completion: () => completion,
    dispose: () => stopListening.forEach((stop) => stop()),
  };
}
