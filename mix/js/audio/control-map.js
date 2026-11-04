/**
 * Maps every live control id of the contract to what the engine does with it,
 * and validates incoming values by control kind. Controls marked live:false in
 * controls.js (headphones, mic, smart cfx/fader, FX select) have no entry, so
 * they are ignored by construction.
 */
import { CONTROL_BY_ID, PAD_COUNT, PAD_MODES } from '../controls.js';
import { jog } from './deck-jog.js';
import {
  loopDouble, loopExit, loopHalf, loopIn, loopOut,
} from './deck-loops.js';
import { padDown, padUp, releaseAllPads } from './deck-pads.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Checks a control value against its definition; returns the cleaned value or throws. */
export function normalizeValue(control, value) {
  switch (control.kind) {
    case 'button':
    case 'toggle':
      return Boolean(value);
    case 'knob':
    case 'fader':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${control.id} needs a finite number, got ${String(value)}`);
      return clamp(value, control.min, control.max);
    case 'encoder':
      if (!Number.isInteger(value)) throw new TypeError(`${control.id} needs an integer step, got ${String(value)}`);
      return Math.sign(value);
    case 'jog':
      if (!value || !Number.isFinite(value.delta)) throw new TypeError(`${control.id} needs { delta, touch }`);
      return { delta: value.delta, touch: Boolean(value.touch) };
    case 'switch':
      if (!control.options.includes(value)) throw new RangeError(`${control.id} must be one of ${control.options.join(', ')}`);
      return value;
    default:
      throw new Error(`Unknown control kind: ${control.kind}`);
  }
}

/**
 * @param {{
 *   decks: object[], mixer: object, ensureAudio: () => void, refreshCoupling: () => void,
 *   browse: (step: number) => void, loadSelected: (deckIndex: number) => void, announceFx: () => void,
 * }} api
 * @returns {Map<string, (value: any) => void>}
 */
export function buildControlMap(api) {
  const map = new Map();
  const add = (id, handler) => {
    if (!CONTROL_BY_ID.has(id)) throw new Error(`control-map references unknown id ${id}`);
    map.set(id, handler);
  };
  const pressed = (fn) => (value) => { if (value) fn(); };
  /** Deck actions that make sound: create the context if needed, then refresh tempo coupling. */
  const audible = (fn) => (value) => { if (value !== false) api.ensureAudio(); fn(value); api.refreshCoupling(); };
  const quiet = (fn) => (value) => { if (value !== false) api.ensureAudio(); fn(value); };

  api.decks.forEach((deck, index) => addDeckControls(add, { deck, n: index + 1, pressed, audible, quiet, api }));
  addMixerControls(add, { api, pressed });
  return map;
}

function addDeckControls(add, { deck, n, pressed, audible, quiet, api }) {
  add(`d${n}.play`, audible(pressed(() => deck.togglePlay())));
  add(`d${n}.cue`, audible((down) => (down ? deck.cueDown() : deck.cueUp())));
  add(`d${n}.shift`, (down) => { deck.shift = down; });
  add(`d${n}.sync`, audible(pressed(() => deck.pressSync())));
  add(`d${n}.tempo`, (value) => { deck.setTempo(value); api.refreshCoupling(); });
  add(`d${n}.jog`, quiet((value) => jog(deck, value)));
  for (let pad = 0; pad < PAD_COUNT; pad += 1) {
    add(`d${n}.pad${pad + 1}`, audible((down) => (down ? padDown(deck, pad) : padUp(deck, pad))));
  }
  for (const mode of PAD_MODES) {
    add(`d${n}.mode.${mode}`, pressed(() => { releaseAllPads(deck); deck.padMode = mode; }));
  }
  const loops = { in: loopIn, out: loopOut, exit: loopExit, half: loopHalf, double: loopDouble };
  for (const [name, action] of Object.entries(loops)) {
    add(`d${n}.loop.${name}`, audible(pressed(() => action(deck))));
  }
}

function addMixerControls(add, { api, pressed }) {
  const { mixer } = api;
  [1, 2].forEach((n) => {
    const c = n - 1;
    add(`m.trim${n}`, (value) => mixer.setTrim(c, value));
    add(`m.hi${n}`, (value) => mixer.setEq('high', c, value));
    add(`m.mid${n}`, (value) => mixer.setEq('mid', c, value));
    add(`m.low${n}`, (value) => mixer.setEq('low', c, value));
    add(`m.cfx${n}`, (value) => mixer.setCfx(c, value));
    add(`m.fader${n}`, (value) => mixer.setFader(c, value));
    add(`m.load${n}`, pressed(() => api.loadSelected(c)));
  });
  add('m.xfader', (value) => mixer.setCrossfader(value));
  add('m.master', (value) => mixer.setMaster(value));
  add('m.browse', (step) => api.browse(step));
  add('m.fx.on', (on) => { mixer.setFxOn(on); api.announceFx(); });
  add('m.fx.level', (level) => mixer.setFxLevel(level));
  add('m.fx.beatdown', pressed(() => { mixer.stepFxBeats(-1); api.announceFx(); }));
  add('m.fx.beatup', pressed(() => { mixer.stepFxBeats(1); api.announceFx(); }));
  add('m.fx.channel', (channel) => { mixer.setFxChannel(channel); api.announceFx(); });
}
