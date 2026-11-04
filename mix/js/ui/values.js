/** Number helpers shared by the pointer, wheel and keyboard code. */
import { roundTo } from './svg.js';

const DETENT_SNAP = 0.02;

/** Snaps to the control's detent when within 2% of its range, otherwise rounds the noise off. */
export function snapDetent(control, value) {
  const range = control.max - control.min;
  if (control.detent !== undefined && Math.abs(value - control.detent) < DETENT_SNAP * range) return control.detent;
  return roundTo(value);
}

/** Position of a value inside the control's range, 0..1. */
export function unit(control, value) {
  return (value - control.min) / (control.max - control.min);
}
