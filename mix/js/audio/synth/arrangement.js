/**
 * The shared 64-bar arrangement. Energy changes only ever land on phrase
 * boundaries (every 8 bars) so lessons can teach phrasing:
 *
 *   bars  1-16  drums only (DJ intro, a layer is added at bar 9)
 *   bars 17-32  bass joins (bar 17), bass variation (bar 25)
 *   bars 33-40  full: chords + lead
 *   bars 41-48  breakdown: no kick, no bass; pads + riser
 *   bars 49-56  drop: everything, impact on the downbeat
 *   bars 57-64  drums only (outro)
 */

export const TOTAL_BARS = 64;
export const PHRASE_BARS = 8;
export const PHRASE_COUNT = TOTAL_BARS / PHRASE_BARS;
export const STEPS_PER_BAR = 16;

const INTRO_DRUMS = ['kick', 'hatOpen', 'shaker'];
const DRUMS = [...INTRO_DRUMS, 'hatClosed', 'clap', 'perc'];
const FULL = [...DRUMS, 'bass', 'chords', 'lead'];

/**
 * One entry per 8-bar phrase.
 *  layers  lane/part names that play in the phrase
 *  bass    which bass pattern letter plays (song recipes define A, B, C)
 *  fill    what the last bar of the phrase does to announce the change
 *  impact  true: a boom + crash on the phrase's first beat
 */
export const PHRASES = Object.freeze([
  { layers: INTRO_DRUMS, bass: null, fill: 'hatRoll', impact: false },
  { layers: DRUMS, bass: null, fill: 'swell', impact: false },
  { layers: [...DRUMS, 'bass'], bass: 'A', fill: 'hatRoll', impact: false },
  { layers: [...DRUMS, 'bass'], bass: 'B', fill: 'snareRoll', impact: false },
  { layers: FULL, bass: 'B', fill: 'hatRoll', impact: false },
  { layers: ['shaker', 'pad', 'riser'], bass: null, fill: 'snareBuild', impact: false },
  { layers: [...FULL, 'pad'], bass: 'C', fill: 'hatRoll', impact: true },
  { layers: DRUMS, bass: null, fill: null, impact: false },
].map((phrase) => Object.freeze({ ...phrase, layers: Object.freeze([...phrase.layers]) })));

/** Phrase spec for a 0-based bar index. */
export function phraseOfBar(bar) {
  return PHRASES[Math.floor(bar / PHRASE_BARS)];
}

export const barInPhrase = (bar) => bar % PHRASE_BARS;
export const isLastBarOfPhrase = (bar) => barInPhrase(bar) === PHRASE_BARS - 1;

/** True when a lane/part named `layer` plays in 0-based bar `bar`. */
export function layerActive(layer, bar) {
  return phraseOfBar(bar).layers.includes(layer);
}
