/**
 * Keyboard use of the control that has focus: Enter or Space presses buttons, arrows move
 * knobs, faders, the switch and the encoder, Home and End jump to the ends. Arrows follow
 * what you see: on the tempo fader the cap travels down as the value rises.
 */
import { emitControl } from '../controls.js';
import { switchPositions } from './parts-analog.js';
import { partOf } from './parts-common.js';
import { clamp } from './svg.js';
import { snapDetent } from './values.js';

const STEP_FRACTION = 1 / 40;
const BIG_STEP_FACTOR = 5;
const JOG_KEY_TURNS = 0.02;
const JOG_KEY_TURNS_BIG = 0.06;
const PRESS_KEYS = Object.freeze(['Enter', ' ', 'Spacebar']);
const UP = 'ArrowUp';
const DOWN = 'ArrowDown';
const LEFT = 'ArrowLeft';
const RIGHT = 'ArrowRight';

/** +1 when the value rises with this key, -1 when it falls, 0 for other keys. */
function keyDirection(part, key) {
  const { control, spec } = part;
  const arrows = [UP, DOWN, LEFT, RIGHT];
  if (!arrows.includes(key)) return 0;
  if (control.kind === 'fader') {
    const rises = Math.sign(spec.travel[1] - spec.travel[0]);
    if (spec.axis === 'v') {
      if (key === RIGHT) return 1;
      if (key === LEFT) return -1;
      return (key === DOWN ? 1 : -1) * rises;
    }
    if (key === UP) return 1;
    if (key === DOWN) return -1;
    return (key === RIGHT ? 1 : -1) * rises;
  }
  if (control.kind === 'switch') return key === DOWN || key === RIGHT ? 1 : -1;
  return key === UP || key === RIGHT ? 1 : -1;
}

export function attachControlKeys({ svg, bus, parts, getValue }) {
  const held = new Set();
  const send = (id, value) => emitControl(bus, id, value, 'keyboard');

  function slide(part, event) {
    const { control } = part;
    const current = getValue(control.id) ?? control.value;
    let target = null;
    if (event.key === 'Home') target = control.min;
    else if (event.key === 'End') target = control.max;
    else {
      const direction = keyDirection(part, event.key) || (event.key === 'PageUp' ? 1 : event.key === 'PageDown' ? -1 : 0);
      if (!direction) return false;
      const big = event.shiftKey || event.key.startsWith('Page');
      const step = (control.max - control.min) * STEP_FRACTION * (big ? BIG_STEP_FACTOR : 1);
      target = clamp(current + direction * step, control.min, control.max);
    }
    const next = snapDetent(control, target);
    if (next !== current) send(control.id, next);
    return true;
  }

  function cycleSwitch(part, event) {
    const options = switchPositions(part.spec).map((p) => p.option);
    const index = Math.max(0, options.indexOf(getValue(part.control.id)));
    const cycle = PRESS_KEYS.includes(event.key);
    const direction = cycle ? 1 : keyDirection(part, event.key);
    if (!direction) return false;
    const next = cycle ? (index + 1) % options.length : clamp(index + direction, 0, options.length - 1);
    if (next !== index) send(part.control.id, options[next]);
    return true;
  }

  function turnEncoder(part, event) {
    if (![UP, DOWN, LEFT, RIGHT].includes(event.key)) return false;
    send(part.control.id, event.key === DOWN || event.key === RIGHT ? 1 : -1);
    return true;
  }

  function nudgeJog(part, event) {
    if (event.key !== LEFT && event.key !== RIGHT) return false;
    const turns = event.shiftKey ? JOG_KEY_TURNS_BIG : JOG_KEY_TURNS;
    send(part.control.id, { delta: event.key === RIGHT ? turns : -turns, touch: false });
    return true;
  }

  function press(part, event) {
    if (!PRESS_KEYS.includes(event.key)) return false;
    const { id, kind } = part.control;
    if (event.repeat) return true;
    if (kind === 'toggle') send(id, !getValue(id));
    else {
      held.add(id);
      send(id, true);
    }
    return true;
  }

  const HANDLERS = Object.freeze({
    button: press, toggle: press, knob: slide, fader: slide, switch: cycleSwitch, encoder: turnEncoder, jog: nudgeJog,
  });

  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const part = partOf(parts, event.target);
    if (!part || part.control.live === false) return;
    if (HANDLERS[part.control.kind]?.(part, event)) event.preventDefault();
  }

  function release(id) {
    if (!held.delete(id)) return;
    send(id, false);
  }

  svg.addEventListener('keydown', onKeyDown);
  svg.addEventListener('keyup', (event) => {
    const part = partOf(parts, event.target);
    if (part && PRESS_KEYS.includes(event.key)) release(part.control.id);
  });
  svg.addEventListener('focusout', (event) => {
    const part = partOf(parts, event.target);
    if (part) release(part.control.id);
  });
  return { releaseAll: () => [...held].forEach(release) };
}
