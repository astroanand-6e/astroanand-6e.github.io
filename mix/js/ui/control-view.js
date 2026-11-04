/**
 * Moves the unit for control events from any source (the player, the keyboard, a lesson)
 * and keeps the latest value of every control. Lesson and engine moves ease in; the
 * player's own moves land at once, and show a small readout while they are in progress.
 */
import { CONTROLS } from '../controls.js';
import { formatValue } from './format.js';

const ANALOG_KINDS = Object.freeze(['knob', 'fader', 'switch']);
const EASED_SOURCES = Object.freeze(['lesson', 'engine']);
const PLAYER_SOURCES = Object.freeze(['pointer', 'keyboard']);
const READOUT_GAP = 3.2;

function initialValues() {
  const values = new Map();
  for (const control of CONTROLS) {
    if (control.kind === 'button') values.set(control.id, false);
    else if (control.value !== undefined) values.set(control.id, control.value);
  }
  return values;
}

function readoutAnchor({ ring, spec }) {
  const half = ring.shape === 'circle' ? ring.r : ring.h / 2;
  return [spec.x, spec.y - half - READOUT_GAP];
}

export function createControlView({ parts, readout }) {
  const values = initialValues();
  const moving = new Set();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  for (const part of parts.values()) {
    if (ANALOG_KINDS.includes(part.control.kind)) part.apply(part.control.value, false);
  }

  return {
    getValue: (id) => values.get(id),

    onControl({ id, value, source }) {
      const part = parts.get(id);
      if (!part) return;
      const { control } = part;
      // Encoder values are steps and jog values are turns: neither is a position to remember.
      if (control.kind !== 'encoder' && control.kind !== 'jog') values.set(id, value);
      const eased = EASED_SOURCES.includes(source) && !reducedMotion.matches;
      if (part.apply(value, eased)) moving.add(part);
      if (control.kind === 'toggle') part.light(value ? 1 : 0);
      if (ANALOG_KINDS.includes(control.kind) && PLAYER_SOURCES.includes(source)) {
        const [x, y] = readoutAnchor(part);
        readout.show(x, y, formatValue(control, value));
      }
    },

    /** Advances eased knobs and faders; call once per frame. */
    tick(dtMs) {
      for (const part of [...moving]) if (!part.tick(dtMs)) moving.delete(part);
    },
  };
}
