/**
 * "Paper Tiger": 122 BPM, A minor (8A), deep house.
 * Round sine sub bass that plays around the kick, electric-piano stabs,
 * soft kalimba lead, warm saw pad in the breakdown.
 */
import { A_MINOR } from './scales.js';

export default {
  id: 'paper-tiger',
  title: 'Paper Tiger',
  artist: 'AT',
  bpm: 122,
  key: 'A minor',
  camelot: '8A',
  seed: 101,
  scale: A_MINOR,
  swing: 0.16,
  fillGain: 0.476,
  fillSend: 0.18,

  kit: {
    kick: { type: 'kick', length: 0.46, start: 140, end: 55, tauPitch: 0.055, decay: 0.19, click: 0.2, drive: 1.5 },
    clap: { type: 'clap', length: 0.34, freq: 1400, q: 0.8, bursts: [0, 0.011, 0.023], decay: 0.12, variants: 2 },
    hatClosed: { type: 'hat', length: 0.1, cutoff: 7200, decay: 0.016, metal: 0.3, variants: 3 },
    hatOpen: { type: 'hat', length: 0.36, cutoff: 6800, decay: 0.085, metal: 0.4, variants: 2 },
    shaker: { type: 'shaker', length: 0.12, freq: 7800, q: 0.9, decay: 0.028, attack: 0.008, variants: 2 },
    rim: { type: 'tone', length: 0.1, start: 1800, end: 1400, tauPitch: 0.008, decay: 0.025, tick: 0.5, overtone: 2.4 },
    fill: { type: 'snare', length: 0.25, tone: 185, decay: 0.09, freq: 2000 },
  },

  drums: [
    { layer: 'kick', hit: 'kick', pattern: '9...9...9...9...', gain: 0.8, swing: false, jitter: 0.02 },
    { layer: 'hatOpen', hit: 'hatOpen', pattern: '..7...7...7...7.', gain: 0.56 },
    { layer: 'hatClosed', hit: 'hatClosed', pattern: '.3.4.3.5.3.4.3.5', gain: 0.51 },
    { layer: 'shaker', hit: 'shaker', pattern: '3524352435243524', gain: 0.3 },
    { layer: 'clap', hit: 'clap', pattern: '....8.......8...', gain: 0.782, send: 0.5, swing: false },
    { layer: 'perc', hit: 'rim', pattern: '.......5.......5', gain: 0.36, send: 0.2 },
  ],

  harmony: [
    { root: 33, chord: [57, 60, 64, 67], bars: 2 }, // Am7
    { root: 38, chord: [57, 60, 62, 65], bars: 2 }, // Dm7
    { root: 41, chord: [57, 60, 64, 65], bars: 2 }, // Fmaj7
    { root: 40, chord: [59, 62, 64, 67], bars: 2 }, // Em7
  ],

  bass: {
    voice: 'sine',
    params: { attack: 0.006, decay: 0.35, sustain: 0.7, release: 0.07, h2: 0.28, drive: 1.5, drop: 1.4, dropTau: 0.03, level: 0.992 },
    // [step, semitones above the chord root, length in steps, velocity]
    patterns: {
      A: [
        [[2, 0, 2, 0.9], [6, 0, 1, 0.65], [7, 7, 1, 0.5], [10, 0, 2, 0.85], [14, 0, 1, 0.7], [15, 3, 1, 0.5]],
        [[2, 0, 2, 0.9], [5, 0, 1, 0.55], [6, 0, 2, 0.8], [10, 0, 1, 0.75], [11, 12, 1, 0.5], [14, 7, 2, 0.7]],
      ],
      B: [
        [[2, 0, 2, 0.9], [3, 0, 1, 0.5], [6, 0, 1, 0.7], [7, 7, 1, 0.5], [10, 0, 2, 0.9], [13, 3, 1, 0.5], [14, 0, 2, 0.8]],
        [[2, 0, 2, 0.9], [5, 0, 1, 0.55], [6, 12, 1, 0.6], [9, 0, 1, 0.6], [10, 0, 2, 0.85], [14, 7, 1, 0.7], [15, 5, 1, 0.5]],
      ],
      C: [
        [[2, 0, 3, 0.95], [6, 0, 1, 0.7], [7, 12, 1, 0.55], [10, 0, 2, 0.9], [12, 7, 1, 0.6], [14, 0, 2, 0.85]],
        [[2, 0, 2, 0.95], [5, 7, 1, 0.6], [6, 0, 2, 0.85], [9, 0, 1, 0.6], [10, 12, 1, 0.6], [11, 0, 1, 0.7], [14, 3, 2, 0.75]],
      ],
    },
  },

  chords: {
    voice: 'fm',
    params: { ratio: 1, index: 2.2, indexDecay: 0.3, tine: 0.18, tineRatio: 7, attack: 0.003, decay: 0.55, sustain: 0.08, release: 0.35, level: 0.3 },
    // [step, length in steps, velocity]
    rhythm: [
      [[3, 2, 0.7], [7, 2, 0.5], [11, 3, 0.6]],
      [[2, 2, 0.7], [6, 2, 0.55], [10, 2, 0.6], [14, 2, 0.5]],
    ],
  },

  lead: {
    voice: 'fm',
    params: { ratio: 2, index: 1.2, indexDecay: 0.12, tine: 0.1, tineRatio: 5, attack: 0.002, decay: 0.5, sustain: 0.05, release: 0.25, level: 0.35 },
    // [bar of phrase, step, midi note, length in steps, velocity]
    motif: [
      [0, 0, 76, 2, 0.8], [0, 6, 72, 2, 0.6], [0, 10, 74, 2, 0.7],
      [1, 4, 69, 2, 0.7], [1, 12, 72, 3, 0.6],
      [2, 0, 74, 2, 0.8], [2, 6, 69, 2, 0.6], [2, 10, 72, 2, 0.7],
      [3, 4, 76, 2, 0.7], [3, 12, 74, 3, 0.6],
      [4, 0, 72, 2, 0.8], [4, 6, 76, 2, 0.6], [4, 10, 69, 2, 0.7],
      [5, 4, 79, 2, 0.7], [5, 12, 76, 3, 0.6],
      [6, 0, 79, 2, 0.8], [6, 6, 76, 2, 0.6], [6, 10, 74, 2, 0.7],
      [7, 4, 71, 2, 0.7], [7, 12, 76, 3, 0.6],
    ],
  },

  pad: {
    voice: 'subtractive',
    transpose: -12,
    params: {
      shape: 'saw', detune: [-9, 0, 9], cutoff: 900, cutoffAmount: 0, q: 0.7, attack: 1.2, release: 1, level: 0.275, randomPhase: true,
    },
  },

  riser: { from: 400, to: 9000, q: 1.4, mode: 'band', curve: 2.2, level: 0.44, tone: { from: 220, to: 1760, level: 0.05 } },
  swell: { from: 2500, to: 9000, q: 0.8, mode: 'high', curve: 3, level: 0.18 },
  impact: { length: 2.2, boom: 0.5, boomDecay: 0.7, crash: 0.2, crashDecay: 0.9, crashCutoff: 4500 },

  duck: { bass: { depth: 0.75, tau: 0.14 }, tonal: { depth: 0.5, tau: 0.16 } },
  reverb: { room: 0.84, damp: 0.5, preDelay: 0.02, send: 0.38, wet: 0.9 },
  echo: { beats: 0.75, feedback: 0.38, damp: 0.4 },
  master: { targetRms: 0.23 },
};
