/**
 * Mixer value conventions turned into gains and filter settings. Pure
 * functions: the Web Audio graph only applies what these return.
 */

export const TRIM_RANGE_DB = 12;
export const EQ_BOOST_DB = 6;
/** Channel fader taper: gain = value ^ power (smooth, dips fast near the bottom). */
export const FADER_CURVE_POWER = 2;
/** Master knob position that passes unity gain (the control's default). */
export const MASTER_UNITY_POSITION = 0.8;
export const BEAT_FX_BEATS = Object.freeze([0.25, 0.5, 0.75, 1, 2]);

export const CFX_MAX_LOWPASS_HZ = 20000;
export const CFX_MIN_LOWPASS_HZ = 100;
export const CFX_MIN_HIGHPASS_HZ = 20;
export const CFX_MAX_HIGHPASS_HZ = 8000;
export const CFX_DEADZONE = 0.02;
const CFX_BASE_Q = 0.7071;
const CFX_MAX_Q = 1.9;

export const dbToGain = (db) => 10 ** (db / 20);

/**
 * Web Audio quirk: for lowpass/highpass filters the Q parameter is a resonance
 * in dB, for every other type it is the usual linear Q. This converts a linear
 * Q (0.7071 = Butterworth) into what BiquadFilterNode.Q expects.
 */
export function webAudioQ(type, linearQ) {
  return type === 'lowpass' || type === 'highpass' ? 20 * Math.log10(linearQ) : linearQ;
}
export const gainToDb = (gain) => 20 * Math.log10(Math.max(gain, 1e-9));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Trim knob -1..1 maps to -12..+12 dB. */
export const trimGain = (value) => dbToGain(clamp(value, -1, 1) * TRIM_RANGE_DB);

/** EQ knob: -1 kills the band, 0 is flat, +1 boosts 6 dB. */
export function eqGain(value) {
  const v = clamp(value, -1, 1);
  if (v >= 0) return dbToGain(v * EQ_BOOST_DB);
  return (1 + v) ** 2;
}

export const faderGain = (value) => clamp(value, 0, 1) ** FADER_CURVE_POWER;

/** Constant-power crossfader: -1 = all channel 1, +1 = all channel 2. */
export function crossfaderGains(position) {
  const angle = ((clamp(position, -1, 1) + 1) / 2) * (Math.PI / 2);
  return { left: Math.cos(angle), right: Math.sin(angle) };
}

/** Master knob 0..1: squared taper, unity at the default position. */
export const masterGain = (value) => (clamp(value, 0, 1) / MASTER_UNITY_POSITION) ** 2;

/**
 * One-knob filter. Negative sweeps a low-pass down from 20 kHz, positive
 * sweeps a high-pass up from 20 Hz, and the unused half stays parked at its
 * extreme so the signal path (and therefore the sound) never switches.
 */
export function cfxSettings(value) {
  const v = clamp(value, -1, 1);
  const amount = Math.abs(v) < CFX_DEADZONE ? 0 : Math.abs(v);
  const sweep = (from, to) => from * (to / from) ** amount;
  return {
    lowpassHz: v < 0 ? sweep(CFX_MAX_LOWPASS_HZ, CFX_MIN_LOWPASS_HZ) : CFX_MAX_LOWPASS_HZ,
    highpassHz: v > 0 ? sweep(CFX_MIN_HIGHPASS_HZ, CFX_MAX_HIGHPASS_HZ) : CFX_MIN_HIGHPASS_HZ,
    q: CFX_BASE_Q + (CFX_MAX_Q - CFX_BASE_Q) * amount,
    active: amount > 0,
  };
}

/** Steps the beat-FX length selector one position, clamped to the ends. */
export function stepBeatFx(index, direction) {
  return clamp(index + Math.sign(direction), 0, BEAT_FX_BEATS.length - 1);
}

/** Does the FX channel switch ('1' | '2' | '1&2') include channel `channel` (1 or 2)? */
export function fxIncludesChannel(selection, channel) {
  return selection === '1&2' || selection === String(channel);
}

/**
 * Tempo the echo follows for a channel selection: the playing deck(s) of the
 * selected channels, averaged. Falls back to the first selected deck.
 */
export function fxReferenceBpm(selection, decks) {
  const selected = decks.filter((deck, i) => fxIncludesChannel(selection, i + 1));
  const playing = selected.filter((deck) => deck.playing && deck.bpm > 0);
  const pool = playing.length ? playing : selected.filter((deck) => deck.bpm > 0);
  if (pool.length === 0) return 0;
  return pool.reduce((sum, deck) => sum + deck.bpm, 0) / pool.length;
}
