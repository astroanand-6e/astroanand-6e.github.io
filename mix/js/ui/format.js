/** Human readable values for the controller: aria-valuetext and the drag readout. */
import { TEMPO_RANGE } from '../controls.js';

const MINUS = '−';
const EQ_BOOST_DB = 6;
const FLAT_EPSILON = 0.015;
const KILL_LEVEL = -0.985;
const EQ_IDS = /^m\.(hi|mid|low)\d$/;
const CFX_IDS = /^m\.cfx\d$/;

const percent = (fraction) => `${Math.round(fraction * 100)}%`;
const signed = (n, text) => `${n < 0 ? MINUS : '+'}${text}`;

function formatEq(value) {
  if (Math.abs(value) < FLAT_EPSILON) return 'flat';
  if (value <= KILL_LEVEL) return 'kill';
  if (value > 0) return `+${(value * EQ_BOOST_DB).toFixed(1)} dB`;
  return `cut ${percent(-value)}`;
}

function formatCfx(value) {
  if (Math.abs(value) < FLAT_EPSILON) return 'off';
  return value < 0 ? `low-pass ${percent(-value)}` : `high-pass ${percent(value)}`;
}

function formatTempo(value) {
  return signed(value, `${Math.abs(value * TEMPO_RANGE * 100).toFixed(1)}%`);
}

function formatCrossfader(value) {
  if (Math.abs(value) < FLAT_EPSILON) return 'center';
  return value < 0 ? `deck 1 side, ${percent(-value)}` : `deck 2 side, ${percent(value)}`;
}

function formatSwitch(value) {
  return value === '1&2' ? 'channels 1 and 2' : `channel ${value}`;
}

function formatCentered(value) {
  return Math.abs(value) < FLAT_EPSILON ? 'center' : signed(value, percent(Math.abs(value)));
}

/** Text for the current value of one control. */
export function formatValue(control, value) {
  if (control.kind === 'switch') return formatSwitch(value);
  if (EQ_IDS.test(control.id)) return formatEq(value);
  if (CFX_IDS.test(control.id)) return formatCfx(value);
  if (control.id.endsWith('.tempo')) return formatTempo(value);
  if (control.id === 'm.xfader') return formatCrossfader(value);
  if (control.min === 0 && control.max === 1) return percent(value);
  return formatCentered(value);
}

/** Beat length shown by the FX readout: 0.5 becomes "1/2". */
export function formatBeats(beats) {
  if (!Number.isFinite(beats) || beats <= 0) return '';
  if (Number.isInteger(beats)) return String(beats);
  const denominator = Math.round(1 / beats);
  if (Math.abs(1 / denominator - beats) < 1e-6) return `1/${denominator}`;
  return String(Number(beats.toFixed(2)));
}

const METER_FLOOR_DB = -36;

/** Maps a linear peak (0..1) onto a meter, 0 at -36 dB and 1 at full scale, like a mixer's LED ladder. */
export function meterFraction(level) {
  if (!(level > 0)) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(level) - METER_FLOOR_DB) / -METER_FLOOR_DB));
}
