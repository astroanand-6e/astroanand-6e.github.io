/**
 * Try the decks: page glue. Starts the theme, the bus and the engine, mounts the display,
 * controller, library and lessons, runs the Lessons / Free play tabs, and wakes the audio
 * on the first gesture. ?fake swaps in ui/fake-engine.js while the real engine is missing.
 */
import { initTheme } from '../../js/theme.js';
import { createBus, emit, on } from './controls.js';
import { mountController } from './ui/controller.js';
import { createIdleEngine } from './ui/idle-engine.js';
import { mountLibrary } from './ui/library.js';
import { mountScreen } from './ui/screen.js';

const PARAMS = new URLSearchParams(window.location.search);
const USE_FAKE = PARAMS.has('fake');
const EXPOSE_DEBUG = USE_FAKE || PARAMS.has('debug');
const MODES = Object.freeze(['lessons', 'free']);
const MODE_KEY = 'mix-mode';
const IGNORED_START_KEYS = Object.freeze(['Shift', 'Control', 'Alt', 'Meta', 'Escape']);
const START_EVENTS = Object.freeze(['pointerdown', 'pointerup', 'keydown']);

const byId = (id) => document.getElementById(id);

function showNotice(message) {
  const notice = byId('mix-notice');
  if (!notice) return;
  notice.textContent = message;
  notice.hidden = false;
}

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

function readSavedMode() {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return MODES.includes(saved) ? saved : null;
  } catch (error) {
    return null;
  }
}

function saveMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch (error) {
    // Storage can be blocked; the page works without remembering the mode.
  }
}

function initialMode() {
  const asked = PARAMS.get('mode');
  return MODES.includes(asked) ? asked : readSavedMode() ?? MODES[0];
}

/** Lessons / Free play tabs. User clicks emit 'mode'; 'mode' events from lessons switch the tabs. */
function setupModes(bus) {
  const buttons = [...document.querySelectorAll('.mode-tabs [data-mode]')];
  const lesson = byId('lesson');
  let current = null;

  function apply(mode) {
    if (!MODES.includes(mode) || mode === current) return;
    current = mode;
    document.documentElement.dataset.mode = mode;
    lesson.hidden = mode !== 'lessons';
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    saveMode(mode);
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      apply(button.dataset.mode);
      emit(bus, 'mode', { mode: current });
    });
  }
  on(bus, 'mode', ({ mode }) => apply(mode));
  return {
    apply,
    announce: () => emit(bus, 'mode', { mode: current }),
    disableLessons(reason) {
      const tab = buttons.find((button) => button.dataset.mode === 'lessons');
      if (!tab) return;
      tab.disabled = true;
      tab.title = reason;
    },
  };
}

async function createAudioEngine(bus) {
  if (USE_FAKE) {
    const { createFakeEngine } = await import('./ui/fake-engine.js');
    return createFakeEngine({ bus });
  }
  const { createEngine } = await import('./audio/engine.js');
  return createEngine({ bus });
}

async function startEngine(bus) {
  try {
    const engine = await createAudioEngine(bus);
    engine.ready.catch((error) => showNotice(`The tracks did not finish loading: ${describe(error)}`));
    return engine;
  } catch (error) {
    console.error('mix: the audio engine did not start', error);
    showNotice(`The audio engine did not start (${describe(error)}). Reload to try again.`);
    return createIdleEngine();
  }
}

async function startLessons(bus, engine, modes) {
  const host = byId('lesson');
  try {
    const { mountLessons } = await import('./lessons/runner.js');
    await mountLessons(host, { bus, engine });
  } catch (error) {
    console.warn('mix: lessons did not load', error);
    const note = document.createElement('p');
    note.className = 'mix-lesson-note';
    note.textContent = 'The lessons did not load. Free play still works.';
    host.replaceChildren(note);
    modes.disableLessons('The lessons did not load');
    modes.apply('free');
  }
}

/** The browser wants a gesture before audio. The first press, tap or key resumes it. */
function setupGate(engine) {
  const gate = byId('gate');
  if (!gate) return;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  gate.textContent = touch ? 'Tap to start' : 'Press any key to start';
  document.querySelector('#controller .deck-toolbar')?.prepend(gate);
  gate.hidden = false;
  let pending = false;

  function done() {
    for (const type of START_EVENTS) window.removeEventListener(type, start, true);
    gate.hidden = true;
  }

  function start(event) {
    if (pending || (event.type === 'keydown' && IGNORED_START_KEYS.includes(event.key))) return;
    pending = true;
    Promise.resolve(engine.resume()).then(done).catch((error) => {
      pending = false;
      showNotice(`Audio could not start (${describe(error)}). Tap again to retry.`);
    });
  }

  for (const type of START_EVENTS) window.addEventListener(type, start, true);
}

function guarded(name, mount) {
  try {
    return mount();
  } catch (error) {
    console.error(`mix: ${name} did not mount`, error);
    showNotice(`The ${name} did not start: ${describe(error)}`);
    return null;
  }
}

async function main() {
  guarded('theme switch', initTheme);
  if (USE_FAKE) {
    const tag = document.createElement('span');
    tag.className = 'fake-tag mono';
    tag.textContent = 'fake engine';
    document.querySelector('.mix-title')?.after(tag);
  }
  const bus = createBus();
  const modes = setupModes(bus);
  modes.apply(initialMode());
  const engine = await startEngine(bus);
  if (EXPOSE_DEBUG) window.mixDebug = { bus, engine };
  on(bus, 'engine', (detail) => detail.type === 'error' && showNotice(`The audio engine reported a problem: ${detail.message ?? 'unknown error'}`));
  guarded('deck display', () => mountScreen(byId('screen'), { bus, engine }));
  guarded('controller', () => mountController(byId('controller'), { bus, engine }));
  const library = guarded('library', () => mountLibrary(byId('library'), { bus, engine }));
  engine.ready.then(() => library?.refresh()).catch(() => {});
  setupGate(engine);
  await startLessons(bus, engine, modes);
  modes.announce();
}

main().catch((error) => {
  console.error('mix: startup failed', error);
  showNotice(`The page did not start: ${describe(error)}`);
});
