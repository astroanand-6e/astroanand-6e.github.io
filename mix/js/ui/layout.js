/**
 * Where everything sits on the controller. Units are millimetres, origin at the
 * centre of the unit, x to the right, y toward the player. The numbers follow
 * js/objects/ddj-flx4.js (1 unit there = 10 cm) so this is the same object from above.
 * Every id here is a control id from ../controls.js.
 */
import { CONTROL_BY_ID, CONTROLS, PAD_COUNT, PAD_MODES } from '../controls.js';

export const VIEW = Object.freeze({ x: -241.5, y: -136, w: 483, h: 272 });
export const BODY_RADIUS = 14;
export const SEAM_X = 77;
export const SECTION_RANGE = Object.freeze({
  deck1: [VIEW.x, -SEAM_X],
  mixer: [-SEAM_X, SEAM_X],
  deck2: [SEAM_X, VIEW.x + VIEW.w],
});
export const JOG = Object.freeze({ rimR: 68, platterR: 56.5, ringR: 23.5, lobes: 28, lobeDepth: 2 });
export const METERS = Object.freeze({ xs: [-5, 5], ys: [-68, -58, -48, -38, -28], w: 2.6, h: 6.5 });
export const STATUS_DOT = Object.freeze({ x: 0, y: -80, r: 2.4 });
export const FX_BEATS_READOUT = Object.freeze({ x: 57, y: 39.5 });

const DECK_CENTER = Object.freeze({ 1: -154, 2: 154 });
const PAD_PITCH = 23;
const PAD_ROW_Y = [88, 112];
const MODE_Y = 65;
const BACK_Y = -105;
const JOG_Y = -19;
const MODE_LABELS = Object.freeze({
  hotcue: ['HOT', 'CUE'], padfx: ['PAD', 'FX'], beatjump: ['BEAT', 'JUMP'], sampler: ['SAMPLER'],
});
const KNOB_LABELS = Object.freeze({ trim: 'TRIM', hi: 'HI', mid: 'MID', low: 'LOW', cfx: 'CFX' });

function deckSpecs(n) {
  const cx = DECK_CENTER[n];
  const spec = (key, shape, dx, y, rest = {}) => ({ id: `d${n}.${key}`, shape, x: cx + dx, y, ...rest });
  const columnX = (col) => (col - 1.5) * PAD_PITCH;
  const small = { r: 6.5, cap: 4.8 };
  const pads = Array.from({ length: PAD_COUNT }, (_, i) => spec(`pad${i + 1}`, 'pad', columnX(i % 4), PAD_ROW_Y[Math.floor(i / 4)], {
    size: 20.5, cap: 15.5, digit: String(i + 1), hit: [PAD_PITCH, PAD_PITCH],
  }));
  const modes = PAD_MODES.map((mode, col) => spec(`mode.${mode}`, 'window-rect', columnX(col), MODE_Y, {
    w: 19, h: 9, label: MODE_LABELS[mode], hit: [PAD_PITCH, 22],
  }));
  return [
    spec('jog', 'jog', 0, JOG_Y),
    spec('play', 'cap-round', -62, 108, { r: 14, cap: 11, glyph: 'play', led: true }),
    spec('cue', 'cap-round', -62, 79, { r: 14, cap: 11, text: 'CUE', led: true }),
    spec('sync', 'cap-rect', -62, 50, { w: 15, h: 15, text: 'SYNC', led: true }),
    spec('loop.in', 'window-round', -57, BACK_Y, { r: 9, label: 'IN' }),
    spec('loop.out', 'window-round', -33, BACK_Y, { r: 9, label: 'OUT' }),
    spec('loop.exit', 'cap-round', -8, BACK_Y, { ...small, label: ['4 BEAT', 'EXIT'], led: true }),
    spec('loop.half', 'cap-round', 18, BACK_Y, { ...small, label: '1/2X' }),
    spec('loop.double', 'cap-round', 42, BACK_Y, { ...small, label: '2X' }),
    spec('shift', 'cap-round', 64, BACK_Y, { r: 7.5, cap: 5.8, label: 'SHIFT' }),
    ...modes,
    ...pads,
    spec('tempo', 'fader', 60, 79, { axis: 'v', length: 70, capW: 19, capH: 16, travel: [-27, 27], ticks: 15, detent: true, label: 'TEMPO', labelAt: 'above' }),
  ];
}

