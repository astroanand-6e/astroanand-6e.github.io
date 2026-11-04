/** Home view: units as rows of level cards, a running star total, Free play, Skip ahead. */
import { MAX_STARS } from '../scoring.js';
import { h, svg } from './dom.js';
import { soloStar, starsRow } from './stars.js';

const LOCK_PATH = 'M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6z';

const lockIcon = () =>
  svg('svg', { class: 'lz-lock', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: LOCK_PATH }));

function cardLabel(lesson, earned, open) {
  const base = `Level ${lesson.number}, ${lesson.title}. ${earned} of ${MAX_STARS} stars.`;
  return open ? base : `${base} Locked until level ${lesson.number - 1} is done.`;
}

function levelCard(lesson, { starsOf, isOpen, onStart, onSkip }) {
  const earned = starsOf(lesson.id);
  const open = isOpen(lesson);
  const state = !open ? 'is-locked' : earned > 0 ? 'is-done' : 'is-open';
  const main = h(
    'button',
    {
      class: 'lz-card-main',
      type: 'button',
      'aria-label': cardLabel(lesson, earned, open),
      'aria-disabled': open ? false : 'true',
      title: open ? false : `Finish level ${lesson.number - 1} first`,
      onClick: open ? () => onStart(lesson) : undefined,
    },
    h('span', { class: 'lz-card-no', text: String(lesson.number) }),
    h('span', { class: 'lz-card-title', text: lesson.title }),
    h('span', { class: 'lz-card-blurb', text: lesson.blurb }),
    open ? starsRow(earned, { size: 'sm' }) : lockIcon(),
  );
  const skip = open
    ? null
    : h('button', {
      class: 'lz-card-skip',
      type: 'button',
      'aria-label': `Skip ahead to level ${lesson.number}, ${lesson.title}`,
      text: 'Skip ahead',
      onClick: () => onSkip(lesson),
    });
  return h('li', { class: `lz-card ${state}` }, main, skip);
}

function unitSection(unit, deps) {
  const earned = unit.lessons.reduce((total, lesson) => total + deps.starsOf(lesson.id), 0);
  const headingId = `lz-unit-${unit.id}`;
  return h(
    'section',
    { class: 'lz-unit', 'aria-labelledby': headingId },
    h(
      'header',
      { class: 'lz-unit-head' },
      h('span', { class: 'lz-unit-no', text: `Unit ${unit.number}` }),
      h('h3', { class: 'lz-unit-title', id: headingId, text: unit.title }),
      h('span', { class: 'lz-unit-score', text: `${earned} / ${unit.lessons.length * MAX_STARS}` }),
    ),
    h('ol', { class: 'lz-cards', style: `--cols:${unit.lessons.length}` }, unit.lessons.map((lesson) => levelCard(lesson, deps))),
  );
}

/**
 * deps: { units, starsOf(id), isOpen(lesson), total, max, onStart(lesson), onSkip(lesson), onFree() }
 */
export function renderHome(deps) {
  const { units, total, max, onFree, onSkip, isOpen } = deps;
  const levels = units.reduce((count, unit) => count + unit.lessons.length, 0);
  const finale = units[units.length - 1].lessons.slice(-1)[0];
  return h(
    'div',
    { class: 'lz lz-home' },
    h(
      'header',
      { class: 'lz-home-head' },
      h(
        'div',
        { class: 'lz-home-title' },
        h('p', { class: 'lz-eyebrow', text: 'Lessons' }),
        h('h2', { class: 'lz-heading', text: 'Learn to mix' }),
      ),
      h(
        'p',
        { class: 'lz-total', 'aria-label': `${total} of ${max} stars` },
        h('span', { class: 'lz-total-num', text: String(total) }),
        h('span', { class: 'lz-total-of', text: `/ ${max}` }),
        soloStar(),
      ),
    ),
    h('p', { class: 'lz-intro', text: `${levels} short levels, ending in a real bass swap.` }),
    h('div', { class: 'lz-units' }, units.map((unit) => unitSection(unit, deps))),
    h(
      'footer',
      { class: 'lz-home-foot' },
      h('button', { class: 'lz-btn', type: 'button', text: 'Free play', onClick: onFree }),
      isOpen(finale)
        ? null
        : h('button', { class: 'lz-link', type: 'button', text: `Skip to ${finale.title.toLowerCase()}`, onClick: () => onSkip(finale) }),
      h('p', { class: 'lz-note', text: 'Stars are saved in this browser.' }),
    ),
  );
}
