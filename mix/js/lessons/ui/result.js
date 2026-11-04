/** Result card: stars, 1 or 2 lines of feedback with numbers, the finale's breakdown, Retry / Next. */
import { MAX_STARS } from '../scoring.js';
import { h } from './dom.js';
import { soloStar, stamp, starsRow } from './stars.js';

function bestNote(stars, previousBest) {
  if (previousBest > stars) return `Your best on this level is ${previousBest} of ${MAX_STARS}.`;
  if (previousBest > 0 && stars > previousBest) return 'A new best.';
  return null;
}

function breakdown(rows) {
  return h(
    'dl',
    { class: 'lz-rows' },
    rows.map((row) =>
      h(
        'div',
        { class: `lz-row ${row.ok ? 'is-ok' : 'is-off'}` },
        h('dt', { text: row.label }),
        h('dd', {}, row.value, h('span', { class: 'lz-sr', text: row.ok ? '. On target.' : '. Off target.' })),
      )),
  );
}

/**
 * deps: { lesson, unit, result, previousBest, total, max, next, isFinale,
 *         onRetry(), onNext(), onHome(), onFree() }
 * `next` is the following lesson, or null for the last level.
 */
export function renderResult(deps) {
  const { lesson, result, previousBest, total, max, next, isFinale, onRetry, onNext, onHome, onFree } = deps;
  const note = bestNote(result.stars, previousBest);
  const primary = next
    ? h('button', { class: 'lz-btn lz-btn-primary', type: 'button', text: `Next: ${next.title}`, onClick: onNext })
    : h('button', { class: 'lz-btn lz-btn-primary', type: 'button', text: 'Try free play', onClick: onFree });
  return h(
    'section',
    { class: `lz lz-result${isFinale ? ' is-final' : ''}`, 'aria-label': `Level ${lesson.number} result`, tabindex: '-1' },
    h('p', { class: 'lz-kicker', text: `Level ${lesson.number} complete` }),
    h('h2', { class: 'lz-title', text: lesson.title }),
    h(
      'div',
      { class: 'lz-reward' },
      starsRow(result.stars, { reveal: true, size: 'lg' }),
      result.stars === MAX_STARS ? stamp() : null,
    ),
    h('p', { class: 'lz-star-note', text: `${result.stars} of ${MAX_STARS} stars${note ? `. ${note}` : ''}` }),
    h('ul', { class: 'lz-lines' }, result.lines.map((line) => h('li', { text: line }))),
    result.rows ? breakdown(result.rows) : null,
    h(
      'p',
      { class: 'lz-total-line' },
      h('span', { class: 'lz-total-label', text: 'Total' }),
      h('span', { class: 'lz-total-num', text: String(total) }),
      h('span', { class: 'lz-total-of', text: `/ ${max}` }),
      soloStar(),
    ),
    h(
      'footer',
      { class: 'lz-foot lz-foot-result' },
      primary,
      h('button', { class: 'lz-btn', type: 'button', text: 'Retry', onClick: onRetry }),
      h('button', { class: 'lz-link', type: 'button', text: 'All levels', onClick: onHome }),
    ),
  );
}
