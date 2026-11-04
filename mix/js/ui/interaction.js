/**
 * Pointer and touch input for the controller. One listener set on the SVG; each press
 * becomes a session keyed by pointer id, so two fingers can work two controls at once.
 * Sessions only emit control events; the visuals follow the bus. Wheel input lives in
 * wheel.js, keyboard input in control-keys.js and keymap.js.
 */
import { emitControl } from '../controls.js';
import { JOG } from './layout.js';
import { switchPositions } from './parts-analog.js';
import { partOf } from './parts-common.js';
import { clamp, lerp, roundTo } from './svg.js';
import { snapDetent, unit } from './values.js';
import { attachWheel } from './wheel.js';

const KNOB_DRAG_PX = 190;
const FINE_DRAG_FACTOR = 4;
const ENCODER_DRAG_PX = 16;
const JOG_MIN_RADIUS = 6;
const TURN = Math.PI * 2;
const RESETTABLE = Object.freeze(['knob', 'fader', 'switch']);

function knobSession({ part, event, change, getValue }) {
  const { control } = part;
  const startY = event.clientY;
  const startValue = getValue(control.id) ?? control.value;
  const range = control.max - control.min;
  return {
    move(e) {
      const sweepPx = KNOB_DRAG_PX * (e.shiftKey ? FINE_DRAG_FACTOR : 1);
      const raw = startValue + ((startY - e.clientY) / sweepPx) * range;
      change(control, snapDetent(control, clamp(raw, control.min, control.max)));
    },
  };
}

function faderSession({ part, event, toLocal, change, getValue }) {
  const { control, spec } = part;
  const vertical = spec.axis === 'v';
  const [t0, t1] = spec.travel;
  const along = (p) => (vertical ? p.y - spec.y : p.x - spec.x);
  const capHalf = (vertical ? spec.capH : spec.capW) / 2;
  const capNow = lerp(t0, t1, unit(control, getValue(control.id) ?? control.value));
  const grabbed = along(toLocal(event));
  // Grabbing the cap keeps the offset; grabbing the slot jumps the cap to the pointer.
  const offset = Math.abs(grabbed - capNow) <= capHalf ? grabbed - capNow : 0;
  const follow = (e) => {
    const t = clamp((along(toLocal(e)) - offset - t0) / (t1 - t0), 0, 1);
    change(control, snapDetent(control, control.min + t * (control.max - control.min)));
  };
  if (offset === 0) follow(event);
  return { move: follow };
}

function encoderSession({ part, event, send }) {
  const startY = event.clientY;
  let stepped = 0;
  return {
    move(e) {
      const target = Math.trunc((e.clientY - startY) / ENCODER_DRAG_PX);
      while (stepped !== target) {
        const direction = target > stepped ? 1 : -1;
        send(part.control.id, direction);
        stepped += direction;
      }
    },
  };
}

function switchSession({ part, event, toLocal, send, getValue }) {
  const positions = switchPositions(part.spec);
  const pick = (e) => {
    const y = toLocal(e).y - part.spec.y;
    const nearest = positions.reduce((best, p) => (Math.abs(p.y - y) < Math.abs(best.y - y) ? p : best));
    if (nearest.option !== getValue(part.control.id)) send(part.control.id, nearest.option);
  };
  pick(event);
  return { move: pick };
}

/** The platter top scrubs (touch: true); the grip rim nudges (touch: false). Deltas are in turns. */
function jogSession({ part, event, toLocal, send }) {
  const id = part.control.id;
  const { x, y } = part.spec;
  const start = toLocal(event);
  const touch = Math.hypot(start.x - x, start.y - y) < JOG.platterR;
  let last = Math.atan2(start.y - y, start.x - x);
  if (touch) send(id, { delta: 0, touch: true });
  return {
    move(e) {
      const p = toLocal(e);
      if (Math.hypot(p.x - x, p.y - y) < JOG_MIN_RADIUS) return;
      const angle = Math.atan2(p.y - y, p.x - x);
      let turn = angle - last;
      if (turn > Math.PI) turn -= TURN;
      if (turn < -Math.PI) turn += TURN;
      last = angle;
      if (turn !== 0) send(id, { delta: roundTo(turn / TURN, 5), touch });
    },
    end() {
      if (touch) send(id, { delta: 0, touch: false });
    },
  };
}

const SESSIONS = Object.freeze({
  button: ({ part, send }) => {
    send(part.control.id, true);
    return { end: () => send(part.control.id, false) };
  },
  toggle: ({ part, send, getValue }) => {
    send(part.control.id, !getValue(part.control.id));
    return {};
  },
  knob: knobSession,
  fader: faderSession,
  encoder: encoderSession,
  switch: switchSession,
  jog: jogSession,
});

function capturePointer(group, pointerId) {
  try {
    group.setPointerCapture(pointerId);
  } catch (error) {
    // The pointer is already gone (a fast tap); the press still ends on pointerup.
  }
}

export function attachInteraction({ svg, bus, parts, getValue }) {
  const sessions = new Map();
  const send = (id, value) => emitControl(bus, id, value, 'pointer');
  const change = (control, value) => {
    if (value !== getValue(control.id)) send(control.id, value);
  };
  const toLocal = (event) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };
  const usable = (part) => part && part.control.live !== false;

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const part = partOf(parts, event.target);
    const start = usable(part) ? SESSIONS[part.control.kind] : null;
    if (!start) return;
    const session = start({ part, event, toLocal, send, change, getValue });
    sessions.set(event.pointerId, { ...session, part });
    part.g.classList.add('is-active');
    capturePointer(part.g, event.pointerId);
  }

  function endSession(event) {
    const session = sessions.get(event.pointerId);
    if (!session) return;
    sessions.delete(event.pointerId);
    session.part.g.classList.remove('is-active');
    session.end?.(event);
  }

  function onDoubleClick(event) {
    const part = partOf(parts, event.target);
    if (usable(part) && RESETTABLE.includes(part.control.kind)) change(part.control, part.control.value);
  }

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', (event) => sessions.get(event.pointerId)?.move?.(event));
  svg.addEventListener('pointerup', endSession);
  svg.addEventListener('pointercancel', endSession);
  svg.addEventListener('lostpointercapture', endSession);
  svg.addEventListener('dblclick', onDoubleClick);
  attachWheel({ svg, parts, getValue, send, change });

  return {
    /** Ends every press, used when the window loses focus so nothing stays held. */
    releaseAll() {
      for (const [pointerId] of sessions) endSession({ pointerId });
    },
  };
}
