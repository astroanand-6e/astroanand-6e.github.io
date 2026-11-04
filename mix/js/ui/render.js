/**
 * Every animation frame: engine.getState() to the unit. Drives the jog platters, the LEDs
 * (play blinks while parked on the cue, cue, sync, pad modes, pads, loops, FX) and the
 * meters. Knob and fader positions come from control events instead (see controller.js).
 */
import { PAD_COUNT, PAD_MODES } from '../controls.js';
import { formatBeats, meterFraction } from './format.js';
import { HOT_CUE_COLORS, MODE_COLORS } from './palette.js';

const JOG_DEG_PER_SECOND = 200;
const AT_CUE_SECONDS = 0.04;
const BLINK_HALF_PERIOD_MS = 500;
const GLOW = Object.freeze({ playing: 1, loaded: 0.34, empty: 0.1 });
const PAD_IDLE_LEVEL = 0.42;
const HOT_CUE_LEVEL = 0.88;
const METER_FALL_PER_SECOND = 1.8;

function collectDeck(parts, n) {
  const get = (key) => parts.get(`d${n}.${key}`);
  return {
    jog: get('jog'),
    play: get('play'),
    cue: get('cue'),
    sync: get('sync'),
    loop: ['in', 'out', 'exit'].map((key) => get(`loop.${key}`)),
    modes: PAD_MODES.map((mode) => [mode, get(`mode.${mode}`)]),
    pads: Array.from({ length: PAD_COUNT }, (_, i) => get(`pad${i + 1}`)),
  };
}

export function createRenderer({ engine, parts, meters, body, getValue }) {
  const decks = [1, 2].map((n) => collectDeck(parts, n));
  const fxOn = parts.get('m.fx.on');
  const meterLevels = [0, 0];
  let reported = false;

  function lightPad(pad, deck, index) {
    if (!pad) return;
    const pressed = getValue(pad.control.id) === true;
    if (deck.padMode === 'hotcue') {
      const isSet = deck.hotCues?.[index] != null;
      pad.light(pressed ? 1 : isSet ? HOT_CUE_LEVEL : 0, HOT_CUE_COLORS[index]);
      return;
    }
    pad.light(pressed ? 1 : PAD_IDLE_LEVEL, MODE_COLORS[deck.padMode] ?? null);
  }

  function renderDeck(view, deck, index, nowMs, dtMs) {
    const loaded = Boolean(deck.track);
    const position = Number.isFinite(deck.position) ? deck.position : 0;
    const atCue = loaded && !deck.playing && Math.abs(position - (deck.cuePoint ?? 0)) < AT_CUE_SECONDS;
    const blinkOn = Math.floor(nowMs / BLINK_HALF_PERIOD_MS) % 2 === 0;
    const looping = Boolean(deck.loop);
    view.jog?.rotate((position * JOG_DEG_PER_SECOND) % 360);
    view.jog?.glow(deck.playing ? GLOW.playing : loaded ? GLOW.loaded : GLOW.empty);
    view.play?.light(deck.playing || (atCue && blinkOn) ? 1 : 0);
    view.cue?.light(atCue || (view.cue && getValue(view.cue.control.id) === true) ? 1 : 0);
    view.sync?.light(deck.synced ? 1 : 0);
    for (const [mode, part] of view.modes) part?.light(deck.padMode === mode ? 1 : 0);
    view.pads.forEach((pad, i) => lightPad(pad, deck, i));
    for (const part of view.loop) part?.light(looping ? 1 : 0);
    const level = meterFraction(deck.level ?? 0);
    meterLevels[index] = Math.max(level, meterLevels[index] - (METER_FALL_PER_SECOND * dtMs) / 1000);
    meters.set(index, meterLevels[index]);
  }

  return {
    frame(nowMs, dtMs) {
      let state = null;
      try {
        state = engine.getState();
      } catch (error) {
        if (!reported) console.error('mix: engine.getState() failed', error);
        reported = true;
        return;
      }
      if (!state || !Array.isArray(state.decks)) return;
      state.decks.forEach((deck, index) => decks[index] && renderDeck(decks[index], deck, index, nowMs, dtMs));
      body.setReady(state.ready);
      fxOn?.light(state.mixer?.fx?.on ? 1 : 0);
      body.setBeats(formatBeats(state.mixer?.fx?.beats));
    },
  };
}
