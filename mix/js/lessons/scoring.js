/**
 * Star rules shared by the lessons. A lesson's score(ctxs) returns
 *   { stars: 1..3, lines: [string, string?], rows?: [{ label, value, ok }] }
 * where ctxs holds one completion ctx per step (null for a skipped step).
 */
export const MAX_STARS = 3;

/** 3 stars at or under `three`, 2 at or under `two`, else 1. Lower values are better. */
export function starsLowerIsBetter(value, { three, two }) {
  if (!Number.isFinite(value)) return 1;
  if (value <= three) return 3;
  return value <= two ? 2 : 1;
}

/** 3 stars at or over `three`, 2 at or over `two`, else 1. Higher values are better. */
export function starsHigherIsBetter(value, { three, two }) {
  if (!Number.isFinite(value)) return 1;
  if (value >= three) return 3;
  return value >= two ? 2 : 1;
}

/** Seconds the learner spent across the steps of a lesson. */
export const totalSeconds = (ctxs) => ctxs.reduce((total, ctx) => total + ctx.elapsed, 0);

export const SKIPPED_LINE = 'You skipped a step, so this level keeps 1 star. Retry it to earn more.';

export function skippedResult() {
  return { stars: 1, lines: [SKIPPED_LINE], rows: null };
}

/** Wraps a score function so a skipped step caps the result at 1 star. */
export function guardSkips(score) {
  return (ctxs) => (ctxs.length === 0 || ctxs.some((ctx) => !ctx) ? skippedResult() : score(ctxs));
}
