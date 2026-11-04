/**
 * "Ink Signal": 126 BPM, A minor (8A), tech house.
 * Tight punchy kick, gritty resonant saw bass rolling in 16ths, short saw
 * stabs into a dotted echo, FM blips on top.
 */
import { A_MINOR } from './scales.js';

export default {
  id: 'ink-signal',
  title: 'Ink Signal',
  artist: 'AT',
  bpm: 126,
  key: 'A minor',
  camelot: '8A',
  seed: 202,
  scale: A_MINOR,
  swing: 0.1,
  fillGain: 0.532,
  fillSend: 0.12,

  kit: {
    kick: { type: 'kick', length: 0.4, start: 210, end: 55, tauPitch: 0.03, decay: 0.15, click: 0.45, drive: 2.2 },
    clap: { type: 'clap', length: 0.28, freq: 1700, q: 1.1, bursts: [0, 0.009, 0.018, 0.028], decay: 0.07, variants: 2 },
    hatClosed: { type: 'hat', length: 0.08, cutoff: 8000, decay: 0.012, metal: 0.4, variants: 4 },
    hatOpen: { type: 'hat', length: 0.3, cutoff: 7500, decay: 0.07, metal: 0.45, variants: 2 },
    shaker: { type: 'shaker', length: 0.1, freq: 8500, q: 1.1, decay: 0.02, attack: 0.005, variants: 2 },
    conga: { type: 'tone', length: 0.16, start: 360, end: 240, tauPitch: 0.025, decay: 0.07, tick: 0.3, overtone: 1.7, variants: 2 },
    rim: { type: 'tone', length: 0.09, start: 1700, end: 1300, tauPitch: 0.008, decay: 0.02, tick: 0.5, overtone: 2.4 },
    fill: { type: 'snare', length: 0.22, tone: 210, decay: 0.07, freq: 2600 },
  },

  drums: [
    { layer: 'kick', hit: 'kick', pattern: '9...9...9...9...', gain: 0.827, swing: false, jitter: 0.02 },
    { layer: 'hatOpen', hit: 'hatOpen', pattern: '..8...8...8...8.', gain: 0.56 },
    { layer: 'hatClosed', hit: 'hatClosed', pattern: '3544354435443544', gain: 0.48 },
    { layer: 'shaker', hit: 'shaker', pattern: '.3.5.3.5.3.5.3.5', gain: 0.27 },
    { layer: 'clap', hit: 'clap', pattern: '....9.......9...', gain: 0.85, send: 0.3, swing: false },
    { layer: 'perc', hit: 'conga', pattern: '...6...5..7....6', gain: 0.468, send: 0.1 },
    { layer: 'perc', hit: 'rim', pattern: '...........6....', gain: 0.288 },
  ],

  harmony: [
    { root: 45, chord: [60, 64, 69], bars: 3 }, // Am
    { root: 43, chord: [59, 62, 67], bars: 1 }, // G
    { root: 45, chord: [60, 64, 69], bars: 2 }, // Am
    { root: 41, chord: [60, 65, 69], bars: 1 }, // F
    { root: 43, chord: [59, 62, 67], bars: 1 }, // G
  ],

  bass: {
    voice: 'subtractive',
    params: {
      shape: 'saw', detune: [0, 6], sub: 0.5, subRatio: 0.5, cutoff: 260, cutoffAmount: 1500, cutoffTau: 0.05, q: 3.5,
      attack: 0.003, decay: 0.25, sustain: 0.8, release: 0.03, drive: 1.8, level: 0.853,
    },
    patterns: {
      A: [
        [[2, 0, 1, 0.9], [3, 0, 1, 0.6], [6, 0, 1, 0.9], [7, 12, 1, 0.6], [10, 0, 1, 0.9], [11, 0, 1, 0.6], [14, 0, 1, 0.9], [15, -2, 1, 0.6]],
        [[2, 0, 1, 0.9], [3, 0, 1, 0.6], [6, 0, 1, 0.9], [7, 0, 1, 0.6], [10, 12, 1, 0.8], [11, 0, 1, 0.6], [14, 0, 1, 0.9], [15, 3, 1, 0.6]],
      ],
      B: [
        [[0, 0, 1, 0.7], [2, 0, 1, 0.9], [3, 0, 1, 0.6], [6, 0, 1, 0.9], [7, 12, 1, 0.6], [8, 0, 1, 0.7], [10, 0, 1, 0.9], [11, 0, 1, 0.6], [14, 0, 1, 0.9], [15, -2, 1, 0.6]],
        [[0, 0, 1, 0.7], [2, 0, 1, 0.9], [3, 12, 1, 0.6], [6, 0, 1, 0.9], [7, 0, 1, 0.6], [8, 0, 1, 0.7], [10, 0, 1, 0.9], [11, 0, 1, 0.6], [14, 7, 1, 0.9], [15, 5, 1, 0.6]],
      ],
      C: [
        [[2, 0, 2, 0.95], [6, 0, 1, 0.9], [7, 12, 1, 0.6], [10, 0, 2, 0.95], [13, 0, 1, 0.7], [14, 7, 1, 0.8], [15, 5, 1, 0.6]],
        [[2, 0, 1, 0.95], [3, 0, 1, 0.6], [6, 0, 2, 0.9], [10, 0, 1, 0.95], [11, 12, 1, 0.6], [14, 0, 1, 0.9], [15, -2, 1, 0.6]],
      ],
    },
  },

  chords: {
    voice: 'subtractive',
    params: {
      shape: 'saw', detune: [-7, 7], cutoff: 900, cutoffAmount: 2600, cutoffTau: 0.06, q: 1.4,
      attack: 0.002, decay: 0.1, sustain: 0.15, release: 0.12, level: 0.637, drive: 1.2,
    },
    rhythm: [
      [[3, 1, 0.8], [6, 1, 0.6], [10, 1, 0.7], [13, 1, 0.6]],
      [[2, 1, 0.7], [6, 1, 0.8], [11, 1, 0.6], [14, 1, 0.7]],
    ],
  },

  lead: {
    voice: 'fm',
    params: { ratio: 3.5, index: 3, indexDecay: 0.05, attack: 0.002, decay: 0.12, sustain: 0, release: 0.08, level: 0.5 },
    motif: [
      [0, 2, 76, 1, 0.7], [0, 3, 79, 1, 0.6], [0, 6, 76, 1, 0.7], [0, 10, 81, 1, 0.6], [0, 13, 79, 1, 0.6],
      [1, 2, 76, 1, 0.7], [1, 7, 74, 1, 0.6], [1, 11, 72, 1, 0.6], [1, 14, 69, 1, 0.7],
      [2, 2, 76, 1, 0.7], [2, 3, 79, 1, 0.6], [2, 6, 81, 1, 0.7], [2, 10, 79, 1, 0.6], [2, 13, 76, 1, 0.6],
      [3, 3, 74, 1, 0.7], [3, 7, 79, 1, 0.6], [3, 11, 74, 1, 0.7], [3, 15, 71, 1, 0.6],
      [4, 2, 76, 1, 0.7], [4, 6, 72, 1, 0.7], [4, 10, 76, 1, 0.7], [4, 13, 79, 1, 0.6],
      [5, 3, 81, 1, 0.7], [5, 7, 79, 1, 0.6], [5, 11, 76, 1, 0.6], [5, 14, 72, 1, 0.7],
      [6, 2, 77, 1, 0.7], [6, 6, 81, 1, 0.7], [6, 10, 77, 1, 0.6], [6, 13, 72, 1, 0.6],
      [7, 3, 79, 1, 0.7], [7, 7, 74, 1, 0.7], [7, 11, 71, 1, 0.7], [7, 14, 67, 1, 0.6],
    ],
  },

  pad: {
    voice: 'subtractive',
    transpose: -12,
    params: {
      shape: 'saw', detune: [-12, 0, 12], cutoff: 700, cutoffAmount: 0, q: 1.2, attack: 1.5, release: 1.2, level: 0.25, randomPhase: true,
    },
  },

  riser: { from: 300, to: 10000, q: 1.8, mode: 'band', curve: 2.5, level: 0.48, tone: { from: 110, to: 1760, level: 0.04 } },
  swell: { from: 3000, to: 11000, q: 0.8, mode: 'high', curve: 3, level: 0.2 },
  impact: { length: 1.8, boom: 0.45, boomDecay: 0.5, crash: 0.22, crashDecay: 0.7, crashCutoff: 5000 },

  duck: { bass: { depth: 0.6, tau: 0.1 }, tonal: { depth: 0.4, tau: 0.12 } },
  reverb: { room: 0.7, damp: 0.55, preDelay: 0.012, send: 0.25, wet: 0.8 },
  echo: { beats: 0.75, feedback: 0.5, damp: 0.5 },
  master: { targetRms: 0.23 },
};
