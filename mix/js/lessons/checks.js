/**
 * Queries over a step ctx, used by every done() and score().
 *
 * ctx = {
 *   state,    snapshot of engine.getState() now
 *   prev,     snapshot from the previous frame
 *   start,    snapshot from when the step began (after its setup)
 *   events,   [{ kind: 'control', id, value, source, t, abs, at }
 *              { kind: 'engine', type, deck, ..., t, abs, at }]
 *             t = seconds since the step began, abs = clock seconds, at = state
 *             just before the engine reacted. Setup moves (source 'lesson') are not recorded.
 *   samples,  [{ t, abs, at }] about every 100 ms
 *   elapsed   seconds since the step began
 * }
 */
import { isNum } from './util.js';

/** A control event the learner caused (not the lessons, not the engine echoing). */
export const isPlayerEvent = (event) =>
  event.kind === 'control' && event.source !== 'lesson' && event.source !== 'engine';

export const playerEvents = (ctx, id) =>
  ctx.events.filter((event) => isPlayerEvent(event) && event.id === id);

/** True when the learner pressed a button (value true). */
export const pressed = (ctx, id) => playerEvents(ctx, id).some((event) => event.value === true);

export const valuesOf = (ctx, id) => playerEvents(ctx, id).map((event) => event.value);

/** Total jog travel in turns, ignoring direction. */
export function jogTurns(ctx, id) {
  return playerEvents(ctx, id).reduce(
    (total, event) => total + (event.value && isNum(event.value.delta) ? Math.abs(event.value.delta) : 0),
    0,
  );
}

/**
 * The newest unbroken stretch of time (up to now) where pred(snapshot) holds,
 * oldest first. Empty when pred fails right now.
 */
export function trailingRun(ctx, pred) {
  if (!pred(ctx.state)) return [];
  const run = [{ t: ctx.elapsed, at: ctx.state }];
  for (let i = ctx.samples.length - 1; i >= 0; i -= 1) {
    if (!pred(ctx.samples[i].at)) break;
    run.push(ctx.samples[i]);
  }
  return run.reverse();
}

export function runSeconds(run) {
  return run.length < 2 ? 0 : run[run.length - 1].t - run[0].t;
}

/** The last `beats` beats of a run, by the deck's beat counter (the run's own end is the anchor). */
export function tailByBeats(run, beats, deckIndex = 0) {
  if (run.length === 0) return [];
  const end = run[run.length - 1].at.decks[deckIndex].beat;
  return run.filter((item) => item.at.decks[deckIndex].beat >= end - beats);
}

/** Seconds pred(snapshot) has held without a break, up to now. */
export const holdSeconds = (ctx, pred) => runSeconds(trailingRun(ctx, pred));

/** Beats the deck's counter advanced across a run. */
export function runBeats(run, deckIndex = 0) {
  if (run.length < 2) return 0;
  const gained = run[run.length - 1].at.decks[deckIndex].beat - run[0].at.decks[deckIndex].beat;
  return Math.max(0, gained);
}

/**
 * Last event on a control that moved across `threshold` in `direction`
 * ('up' or 'down'), starting from `startValue`. Null when it never did.
 */
export function lastCrossing(events, id, { threshold, direction, startValue }) {
  let previous = startValue;
  let found = null;
  for (const event of events) {
    if (!isPlayerEvent(event) || event.id !== id || !isNum(event.value)) continue;
    const up = previous < threshold && event.value >= threshold;
    const down = previous >= threshold && event.value < threshold;
    if ((direction === 'up' && up) || (direction === 'down' && down)) found = event;
    previous = event.value;
  }
  return found;
}

/**
 * Seconds a control took to travel from its low zone (<= lo) to hi, measured
 * from the last time it sat in the low zone. 0 for a jump, null if it never arrived.
 */
export function transitSeconds(events, id, { lo, hi }) {
  let from = null;
  for (const event of events) {
    if (!isPlayerEvent(event) || event.id !== id || !isNum(event.value)) continue;
    if (from === null || event.value <= lo) from = event.t;
    if (event.value >= hi) return event.t - from;
  }
  return null;
}

/**
 * First full excursion of a centered knob: it leaves the inner zone, reaches
 * the peak and comes back inside. Returns { leave, back } events or null.
 */
export function findExcursion(events, id, { inner, peak }) {
  let leave = null;
  let peaked = false;
  for (const event of events) {
    if (!isPlayerEvent(event) || event.id !== id || !isNum(event.value)) continue;
    const away = Math.abs(event.value);
    if (leave === null) {
      if (away > inner) {
        leave = event;
        peaked = away >= peak;
      }
      continue;
    }
    if (away >= peak) peaked = true;
    if (away <= inner) {
      if (peaked) return { leave, back: event };
      leave = null;
      peaked = false;
    }
  }
  return null;
}
