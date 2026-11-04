/**
 * "Charles River": 124 BPM, C major (8B), melodic house.
 * Warm kick, long sustained saw-and-sub bass on the off-beats, supersaw
 * chords, bright arpeggio plucks, lush reverb.
 */
import { arpeggio } from './helpers.js';
import { C_MAJOR } from './scales.js';

const HARMONY = [
  { root: 36, chord: [60, 64, 67, 71], bars: 2 }, // Cmaj7
  { root: 31, chord: [59, 62, 67, 69], bars: 2 }, // G6
  { root: 33, chord: [57, 60, 64, 67], bars: 2 }, // Am7
  { root: 29, chord: [57, 60, 65, 69], bars: 2 }, // F
];

export default {
  id: 'charles-river',
  title: 'Charles River',
  artist: 'AT',
  bpm: 124,
  key: 'C major',
  camelot: '8B',
  seed: 303,
  scale: C_MAJOR,
  swing: 0.06,
  fillGain: 0.42,
  fillSend: 0.3,

  kit: {
    kick: { type: 'kick', length: 0.5, start: 125, end: 49, tauPitch: 0.06, decay: 0.24, click: 0.12, drive: 1.3 },
    clap: { type: 'clap', length: 0.45, freq: 1250, q: 0.7, bursts: [0, 0.012, 0.026], decay: 0.18, variants: 2 },
    hatClosed: { type: 'hat', length: 0.09, cutoff: 7500, decay: 0.014, metal: 0.25, variants: 3 },
    hatOpen: { type: 'hat', length: 0.4, cutoff: 7000, decay: 0.11, metal: 0.35, variants: 2 },
    shaker: { type: 'shaker', length: 0.15, freq: 7000, q: 0.7, decay: 0.045, attack: 0.012, variants: 2 },
    rim: { type: 'tone', length: 0.14, start: 1200, end: 900, tauPitch: 0.01, decay: 0.04, tick: 0.3, overtone: 2.76 },
    fill: { type: 'snare', length: 0.3, tone: 175, decay: 0.12, freq: 1800 },
  },

  drums: [
    { layer: 'kick', hit: 'kick', pattern: '9...9...9...9...', gain: 0.783, swing: false, jitter: 0.02 },
    { layer: 'hatOpen', hit: 'hatOpen', pattern: '..6...6...6...6.', gain: 0.504 },
    { layer: 'hatClosed', hit: 'hatClosed', pattern: '.3.4.3.4.3.4.3.4', gain: 0.42 },
    { layer: 'shaker', hit: 'shaker', pattern: '2413241324132413', gain: 0.27 },
    { layer: 'clap', hit: 'clap', pattern: '....7.......7...', gain: 0.68, send: 0.6, swing: false },
    { layer: 'perc', hit: 'rim', pattern: '..........4...5.', gain: 0.288, send: 0.3 },
  ],

  harmony: HARMONY,

  bass: {
    voice: 'subtractive',
    params: {
      shape: 'saw', detune: [-5, 5], sub: 0.6, subRatio: 1, cutoff: 380, cutoffAmount: 700, cutoffTau: 0.25, q: 1.2,
      attack: 0.01, decay: 3, sustain: 1, release: 0.12, drive: 1.3, level: 1.1,
    },
    patterns: {
      A: [[[2, 0, 3, 0.9], [6, 0, 3, 0.85], [10, 0, 3, 0.9], [14, 0, 2, 0.8]]],
      B: [
        [[2, 0, 3, 0.9], [6, 0, 3, 0.85], [10, 7, 3, 0.85], [14, 0, 2, 0.8]],
        [[2, 0, 3, 0.9], [6, 12, 2, 0.7], [10, 0, 3, 0.9], [14, 7, 2, 0.8]],
      ],
      C: [
        [[2, 0, 3, 0.95], [6, 0, 3, 0.9], [10, 0, 3, 0.95], [13, 12, 1, 0.6], [14, 7, 2, 0.85]],
        [[2, 0, 3, 0.95], [6, 7, 2, 0.8], [10, 0, 3, 0.95], [14, 12, 2, 0.8]],
      ],
    },
  },

  chords: {
    voice: 'subtractive',
    params: {
      shape: 'saw', detune: [-14, -5, 5, 14], cutoff: 1500, cutoffAmount: 2500, cutoffTau: 0.4, q: 0.9,
      attack: 0.02, decay: 1.2, sustain: 0.55, release: 0.5, level: 0.26, randomPhase: true,
    },
    rhythm: [[[0, 15, 0.7]]],
  },

  lead: {
    voice: 'subtractive',
    params: {
      shape: 'saw', detune: [-6, 6], cutoff: 1400, cutoffAmount: 4200, cutoffTau: 0.06, q: 1.1,
      attack: 0.002, decay: 0.2, sustain: 0, release: 0.12, level: 0.351, drive: 1.1,
    },
    motif: arpeggio(HARMONY),
  },

  pad: {
    voice: 'subtractive',
    transpose: 0,
    params: {
      shape: 'saw', detune: [-12, -4, 4, 12], cutoff: 1100, cutoffAmount: 0, q: 0.8, attack: 1.6, release: 1.4, level: 0.225, randomPhase: true,
    },
  },

  riser: { from: 350, to: 9500, q: 1.1, mode: 'band', curve: 2, level: 0.4, tone: { from: 196, to: 1568, level: 0.06 } },
  swell: { from: 2500, to: 10000, q: 0.8, mode: 'high', curve: 3, level: 0.18 },
  impact: { length: 2.6, boom: 0.5, boomDecay: 0.8, crash: 0.24, crashDecay: 1.1, crashCutoff: 4000 },

  duck: { bass: { depth: 0.7, tau: 0.15 }, tonal: { depth: 0.55, tau: 0.18 } },
  reverb: { room: 0.9, damp: 0.4, preDelay: 0.025, send: 0.5, wet: 1 },
  echo: { beats: 0.75, feedback: 0.35, damp: 0.5 },
  master: { targetRms: 0.23 },
};
