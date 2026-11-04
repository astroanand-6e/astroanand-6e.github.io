/**
 * Desktop keyboard map. Letters are matched by the character on the key, digits by their
 * physical position so Shift can pick deck 2. The "?" overlay is in keymap-dialog.js.
 *   deck 1: Q play  W cue  E sync  D shift  A/S nudge  Z/X tempo  1-8 pads
 *   deck 2: P play  O cue  I sync  J shift  K/L nudge  N/M tempo  Shift+1-8 pads
 *   mixer:  left / right arrows move the crossfader, F toggles Beat FX
 */
import { emitControl } from '../controls.js';
import { buildKeymapDialog } from './keymap-dialog.js';
import { clamp, roundTo } from './svg.js';

const BUTTON_KEYS = new Map(Object.entries({
  q: 'd1.play', w: 'd1.cue', e: 'd1.sync', d: 'd1.shift', p: 'd2.play', o: 'd2.cue', i: 'd2.sync', j: 'd2.shift',
}));
const NUDGE_KEYS = new Map(Object.entries({
  a: { deck: 1, direction: -1 }, s: { deck: 1, direction: 1 }, k: { deck: 2, direction: -1 }, l: { deck: 2, direction: 1 },
}));
const TEMPO_KEYS = new Map(Object.entries({
  z: { id: 'd1.tempo', direction: -1 }, x: { id: 'd1.tempo', direction: 1 },
  n: { id: 'd2.tempo', direction: -1 }, m: { id: 'd2.tempo', direction: 1 },
}));
const NUDGE_TURNS_PER_SECOND = 0.14;
const NUDGE_MAX_DT = 0.05;
const TEMPO_STEP = 0.02;
const XFADE_STEP = 0.1;
const BIG_STEP_FACTOR = 5;
const FX_KEY = 'f';
const DIGIT_PAD = /^Digit([1-8])$/;
const TEXT_TARGET = 'input[type="text"], input[type="search"], input[type="email"], input[type="number"], textarea, select, [contenteditable="true"]';

/** Emits steady jog deltas for as long as a nudge key is held. */
function createNudger(send) {
  const active = new Map();
  let frame = 0;
  let last = 0;

  function tick(now) {
    const dt = Math.min(NUDGE_MAX_DT, (now - last) / 1000);
    last = now;
    for (const { deck, direction } of active.values()) {
      send(`d${deck}.jog`, { delta: roundTo(direction * NUDGE_TURNS_PER_SECOND * dt, 5), touch: false });
    }
    frame = active.size ? requestAnimationFrame(tick) : 0;
  }

  return {
    start(code, nudge) {
      active.set(code, nudge);
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    },
    stop: (code) => active.delete(code),
  };
}

export function attachKeymap({ host, bus, getValue }) {
  const dialog = buildKeymapDialog();
  host.append(dialog);
  const held = new Map();
  const send = (id, value) => emitControl(bus, id, value, 'keyboard');
  const nudger = createNudger(send);
  const toggleDialog = () => (dialog.open ? dialog.close() : dialog.showModal());

  function holdButton(code, id) {
    held.set(code, () => send(id, false));
    send(id, true);
  }

  function holdNudge(code, nudge) {
    held.set(code, () => nudger.stop(code));
    nudger.start(code, nudge);
  }

  function stepValue(id, delta) {
    const current = getValue(id) ?? 0;
    const next = roundTo(clamp(current + delta, -1, 1));
    if (next !== current) send(id, next);
  }

  /** Returns true when the key belongs to the map. Held keys ignore auto-repeat. */
  function handle(event) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const pad = DIGIT_PAD.exec(event.code);
    const big = event.shiftKey ? BIG_STEP_FACTOR : 1;
    const buttonId = pad ? `d${event.shiftKey ? 2 : 1}.pad${pad[1]}` : BUTTON_KEYS.get(key);
    if (buttonId) {
      if (!event.repeat) holdButton(event.code, buttonId);
    } else if (NUDGE_KEYS.has(key)) {
      if (!event.repeat) holdNudge(event.code, NUDGE_KEYS.get(key));
    } else if (TEMPO_KEYS.has(key)) {
      const { id, direction } = TEMPO_KEYS.get(key);
      stepValue(id, direction * TEMPO_STEP * big);
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      stepValue('m.xfader', (key === 'ArrowRight' ? 1 : -1) * XFADE_STEP * big);
    } else if (key === FX_KEY) {
      if (!event.repeat) send('m.fx.on', !getValue('m.fx.on'));
    } else return false;
    return true;
  }

  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest(TEXT_TARGET)) return;
    if (event.key === '?') {
      toggleDialog();
      event.preventDefault();
    } else if (!dialog.open && handle(event)) event.preventDefault();
  }

  function onKeyUp(event) {
    const release = held.get(event.code);
    if (!release) return;
    held.delete(event.code);
    release();
  }

  function releaseAll() {
    for (const release of held.values()) release();
    held.clear();
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);
  return {
    toggle: toggleDialog,
    releaseAll,
    dispose() {
      releaseAll();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      dialog.remove();
    },
  };
}
