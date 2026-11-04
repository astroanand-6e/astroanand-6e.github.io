/** Small numeric helpers shared across the lessons. All pure. */

/** Offsets and times are rounded here so float noise cannot flip a star at an exact threshold. */
const NOISE_DIGITS = 6;

export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** Positive modulo: mod(-1, 4) is 3. */
export const mod = (value, period) => ((value % period) + period) % period;

export const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

export const sum = (values) => values.reduce((total, value) => total + value, 0);

export const mean = (values) => (values.length ? sum(values) / values.length : NaN);

export const maxOf = (values) => values.reduce((top, value) => Math.max(top, value), -Infinity);

export const last = (items) => items[items.length - 1];

export function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Signed distance from `value` to the nearest multiple of `period`,
 * in (-period / 2, period / 2]. Positive means just after the multiple.
 */
export function nearestOffset(value, period) {
  const remainder = mod(value, period);
  return round(remainder <= period / 2 ? remainder : remainder - period, NOISE_DIGITS);
}
