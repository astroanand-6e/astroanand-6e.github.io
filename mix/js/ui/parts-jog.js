/** Jog wheel: scalloped grip rim, lit arc, and a platter that turns with the track. */
import { controlGroup, ringCircle } from './parts-common.js';
import { JOG } from './layout.js';
import { arcPath, s, scallopPath, append } from './svg.js';

const GLOW_ARC_DEG = Object.freeze([153, 244.7]);
const GLOW_RADIUS = 60.3;
const GLOW_WIDTH = 5;
const RIM_FACE_INSET = 3.2;
const GROOVE_RADII = Object.freeze([31, 39, 47.5]);
const TICK_RADII = Object.freeze([41, 51]);
const RING_GAP = 3.6;

export function buildJog(control, spec) {
  const g = controlGroup(control, spec, { 'aria-roledescription': 'jog wheel' });
  const glow = s('path', { class: 'jog-glow', d: arcPath(GLOW_RADIUS, GLOW_ARC_DEG[0], GLOW_ARC_DEG[1]), 'stroke-width': GLOW_WIDTH });
  const spinner = s('g', { class: 'jog-spinner' },
    s('line', { class: 'jog-tick', x1: 0, y1: -TICK_RADII[1], x2: 0, y2: -TICK_RADII[0] }),
    s('circle', { class: 'jog-dot', cx: 0, cy: TICK_RADII[0] + 5, r: 1.5 }),
    s('circle', { class: 'jog-ring', r: JOG.ringR }));
  append(g,
    s('circle', { class: 'hit', r: JOG.rimR + 1.5 }),
    s('path', { class: 'jog-rim', d: scallopPath(JOG.rimR, JOG.lobeDepth, JOG.lobes) }),
    s('circle', { class: 'jog-rim-face', r: JOG.rimR - RIM_FACE_INSET }),
    glow,
    s('circle', { class: 'jog-platter', r: JOG.platterR }),
    GROOVE_RADII.map((r) => s('circle', { class: 'jog-groove', r })),
    s('circle', { class: 'jog-sheen', r: JOG.platterR }),
    spinner,
  );
  let lastAngle = null;
  let lastGlow = null;
  return {
    control,
    spec,
    g,
    ring: ringCircle(JOG.rimR + RING_GAP),
    apply(value) {
      g.classList.toggle('is-touched', Boolean(value && value.touch));
      return false;
    },
    /** Sets the platter angle in degrees; skips the DOM write when it did not move. */
    rotate(deg) {
      const rounded = Math.round(deg * 20) / 20;
      if (rounded === lastAngle) return;
      lastAngle = rounded;
      spinner.setAttribute('transform', `rotate(${rounded})`);
    },
    glow(level) {
      if (level === lastGlow) return;
      lastGlow = level;
      glow.style.opacity = String(level);
    },
    light: () => {},
  };
}
