/** Colors shared by the unit's LEDs and the deck display. */

/** Hot cue pads A to H, in pad order. */
export const HOT_CUE_COLORS = Object.freeze([
  '#ff5a5a', '#ff8a2e', '#ffd23f', '#45d483', '#2ec5e6', '#4c7dff', '#a266ff', '#ff5fa8',
]);

export const MODE_COLORS = Object.freeze({ padfx: '#a266ff', beatjump: '#45d483', sampler: '#4c7dff' });

/** The deck display is a dark panel in both themes, so these do not follow the page theme. */
export const SCREEN = Object.freeze({
  panel: '#0d0e12',
  lane: '#08090c',
  ink: '#ece7de',
  dim: '#9a968e',
  faint: '#4a4b52',
  grid: 'rgba(236, 231, 222, 0.14)',
  sakura: '#f4a7b9',
  green: '#45d483',
  amber: '#ffb347',
  red: '#ff5a5a',
  led: '#ff8a2e',
  bands: Object.freeze(['#ff4d78', '#ffae42', '#8fe3ff']),
});

export const FONTS = Object.freeze({
  text: '"Geist", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace',
  display: '"Instrument Serif", Georgia, serif',
});
