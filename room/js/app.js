// Starts the room: renderer, camera rig, world, interaction, intro and the loop. Loaded only after first paint.
import * as THREE from 'three';
import { toggleTheme } from '../../js/theme.js';
import { createDprGovernor } from '../../js/stage/perf.js';
import { createCameraRig } from './camera-rig.js';
import { buildWorld } from './world.js';
import { createInteraction } from './interact.js';
import { createIntro } from './intro.js';
import { createTransitions } from './transitions.js';
import { createUi } from './ui.js';
import { DOOR } from './config.js';

const MAX_DT = 0.05;
const INTRO_KEY = 'room:intro-played';
const SKIP_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
const root = document.documentElement;
const readTheme = () => (root.dataset.theme === 'ink' ? 'ink' : 'paper');

function hasPlayedIntro() {
  try { return sessionStorage.getItem(INTRO_KEY) === '1'; } catch (error) { return false; }
}

function markIntroPlayed() {
  try { sessionStorage.setItem(INTRO_KEY, '1'); } catch (error) { /* storage blocked: the intro may replay */ }
}

export async function start({ canvas }) {
  const params = new URLSearchParams(window.location.search);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const size = { width: 1, height: 1 };
  const governor = createDprGovernor((dpr) => {
    renderer.setPixelRatio(dpr);
    renderer.setSize(size.width, size.height, false);
  });
  renderer.setPixelRatio(governor.dpr());

  const state = { theme: readTheme(), reducedMotion: motionQuery.matches };
  const camera = new THREE.PerspectiveCamera(30, 1, 0.3, 700);
  const rig = createCameraRig({ camera, reducedMotion: state.reducedMotion });
  const world = buildWorld({ renderer, theme: state.theme });
  const ui = createUi({ reducedMotion: state.reducedMotion });
  const intro = createIntro({ rig, door: world.door });

  let isLocked = false;
  const locked = () => isLocked || intro.isPlaying();
  const actions = {
    decks: () => transitions.enter('decks'),
    game: () => transitions.enter('game'),
    controller: () => transitions.enter('game'),
    switch: () => toggleTheme(),
    lamp: () => { world.lighting.toggleLamp(); world.lamp.nudge(); },
    plant: () => world.plant.sway(),
    records: () => world.record.toggle(),
  };
  const interaction = createInteraction({
    canvas, camera, rig, world, actions, getTheme: () => state.theme, isLocked: locked, onInput: () => ui.hideHint(),
  });
  const transitions = createTransitions({ rig, world, camera, ui, lock: (value) => { isLocked = value; } });

  let rafId = 0;
  let lastNow = 0;
  let isDisposed = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    size.width = Math.max(1, Math.round(rect.width));
    size.height = Math.max(1, Math.round(rect.height));
    renderer.setSize(size.width, size.height, false);
    rig.resize(size.width, size.height);
  }

  function step(dt) {
    rig.update(dt);
    camera.updateMatrixWorld();
    interaction.update(dt, state.reducedMotion);
    world.update(dt, state);
    renderer.render(world.scene, camera);
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const rawMs = now - lastNow;
    lastNow = now;
    governor.track(rawMs);
    step(Math.min(Math.max(rawMs, 0) / 1000, MAX_DT));
  }

  /** Runs the simulation forward without waiting for the browser (inspection and tests). */
  function advance(seconds, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) step(dt);
  }

  function startLoop() {
    if (rafId || isDisposed) return;
    lastNow = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  const onVisibility = () => (document.hidden ? stopLoop() : startLoop());
  const onTheme = (event) => {
    const name = event.detail && event.detail.theme === 'ink' ? 'ink' : 'paper';
    state.theme = name;
    world.setTheme(name);
  };
  const onMotion = () => {
    state.reducedMotion = motionQuery.matches;
    rig.setReducedMotion(state.reducedMotion);
  };
  const onSkip = () => {
    if (intro.isPlaying()) intro.skip();
    ui.hideHint();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') transitions.cancel();
  };

  function dispose() {
    isDisposed = true;
    stopLoop();
    resizeObserver.disconnect();
    window.removeEventListener('theme', onTheme);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKey);
    SKIP_EVENTS.forEach((name) => window.removeEventListener(name, onSkip, true));
    motionQuery.removeEventListener('change', onMotion);
    interaction.dispose();
    world.dispose();
    renderer.dispose();
  }

  // Leaving for good disposes everything; entering the back-forward cache only pauses.
  const onPageHide = (event) => {
    if (event.persisted) stopLoop();
    else dispose();
  };
  const onPageShow = (event) => {
    if (!event.persisted) return;
    startLoop();
    transitions.reset();
  };

  /** Parks the camera on an orbit around `target` (degrees); for inspecting details by hand. */
  function inspect({ target, distance, yaw = 38, pitch = 30, fov = 24 }) {
    const [yawRad, pitchRad] = [yaw, pitch].map(THREE.MathUtils.degToRad);
    const at = new THREE.Vector3(...target);
    rig.setOverride(() => {});
    camera.position.set(
      at.x + distance * Math.cos(pitchRad) * Math.sin(yawRad),
      at.y + distance * Math.sin(pitchRad),
      at.z + distance * Math.cos(pitchRad) * Math.cos(yawRad),
    );
    camera.lookAt(at);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    advance(0.05);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  window.addEventListener('theme', onTheme);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('keydown', onKey);
  SKIP_EVENTS.forEach((name) => window.addEventListener(name, onSkip, { capture: true, passive: true }));
  motionQuery.addEventListener('change', onMotion);
  ui.bindButtons({
    onFocus: (id) => interaction.setFocus(id),
    onBlur: (id) => interaction.clearFocus(id),
    onActivate: (id) => interaction.activate(id),
  });

  resize();
  renderer.compile(world.scene, camera);
  startLoop();

  const handle = { renderer, world, rig, camera, state, intro, ui, interaction, transitions, advance, inspect, dispose };
  if (params.has('debug')) window.__room = { THREE, ...handle };

  const returning = transitions.readReturn();
  const walkIn = params.has('intro') || (!hasPlayedIntro() && !state.reducedMotion && !returning);
  if (returning) {
    world.door.set(DOOR.ajar, { immediate: true });
    transitions.returnFrom(returning).then(() => ui.showHint());
  } else if (walkIn) {
    await intro.play();
    markIntroPlayed();
    ui.showHint();
  } else {
    world.door.set(DOOR.ajar, { immediate: true });
    ui.showHint();
  }

  return handle;
}
