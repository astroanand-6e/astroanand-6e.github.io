/**
 * Paper and ink themes, shared by the home page and the blog. The crossfader
 * (#theme-toggle) switches them: the new theme spreads out from the switch
 * (css/base.css) and sets the page ringing (./story/resonance.js).
 */
import { resonate } from './story/resonance.js';

const THEME_KEY = 'theme';
const THEMES = Object.freeze({ PAPER: 'paper', INK: 'ink' });
const THEME_COLORS = Object.freeze({ paper: '#F4EFE6', ink: '#0E0F13' });
// Ink spreads out from the switch like ink into paper; paper returns a touch faster.
const REVEAL_MS = Object.freeze({ ink: 1100, paper: 900 });
const SWITCHING_CLASS = 'theme-switching';

const root = document.documentElement;
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
let themeTransition = null;
let themeResonance = null;

function readSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === THEMES.PAPER || saved === THEMES.INK ? saved : null;
  } catch (error) {
    return null;
  }
}

function resolveTheme() {
  return readSavedTheme() || (darkQuery.matches ? THEMES.INK : THEMES.PAPER);
}

function applyTheme(theme, { persist, notify }) {
  root.dataset.theme = theme;
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.setAttribute('aria-checked', String(theme === THEMES.INK));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      emit('storage-error', { message: String(error && error.message) });
    }
  }
  if (notify) emit('theme', { theme });
}

function revealOrigin() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return { x: window.innerWidth, y: 0 };
  const box = toggle.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function setRevealVars(theme) {
  const origin = revealOrigin();
  const reach = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y));
  root.style.setProperty('--vt-x', `${Math.round(origin.x)}px`);
  root.style.setProperty('--vt-y', `${Math.round(origin.y)}px`);
  root.style.setProperty('--vt-max', `${Math.ceil(reach)}px`);
  root.style.setProperty('--vt-dur', `${REVEAL_MS[theme]}ms`);
  return { origin, reach, durationMs: REVEAL_MS[theme] };
}

function setTheme(next) {
  const commit = () => applyTheme(next, { persist: true, notify: true });
  if (typeof document.startViewTransition !== 'function' || motionQuery.matches) {
    commit();
    return;
  }
  // A second click mid-reveal jumps to the end instead of stacking reveals.
  if (themeTransition) themeTransition.skipTransition();
  if (themeResonance) themeResonance.cancel();
  const wave = setRevealVars(next);
  root.classList.add(SWITCHING_CLASS);
  const transition = document.startViewTransition(commit);
  themeTransition = transition;
  // The new view is live once ready, so ripples and kicks show behind the front.
  transition.ready.then(() => {
    if (themeTransition === transition) themeResonance = resonate(wave);
  }).catch(() => {});
  transition.finished.finally(() => {
    if (themeTransition !== transition) return;
    root.classList.remove(SWITCHING_CLASS);
    themeTransition = null;
  });
}

export function toggleTheme() {
  setTheme(root.dataset.theme === THEMES.INK ? THEMES.PAPER : THEMES.INK);
}

export function initTheme() {
  applyTheme(resolveTheme(), { persist: false, notify: false });
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.addEventListener('click', toggleTheme);
  darkQuery.addEventListener('change', () => {
    if (!readSavedTheme()) applyTheme(resolveTheme(), { persist: false, notify: true });
  });
}
