/**
 * "Night Bus": 120 BPM, E minor (9A), minimal.
 * Dry deep kick, tick hats, wood blocks on a 2-bar loop, sparse pulse bass,
 * one dub chord into a long echo, lonely FM bells over a dark drone.
 */
import { E_MINOR } from './scales.js';

export default {
  id: 'night-bus',
  title: 'Night Bus',
  artist: 'AT',
  bpm: 120,
  key: 'E minor',
  camelot: '9A',
  seed: 404,
  scale: E_MINOR,
  swing: 0.12,
  fillGain: 0.476,
  fillSend: 0.1,

  kit: {
    kick: { type: 'kick', length: 0.34, start: 120, end: 62, tauPitch: 0.04, decay: 0.13, click: 0.1, drive: 1.2 },
    clap: { type: 'clap', length: 0.18, freq: 2200, q: 1.5, bursts: [0, 0.007], decay: 0.04, variants: 2 },
    hatClosed: { type: 'hat', length: 0.05, cutoff: 9000, decay: 0.008, metal: 0.5, variants: 4 },
    hatOpen: { type: 'hat', length: 0.2, cutoff: 8500, decay: 0.045, metal: 0.5, variants: 2 },
    shaker: { type: 'shaker', length: 0.08, freq: 9500, q: 1.3, decay: 0.014, attack: 0.003, variants: 3 },
    wood: { type: 'tone', length: 0.1, start: 900, end: 850, tauPitch: 0.005, decay: 0.03, tick: 0.2, overtone: 2, variants: 2 },
    fill: { type: 'tone', length: 0.08, start: 1500, end: 1200, tauPitch: 0.006, decay: 0.02, tick: 0.5, overtone: 2.4 },
  },

  drums: [
    { layer: 'kick', hit: 'kick', pattern: '9...9...9...9...', gain: 0.783, swing: false, jitter: 0.02 },
    { layer: 'hatOpen', hit: 'hatOpen', pattern: '..4...4...4...4.', gain: 0.666 },
    { layer: 'hatClosed', hit: 'hatClosed', pattern: ['.2.3..3..2.3..3.', '.2.3.3...2.3.3..'], gain: 0.765 },
    { layer: 'shaker', hit: 'shaker', pattern: '..3.3...3.3.3...', gain: 0.408 },
    { layer: 'clap', hit: 'clap', pattern: '....5.......5...', gain: 0.51, send: 0.1, swing: false },
    { layer: 'perc', hit: 'wood', pattern: ['...6..5....6.5..', '...6....5..6..5.'], gain: 0.468, send: 0.15 },
  ],

  harmony: [
    { root: 40, chord: [59, 62, 64, 67], bars: 4 }, // Em7
    { root: 38, chord: [57, 62, 66, 69], bars: 2 }, // D
    { root: 40, chord: [59, 62, 64, 67], bars: 2 }, // Em7
  ],

  bass: {
    voice: 'subtractive',
    params: {
      shape: 'pulse', duty: 0.28, detune: [0], sub: 0.5, subRatio: 0.5, cutoff: 420, cutoffAmount: 1800, cutoffTau: 0.035, q: 2.5,
      attack: 0.002, decay: 0.08, sustain: 0.3, release: 0.04, drive: 2, level: 1.4,
    },
    patterns: {
      A: [
        [[3, 0, 1, 0.85], [6, 0, 1, 0.8], [10, 3, 1, 0.8]],
        [[2, 0, 1, 0.85], [7, 0, 1, 0.75], [11, -2, 1, 0.7]],
      ],
      B: [
        [[3, 0, 1, 0.85], [6, 0, 1, 0.8], [10, 3, 1, 0.8], [14, 0, 1, 0.7]],
        [[2, 0, 1, 0.85], [7, 0, 1, 0.75], [11, 5, 1, 0.75], [15, 0, 1, 0.6]],
      ],
      C: [
        [[3, 0, 2, 0.9], [6, 0, 1, 0.8], [10, 7, 1, 0.8], [12, 3, 1, 0.7], [14, 0, 1, 0.7]],
        [[2, 0, 1, 0.9], [5, 0, 1, 0.7], [7, 0, 2, 0.8], [11, 5, 1, 0.75], [14, -2, 1, 0.7]],
      ],
    },
  },

  chords: {
    voice: 'subtractive',
    params: {
      shape: 'saw', detune: [-8, 8], cutoff: 700, cutoffAmount: 1200, cutoffTau: 0.08, q: 1.2,
      attack: 0.002, decay: 0.15, sustain: 0.1, release: 0.15, level: 0.455, drive: 1,
    },
    rhythm: [[[10, 1, 0.8]], [[6, 1, 0.7], [13, 1, 0.5]]],
  },

  lead: {
    voice: 'fm',
    params: { ratio: 3.5, index: 1.8, indexDecay: 0.5, attack: 0.002, decay: 1.2, sustain: 0, release: 0.8, level: 0.455 },
    motif: [
      [0, 4, 83, 2, 0.7], [1, 12, 79, 2, 0.6], [2, 6, 76, 2, 0.6], [3, 10, 74, 2, 0.6],
      [4, 4, 78, 2, 0.7], [5, 12, 81, 2, 0.6], [6, 6, 79, 2, 0.6], [7, 10, 83, 2, 0.7],
    ],
  },

  pad: {
    voice: 'subtractive',
    transpose: -12,
    params: {
      shape: 'saw', detune: [-10, 0, 10], cutoff: 520, cutoffAmount: 0, q: 1, attack: 2, release: 1.5, level: 0.21, randomPhase: true,
    },
  },

  riser: { from: 500, to: 8000, q: 2.2, mode: 'band', curve: 2.8, level: 0.36, tone: { from: 82, to: 659, level: 0.05 } },
  swell: { from: 4000, to: 11000, q: 0.9, mode: 'high', curve: 3, level: 0.16 },
  impact: { length: 1.4, boom: 0.4, boomDecay: 0.4, crash: 0.16, crashDecay: 0.5, crashCutoff: 6000 },

  duck: { bass: { depth: 0.45, tau: 0.09 }, tonal: { depth: 0.35, tau: 0.1 } },
  reverb: { room: 0.6, damp: 0.6, preDelay: 0.015, send: 0.3, wet: 0.7 },
  echo: { beats: 1.5, feedback: 0.55, damp: 0.6 },
  master: { targetRms: 0.23 },
};
