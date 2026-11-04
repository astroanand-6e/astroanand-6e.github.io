/**
 * Try the decks (mix/): the shared contract.
 *
 * Three parts meet here and nowhere else:
 *   - the audio engine   mix/js/audio/engine.js   createEngine({ bus })
 *   - the controller UI  mix/js/ui/*.js            mountController / mountScreen / mountLibrary
 *   - the lessons        mix/js/lessons/runner.js  mountLessons(host, { bus, engine })
 * They talk through one EventTarget bus plus engine.getState(). Control ids,
 * kinds, ranges and defaults live in CONTROLS below; nobody invents ids.
 *
 * Bus events (CustomEvent, payload in `detail`):
 *   'control'   { id, value, source }  a control moved or was pressed. Value by kind:
 *                 button   true on press, false on release
 *                 toggle   the latched state after the press (true/false)
 *                 knob     number in [min, max]
 *                 fader    number in [min, max]
 *                 encoder  integer step: +1 clockwise, -1 counter-clockwise
 *                 jog      { delta, touch }: delta in turns (+ clockwise),
 *                          touch true while the platter top is held
 *                 switch   one of `options`
 *               source: 'pointer' | 'keyboard' | 'lesson' | 'engine'.
 *               The UI must also move its visuals for events it didn't send
 *               (lessons can set controls), so render from these events.
 *   'engine'    { type, deck?, ... }  engine news, type in ENGINE_EVENTS
 *   'highlight' { ids }   lessons ask the controller to ring these controls ([] clears)
 *   'focus'     { section }  lessons ask for 'deck1' | 'mixer' | 'deck2'
 *               (on phones the controller zooms to that section)
 *   'select'    { index }    pick a library row directly (the engine owns the
 *               selection; 'm.browse' steps it, 'm.load1'/'m.load2' load it)
 *   'mode'      { mode }     'lessons' | 'free'; lessons request free play,
 *               main.js switches the tabs and re-emits it when tabs change
 *
 * Engine API (createEngine({ bus })):
 *   ready: Promise<void>        starting tracks rendered
 *   resume(): Promise<void>     resume the AudioContext after a user gesture
 *   getState()                  shape below; cheap enough for every frame
 *   getTracks()                 [{ id, title, artist, bpm, key, camelot, duration }]
 *   getSelection()              index of the selected library row
 *   getWaveform(trackId)        { binSeconds, low, mid, high } Float32Arrays, 0..1
 *   seek(deck, seconds)         move deck 0 or 1 to a position (playing or paused);
 *                               lessons use it to set up a level; emits 'engine' 'seek'
 *   dispose()
 *
 * engine.getState() returns:
 *   { ready, decks: [DeckState, DeckState], mixer: MixerState, phaseOffset }
 *   DeckState: { id, track: {id,title,artist,bpm,key,camelot,duration} | null,
 *     playing, position (s), duration (s), bpm (effective), rate, tempo (-1..1),
 *     synced, cuePoint (s), hotCues: Array(8) of seconds|null,
 *     loop: {start, end, beats} | null, padMode: one of PAD_MODES,
 *     beat (float beats since beat 0), bar (1-based), phraseBeat (0..31),
 *     level (0..1 post-fader peak) }
 *   MixerState: { trim, hi, mid, low, cfx, fader: [ch1, ch2] each,
 *     xfader, master, fx: { on, level, beats, channel } }
 *   phaseOffset: beats, deck 2 minus deck 1, wrapped to -0.5..0.5 (0 = in phase)
 *
 * Value conventions the engine implements:
 *   EQ hi/mid/low: -1 = kill, 0 = flat, +1 = +6 dB.  Trim: 0 = 0 dB.
 *   CFX: 0 = off, < 0 low-pass sweep, > 0 high-pass sweep.
 *   Tempo: +1 = +8% faster (fader pulled toward the player, like the hardware).
 *   Channel faders 0..1 (top = 1). Crossfader -1 = all deck 1, +1 = all deck 2.
 */

export const SECTIONS = Object.freeze(['deck1', 'mixer', 'deck2']);
export const PAD_COUNT = 8;
export const PAD_MODES = Object.freeze(['hotcue', 'padfx', 'beatjump', 'sampler']);
export const BEATS_PER_BAR = 4;
export const PHRASE_BEATS = 32;
export const TEMPO_RANGE = 0.08;
export const ENGINE_EVENTS = Object.freeze([
  'ready', 'loaded', 'play', 'pause', 'cue', 'sync', 'hotcue-set', 'hotcue-jump',
  'hotcue-clear', 'loop', 'beatjump', 'sample', 'fx', 'seek', 'error',
]);

const range = (n) => Array.from({ length: n }, (_, i) => i);
const centered = { min: -1, max: 1, value: 0, detent: 0 };

