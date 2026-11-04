/** Small builders shared by song recipes. */

const DEFAULT_STEPS = [0, 3, 6, 8, 11, 14];
const DEFAULT_ORDER = [1, 2, 3, 2, 1, 0];
const DEFAULT_VELOCITY = [0.8, 0.7, 0.7, 0.7, 0.7, 0.6];

/**
 * Builds a lead motif that arpeggiates the chord of every bar.
 * Returns entries shaped like `[bar of phrase, step, midi, length in steps, velocity]`.
 * The second bar of a chord climbs one chord tone higher for a little movement.
 *
 * @param {Array<{ chord: number[], bars: number }>} harmony
 */
export function arpeggio(harmony, { steps = DEFAULT_STEPS, order = DEFAULT_ORDER, octave = 12, velocity = DEFAULT_VELOCITY, length = 1 } = {}) {
  const motif = [];
  let bar = 0;
  for (const { chord, bars } of harmony) {
    for (let i = 0; i < bars; i += 1) {
      steps.forEach((step, n) => {
        const degree = order[n % order.length] + i;
        const wraps = Math.floor(degree / chord.length);
        motif.push([bar, step, chord[degree % chord.length] + octave + wraps * 12, length, velocity[n % velocity.length]]);
      });
      bar += 1;
    }
  }
  return motif;
}
