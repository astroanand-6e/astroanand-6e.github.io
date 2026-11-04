/** Sakura stars and the hanko-style stamp for a 3 star level. */
import { MAX_STARS } from '../scoring.js';
import { h, svg } from './dom.js';

const STAR_POINTS = 5;
const OUTER_RADIUS = 10.5;
const INNER_RADIUS = 4.7;
const CENTER = 12;

/** Polygon points for a five pointed star inside a 24 x 24 box. */
function starPoints() {
  const coords = [];
  for (let i = 0; i < STAR_POINTS * 2; i += 1) {
    const radius = i % 2 === 0 ? OUTER_RADIUS : INNER_RADIUS;
    const angle = -Math.PI / 2 + (i * Math.PI) / STAR_POINTS;
    coords.push(`${(CENTER + radius * Math.cos(angle)).toFixed(2)},${(CENTER + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return coords.join(' ');
}

const POINTS = starPoints();

function starIcon(earned, index, reveal) {
  return svg(
    'svg',
    {
      class: `lz-star${earned ? ' is-on' : ''}${reveal && earned ? ' is-pop' : ''}`,
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      style: `--i:${index}`,
    },
    svg('polygon', { points: POINTS }),
  );
}

/** Row of stars; `reveal` makes the earned ones pop in one after another. */
export function starsRow(earned, { reveal = false, size = 'md' } = {}) {
  const icons = Array.from({ length: MAX_STARS }, (_, i) => starIcon(i < earned, i, reveal));
  return h('span', { class: `lz-stars lz-stars-${size}`, role: 'img', 'aria-label': `${earned} of ${MAX_STARS} stars` }, icons);
}

/** One filled star, used beside the running total. */
export const soloStar = () => starIcon(true, 0, false);

/** The seal that lands beside a perfect result. */
export const stamp = () => h('span', { class: 'lz-stamp', 'aria-hidden': 'true', text: 'MIX' });
