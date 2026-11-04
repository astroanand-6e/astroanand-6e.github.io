import { CHAPTERS } from './story/chapters.js';
import { initScrolly, getCurrentIndex, scrollToChapter } from './story/scrolly.js';
import { initReveal } from './story/reveal.js';
import { initRail } from './story/rail.js';
import { initZone } from './story/zone.js';
import { initSlotClip } from './story/slot-clip.js';
import { initActivity } from './story/activity.js';
import { initTheme, toggleTheme } from './theme.js';

const GREETING_INTERVAL_MS = 2800;
const IDLE_TIMEOUT_MS = 1500;
const IDLE_FALLBACK_MS = 250;
const NO_WEBGL_CLASS = 'no-webgl';
const TEXT_INPUT_SELECTOR = 'input[type="text"], input[type="search"], input[type="email"], textarea, select, [contenteditable="true"]';

const root = document.documentElement;
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));

/* Split-flap greeting */
function initGreeting() {
  const el = document.getElementById('greeting');
  if (!el || !el.dataset.words) return;
  const words = el.dataset.words.split('|');
  const langs = el.dataset.langs.split('|');
  const label = el.getAttribute('aria-label');
  const slot = document.createElement('span');
  slot.className = 'flap-word';
  slot.setAttribute('aria-hidden', 'true');
  el.replaceChildren(slot);
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  let i = 0;
  const show = () => {
    slot.textContent = words[i];
    slot.lang = langs[i];
    slot.classList.remove('flip');
    void slot.offsetWidth;
    slot.classList.add('flip');
    i = (i + 1) % words.length;
  };
  show();
  setInterval(() => {
    if (!document.hidden) show();
  }, GREETING_INTERVAL_MS);
}

/* HTML twins of the 3D controls */
function pickLabel(input) {
  const labels = (input.dataset.labels || '').split('|');
  if (labels.length !== 3) return;
  const v = Number(input.value);
  input.setAttribute('aria-valuetext', labels[v < 0.34 ? 0 : v > 0.66 ? 2 : 1]);
}

function updateVoiceLine(value) {
  const line = document.getElementById('voice-line');
  if (!line || !line.dataset[value]) return;
  line.textContent = line.dataset[value];
  line.lang = value === 'roman' ? 'hi-Latn' : 'hi';
}

function updateSoundLabel(button, on) {
  if (button.id === 'sound-btn') button.textContent = on ? 'Sound on (M)' : 'Sound off (M)';
}

function dispatchControl(action, value) {
  emit('control', { action, value });
}

function onControlClick(event) {
  const el = event.target.closest('button[data-action]');
  if (!el) return;
  const { action } = el.dataset;
  if (action === 'break') {
    window.dispatchEvent(new CustomEvent('break'));
    return;
  }
  let value = el.dataset.value;
  if ('toggle' in el.dataset) {
    value = el.getAttribute('aria-pressed') !== 'true';
    el.setAttribute('aria-pressed', String(value));
    updateSoundLabel(el, value);
  } else if (el.closest('[data-group]')) {
    el.closest('[data-group]').querySelectorAll(`button[data-action="${action}"]`).forEach((b) => {
      b.setAttribute('aria-pressed', String(b === el));
    });
  }
  if (action === 'voice-script') updateVoiceLine(value);
  dispatchControl(action, value);
}

function onRangeInput(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'range' || !input.dataset.action) return;
  pickLabel(input);
  dispatchControl(input.dataset.action, Number(input.value));
}

function initControls() {
  document.addEventListener('click', onControlClick);
  document.addEventListener('input', onRangeInput);
  document.querySelectorAll('input[type="range"][data-labels]').forEach(pickLabel);
}

/* Help dialog and keyboard */
function toggleHelp(open) {
  const dialog = document.getElementById('help');
  if (!dialog) return;
  const shouldOpen = open === undefined ? !dialog.open : open;
  if (!shouldOpen) return dialog.close ? dialog.close() : dialog.removeAttribute('open');
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute('open', '');
}

function stepChapter(delta) {
  const current = Math.max(0, getCurrentIndex());
  scrollToChapter(Math.min(CHAPTERS.length - 1, Math.max(0, current + delta)));
}

function onKeydown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest && event.target.closest(TEXT_INPUT_SELECTOR)) return;
  const helpOpen = document.getElementById('help')?.open;
  const key = event.key.toLowerCase();
  if (key === '?') return toggleHelp();
  if (helpOpen) return;
  if (key === 't') toggleTheme();
  else if (key === 'j') stepChapter(1);
  else if (key === 'k') stepChapter(-1);
  else if (key === 'b') window.dispatchEvent(new CustomEvent('break'));
  else if (key === 'm') document.getElementById('sound-btn')?.click();
}

function initKeyboard() {
  document.addEventListener('keydown', onKeydown);
  document.getElementById('help-btn')?.addEventListener('click', () => toggleHelp(true));
  document.getElementById('help-close')?.addEventListener('click', () => toggleHelp(false));
}

/* Stage (loaded after first paint) */
function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch (error) {
    return false;
  }
}

function failStage(reason) {
  root.classList.add(NO_WEBGL_CLASS);
  emit('stage-error', { message: String(reason && reason.message ? reason.message : reason) });
}

function startStage() {
  const canvas = document.getElementById('stage');
  if (!canvas) return failStage('missing canvas');
  if (navigator.onLine === false) return failStage('offline');
  if (!hasWebGL()) return failStage('webgl unavailable');
  try {
    import('./stage/renderer.js')
      .then((m) => m.startStage({ canvas, theme: root.dataset.theme }))
      .catch(failStage);
  } catch (error) {
    failStage(error);
  }
}

function whenIdle(task) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
  else setTimeout(task, IDLE_FALLBACK_MS);
}

function init() {
  initTheme();
  initGreeting();
  initControls();
  initKeyboard();
  initRail();
  initScrolly();
  initReveal();
  initZone();
  initSlotClip();
  initActivity();
  const launch = () => whenIdle(startStage);
  if (document.readyState === 'complete') launch();
  else window.addEventListener('load', launch, { once: true });
}

init();