function channelSpecs(n) {
  const x = n === 1 ? -20 : 20;
  const side = n === 1 ? 'left' : 'right';
  const knob = (key, y, r) => ({ id: `m.${key}${n}`, shape: 'knob', x, y, r, label: KNOB_LABELS[key], labelAt: side });
  return [
    { id: `m.load${n}`, shape: 'cap-rect', x: n === 1 ? -35 : 35, y: -114, w: 22, h: 13, text: `LOAD ${n}` },
    knob('trim', -93, 7.5),
    knob('hi', -70, 9),
    knob('mid', -46, 9),
    knob('low', -22, 9),
    knob('cfx', 4, 9),
    { id: `m.hpcue${n}`, shape: 'window-rect', x, y: 27, w: 15, h: 8.5, label: 'CUE', hit: [22.5, 17] },
    { id: `m.fader${n}`, shape: 'fader', x, y: 66, axis: 'v', length: 50, capW: 20, capH: 10, travel: [20, -20], ticks: 11 },
  ];
}

const MIXER_SPECS = [
  { id: 'm.browse', shape: 'encoder', x: 0, y: -114, r: 8.5, label: 'BROWSE', labelAt: 'below' },
  { id: 'm.master', shape: 'knob', x: 57, y: -111, r: 9.5, label: 'MASTER', labelAt: 'below' },
  { id: 'm.mastercue', shape: 'window-rect', x: 57, y: -88, w: 11, h: 7.5, label: 'CUE', labelAt: 'right', hit: [22, 17] },
  { id: 'm.mic', shape: 'knob', x: -57, y: -44, r: 8.5, label: 'MIC', labelAt: 'below' },
  { id: 'm.smartcfx', shape: 'window-round', x: -57, y: 5, r: 8.5, label: ['SMART', 'CFX'] },
  { id: 'm.hpmix', shape: 'knob', x: -57, y: 33, r: 8.5, label: 'HP MIX', labelAt: 'below' },
  { id: 'm.hplevel', shape: 'knob', x: -57, y: 64, r: 8.5, label: 'HP LEVEL', labelAt: 'below' },
  { id: 'm.smartfader', shape: 'window-round', x: -57, y: 95, r: 8.5, label: ['SMART', 'FADER'], labelAt: 'below' },
  { id: 'm.fx.channel', shape: 'switch', x: 57, y: -46, length: 28, order: ['1', '1&2', '2'], reach: 9 },
  { id: 'm.fx.select', shape: 'cap-rect', x: 57, y: 4, w: 10, h: 9, label: 'SELECT', hit: [22.5, 22.5] },
  { id: 'm.fx.beatdown', shape: 'cap-rect', x: 46, y: 29, w: 9, h: 8, glyph: 'prev', hit: [22, 22.5] },
  { id: 'm.fx.beatup', shape: 'cap-rect', x: 68, y: 29, w: 9, h: 8, glyph: 'next', hit: [22, 22.5] },
  { id: 'm.fx.level', shape: 'knob', x: 57, y: 58, r: 8.5, label: 'LEVEL/DEPTH', labelAt: 'below' },
  { id: 'm.fx.on', shape: 'window-round', x: 57, y: 88, r: 10.5, label: 'ON/OFF', labelAt: 'below' },
  { id: 'm.xfader', shape: 'fader', x: 0, y: 117, axis: 'h', length: 50, capW: 14, capH: 22, travel: [-22, 22], ticks: 9, detent: true },
];

/** Printed text that belongs to no single control. */
export const CAPTIONS = Object.freeze([
  { text: 'DECK 1', x: DECK_CENTER[1], y: 131 },
  { text: 'DECK 2', x: DECK_CENTER[2], y: 131 },
  { text: 'BEAT FX', x: 57, y: -63.5 },
  { text: 'BEAT', x: 57, y: 22.8 },
  { text: '1', x: -31.5, y: 118.3 },
  { text: '2', x: 31.5, y: 118.3 },
]);

/** Spec list in DOM and tab order: deck 1, mixer, deck 2. */
export const LAYOUT_LIST = Object.freeze(
  [...deckSpecs(1), ...MIXER_SPECS, ...channelSpecs(1), ...channelSpecs(2), ...deckSpecs(2)]
    .filter((spec) => CONTROL_BY_ID.has(spec.id))
    .map(Object.freeze),
);
export const LAYOUT = new Map(LAYOUT_LIST.map((spec) => [spec.id, spec]));

/** Contract controls this layout does not draw. The controller warns about these. */
export function controlsMissingFromLayout() {
  return CONTROLS.filter((control) => !LAYOUT.has(control.id)).map((control) => control.id);
}