function deckControls(n) {
  const section = `deck${n}`;
  const button = (id, label, live = true) => ({ id: `d${n}.${id}`, kind: 'button', section, label, live });
  return [
    button('play', 'Play / Pause'),
    button('cue', 'Cue'),
    button('shift', 'Shift'),
    button('sync', 'Beat Sync'),
    { id: `d${n}.tempo`, kind: 'fader', section, label: 'Tempo', ...centered, live: true },
    { id: `d${n}.jog`, kind: 'jog', section, label: 'Jog wheel', live: true },
    ...range(PAD_COUNT).map((i) => button(`pad${i + 1}`, `Pad ${i + 1}`)),
    button('mode.hotcue', 'Hot Cue'),
    button('mode.padfx', 'Pad FX'),
    button('mode.beatjump', 'Beat Jump'),
    button('mode.sampler', 'Sampler'),
    button('loop.in', 'Loop In'),
    button('loop.out', 'Loop Out'),
    button('loop.exit', '4 Beat / Exit'),
    button('loop.half', 'Loop half'),
    button('loop.double', 'Loop double'),
  ];
}

function channelControls(n) {
  const section = 'mixer';
  const knob = (id, label, extra = {}) => ({ id: `m.${id}${n}`, kind: 'knob', section, label, ...centered, live: true, ...extra });
  return [
    { id: `m.load${n}`, kind: 'button', section, label: `Load deck ${n}`, live: true },
    knob('trim', 'Trim'),
    knob('hi', 'Hi'),
    knob('mid', 'Mid'),
    knob('low', 'Low'),
    knob('cfx', 'CFX filter'),
    { id: `m.hpcue${n}`, kind: 'toggle', section, label: `Headphone cue ${n}`, value: false, live: false },
    { id: `m.fader${n}`, kind: 'fader', section, label: `Channel ${n} fader`, min: 0, max: 1, value: n === 1 ? 1 : 0, live: true },
  ];
}

const MIXER = [
  ...channelControls(1),
  ...channelControls(2),
  { id: 'm.browse', kind: 'encoder', section: 'mixer', label: 'Browse', live: true },
  { id: 'm.xfader', kind: 'fader', section: 'mixer', label: 'Crossfader', ...centered, live: true },
  { id: 'm.master', kind: 'knob', section: 'mixer', label: 'Master level', min: 0, max: 1, value: 0.8, live: true },
  { id: 'm.mastercue', kind: 'toggle', section: 'mixer', label: 'Master cue', value: false, live: false },
  { id: 'm.hpmix', kind: 'knob', section: 'mixer', label: 'Headphone mix', min: 0, max: 1, value: 0.5, live: false },
  { id: 'm.hplevel', kind: 'knob', section: 'mixer', label: 'Headphone level', min: 0, max: 1, value: 0.6, live: false },
  { id: 'm.mic', kind: 'knob', section: 'mixer', label: 'Mic level', min: 0, max: 1, value: 0, live: false },
  { id: 'm.smartcfx', kind: 'toggle', section: 'mixer', label: 'Smart CFX', value: false, live: false },
  { id: 'm.smartfader', kind: 'toggle', section: 'mixer', label: 'Smart Fader', value: false, live: false },
  { id: 'm.fx.on', kind: 'toggle', section: 'mixer', label: 'Beat FX on / off', value: false, live: true },
  { id: 'm.fx.level', kind: 'knob', section: 'mixer', label: 'FX level / depth', min: 0, max: 1, value: 0.5, live: true },
  { id: 'm.fx.beatdown', kind: 'button', section: 'mixer', label: 'FX beat shorter', live: true },
  { id: 'm.fx.beatup', kind: 'button', section: 'mixer', label: 'FX beat longer', live: true },
  { id: 'm.fx.select', kind: 'button', section: 'mixer', label: 'FX select', live: false },
  { id: 'm.fx.channel', kind: 'switch', section: 'mixer', label: 'FX channel', options: ['1', '2', '1&2'], value: '1&2', live: true },
];

export const CONTROLS = Object.freeze([...deckControls(1), ...deckControls(2), ...MIXER].map(Object.freeze));
export const CONTROL_BY_ID = new Map(CONTROLS.map((c) => [c.id, c]));

export function defaultValue(id) {
  const control = CONTROL_BY_ID.get(id);
  if (!control) throw new Error(`Unknown control id: ${id}`);
  return control.value;
}

export function createBus() {
  return new EventTarget();
}

export function emit(bus, type, detail) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function emitControl(bus, id, value, source) {
  if (!CONTROL_BY_ID.has(id)) throw new Error(`Unknown control id: ${id}`);
  emit(bus, 'control', { id, value, source });
}

/** Subscribes to one bus event type; returns an unsubscribe function. */
export function on(bus, type, handler) {
  const listener = (event) => handler(event.detail);
  bus.addEventListener(type, listener);
  return () => bus.removeEventListener(type, listener);
}
