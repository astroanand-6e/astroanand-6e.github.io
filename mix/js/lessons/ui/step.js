/**
 * Step view: lesson title, step progress, the instruction, what to look for, a live readout,
 * the hint, and Continue. update(view) is called every frame with lesson-run's view(), so it
 * only touches the DOM when a value changed.
 */
import { targetLabel } from '../text.js';
import { h } from './dom.js';

const BEAT_DOTS = 4;
const BUSY_TEXT = 'Getting the decks ready.';
const PAUSED_TEXT = 'Paused while you play freely. Come back to Lessons to carry on.';
const DONE_ANNOUNCEMENT = 'Step done. Press Continue.';
/** Readout parts are separated by 3 spaces; each part wraps as a unit. */
const READOUT_GAP = /\s{3,}/;

export function createStepView({ lesson, unit, onBack, onRestart, onContinue, onSkipStep }) {
  const count = lesson.steps.length;
  const cache = {};
  let latest = null;

  const segments = lesson.steps.map(() => h('li'));
  const dots = Array.from({ length: BEAT_DOTS }, () => h('i'));
  const refs = {
    progressLabel: h('span', { class: 'lz-progress-label' }),
    text: h('p', { class: 'lz-text', 'aria-live': 'polite' }),
    chips: h('span', { class: 'lz-chips' }),
    targets: h('p', { class: 'lz-targets' }, h('span', { class: 'lz-targets-label', text: 'Look for' })),
    beats: h('span', { class: 'lz-beats', 'aria-hidden': 'true' }, dots),
    readoutText: h('span', { class: 'lz-readout-text' }),
    meterFill: h('span'),
    hintText: h('span', { class: 'lz-hint-text' }),
    live: h('p', { class: 'lz-sr', role: 'status' }),
    skip: h('button', { class: 'lz-link', type: 'button', text: 'Skip this step', hidden: true, onClick: onSkipStep }),
    next: h('button', { class: 'lz-btn lz-btn-primary lz-continue', type: 'button', 'aria-disabled': 'true' }),
  };
  refs.targets.append(refs.chips);
  refs.next.addEventListener('click', () => {
    if (latest && latest.status === 'done') onContinue();
  });

  const progress = h('div', { class: 'lz-progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(count) },
    h('ol', { class: 'lz-segments' }, segments), refs.progressLabel);
  const readout = h('div', { class: 'lz-readout', hidden: true }, refs.beats, refs.readoutText);
  const meter = h('div', { class: 'lz-meter', role: 'progressbar', 'aria-label': 'Progress through the hold', 'aria-valuemin': '0', 'aria-valuemax': '1', hidden: true }, refs.meterFill);
  const hint = h('p', { class: 'lz-hint', hidden: true }, h('span', { class: 'lz-hint-label', text: 'Hint' }), refs.hintText);

  const el = h(
    'section',
    { class: 'lz lz-step', 'aria-label': `Level ${lesson.number}: ${lesson.title}`, tabindex: '-1' },
    h(
      'header',
      { class: 'lz-bar' },
      h('button', { class: 'lz-link lz-back', type: 'button', text: 'All levels', onClick: onBack }),
      h('p', { class: 'lz-kicker', text: `Unit ${unit.number}, level ${lesson.number}` }),
    ),
    h('h2', { class: 'lz-title', text: lesson.title }),
    progress,
    refs.text,
    refs.targets,
    readout,
    meter,
    hint,
    refs.live,
    h('footer', { class: 'lz-foot' }, h('button', { class: 'lz-link', type: 'button', text: 'Restart level', onClick: onRestart }), refs.skip, refs.next),
  );

  /** Runs `write` only when `value` differs from what was last written under `key`. */
  function changed(key, value, write) {
    if (cache[key] === value) return;
    cache[key] = value;
    write(value);
  }

  function writeText(view) {
    const messages = {
      busy: BUSY_TEXT,
      paused: PAUSED_TEXT,
      error: view.error ? `${view.error}. Try restarting the level.` : 'Something went wrong. Try restarting the level.',
    };
    changed('text', messages[view.status] || view.text, (value) => { refs.text.textContent = value; });
  }

  function writeProgress(view) {
    const finishedStep = view.status === 'done';
    segments.forEach((segment, i) => {
      const done = i < view.index || (i === view.index && finishedStep);
      const current = i === view.index && !finishedStep;
      changed(`seg${i}`, `${done}${current}`, () => {
        segment.className = done ? 'is-done' : current ? 'is-current' : '';
      });
    });
    changed('progress', `${view.index}`, () => {
      progress.setAttribute('aria-valuenow', String(view.index + 1));
      progress.setAttribute('aria-valuetext', `Step ${view.index + 1} of ${count}`);
      refs.progressLabel.textContent = `Step ${view.index + 1} of ${count}`;
    });
  }

  function writeTargets(view) {
    const showing = view.status === 'active' || view.status === 'busy';
    changed('targets', `${showing}|${view.targets.join()}`, () => {
      refs.targets.hidden = !showing;
      refs.chips.replaceChildren(...view.targets.map((id) => h('span', { class: 'lz-chip', text: targetLabel(id) })));
    });
  }

  function writeReadout(view) {
    const live = view.status === 'active' || view.status === 'done';
    const text = live ? view.readout : null;
    changed('readout', `${text}|${Boolean(view.beat)}`, () => {
      readout.hidden = !text && !view.beat;
      refs.beats.hidden = !view.beat;
      const parts = text ? text.split(READOUT_GAP) : [];
      refs.readoutText.replaceChildren(...parts.map((part) => h('span', { text: `${part} ` })));
    });
    const index = view.beat && view.beat.playing ? view.beat.beat - 1 : -1;
    changed('beat', index, () => dots.forEach((dot, i) => dot.classList.toggle('is-on', i === index)));
  }

  function writeMeter(view) {
    const value = view.progress === null || view.status === 'busy' ? null : view.progress;
    changed('meter', value === null ? null : Math.round(value * 100), (percent) => {
      meter.hidden = percent === null;
      if (percent === null) return;
      refs.meterFill.style.setProperty('--p', String(percent / 100));
      meter.setAttribute('aria-valuenow', String(percent / 100));
    });
  }

  function writeActions(view) {
    changed('hint', view.hint, (value) => {
      hint.hidden = !value;
      refs.hintText.textContent = value || '';
    });
    changed('skip', view.canSkip, (value) => { refs.skip.hidden = !value; });
    changed('next', `${view.status === 'done'}|${view.isLast}`, () => {
      const ready = view.status === 'done';
      refs.next.setAttribute('aria-disabled', String(!ready));
      refs.next.textContent = view.isLast ? 'Finish' : 'Continue';
      refs.live.textContent = ready ? DONE_ANNOUNCEMENT : '';
    });
  }

  function update(view) {
    latest = view;
    el.dataset.status = view.status;
    writeText(view);
    writeProgress(view);
    writeTargets(view);
    writeReadout(view);
    writeMeter(view);
    writeActions(view);
  }

  return { el, update };
}
