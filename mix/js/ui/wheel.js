/**
 * Mouse wheel and trackpad scrolling over a control: a notch moves a knob or fader a few
 * percent, steps the browse encoder, or nudges a jog wheel. Scrolling over bare chassis
 * still scrolls the page.
 */
import { clamp, roundTo } from './svg.js';
import { partOf } from './parts-common.js';
import { snapDetent } from './values.js';

const SWEEP_PX = 2200;
const LINE_PX = 16;
const ENCODER_STEP_PX = 60;
const JOG_TURNS_PER_PX = 1 / 3500;

function pixels(event) {
  return event.deltaMode === 1 ? event.deltaY * LINE_PX : event.deltaY;
}

export function attachWheel({ svg, parts, getValue, send, change }) {
  // The raw wheel position is kept apart from the snapped value, so a slow scroll
  // can climb out of the centre detent instead of snapping back each tick.
  const memory = { id: null, raw: 0, sent: null, encoder: 0 };

  function slide(part, delta) {
    const { control } = part;
    if (memory.id !== control.id || memory.sent !== getValue(control.id)) {
      Object.assign(memory, { id: control.id, raw: getValue(control.id) ?? control.value });
    }
    memory.raw = clamp(memory.raw + delta * (control.max - control.min), control.min, control.max);
    memory.sent = snapDetent(control, memory.raw);
    change(control, memory.sent);
  }

  function turnEncoder(part, amount) {
    memory.encoder += amount;
    const steps = Math.trunc(memory.encoder / ENCODER_STEP_PX);
    memory.encoder -= steps * ENCODER_STEP_PX;
    for (let i = 0; i < Math.abs(steps); i += 1) send(part.control.id, Math.sign(steps));
  }

  function onWheel(event) {
    const part = partOf(parts, event.target);
    if (!part || part.control.live === false) return;
    const amount = pixels(event);
    const { kind, id } = part.control;
    if (kind === 'knob' || kind === 'fader') slide(part, -amount / SWEEP_PX);
    else if (kind === 'encoder') turnEncoder(part, amount);
    else if (kind === 'jog') send(id, { delta: roundTo(amount * JOG_TURNS_PER_PX, 5), touch: false });
    else return;
    event.preventDefault();
  }

  svg.addEventListener('wheel', onWheel, { passive: false });
}
