import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { createLighting } from './lighting.js';
import { createShadows } from './shadow.js';
import { createCameraRig } from './camera-rail.js';
import { createPartSystem, partApi } from './parts.js';
import { createLabels } from './labels.js';
import { createSignal } from './signal.js';
import { createGamepadInput } from './input.js';
import { createSound } from './sound.js';
import { createLife } from './life.js';
import { createDprGovernor } from './perf.js';
import { createSlots, fitRect } from './slots.js';
import { createStationLoader } from './station-loader.js';
import { STATIONS, stationIndex, viewForChapter, readChapter } from './stations.js';
import { CriticalSpring, createDragTurn, YAW_LIMIT } from './motion.js';

const MAX_DT = 0.05;
const GAMEPAD_TURN_SPEED = 1.4;
const YAW_SMOOTH_SECONDS = 0.35;
const SILHOUETTE_SMOOTH_SECONDS = 0.6;
const INTRO_DELAY_S = 0.3;
const LABEL_LEAD_S = 0.35;
const LABEL_SETTLE_S = 0.55;
const PRESENCE_RATE = 9;
const PRESENCE_EPSILON = 0.004;
const FALLBACK_RADIUS = 5;
const FALLBACK_LIFT = 1.2;
const FIGURE_FOCUS_PADDING = 1.08;

/**
 * Boots the stage. Returns a handle { dispose, setTheme, ... } or null when
 * WebGL is unavailable (caller falls back to the text-first page).
 */
export function startStage({ canvas, theme = 'paper' }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (error) {
    window.dispatchEvent(new CustomEvent('stage-error', { detail: { id: 'webgl', error } }));
    return null;
  }

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const governor = createDprGovernor((value) => {
    renderer.setPixelRatio(value);
    signal.setPixelRatio(value);
    renderer.setSize(size.width, size.height, false);
  });
  const dpr = governor.dpr();
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const lighting = createLighting(scene, theme);
  const materials = createMaterials(theme);
  const shadows = createShadows(theme);
  const partSystem = createPartSystem();
  const rig = createCameraRig({ reducedMotion: motionQuery.matches });
  const signal = createSignal({ scene, theme, pixelRatio: dpr });
  const labels = createLabels();
  const slots = createSlots(canvas);
  const life = createLife();
  const gamepad = createGamepadInput({ isReducedMotion: () => motionQuery.matches });
  const sound = createSound();
  const ctx = { THREE, materials, parts: partApi, theme };

  // Shared state handed to every station's update(dt, state).
  const state = {
    time: 0,
    t: 0,
    chapter: readChapter(),
    theme,
    exploded: false,
    active: false,
    reducedMotion: motionQuery.matches,
    controls: {},
    lastControl: null,
    yaw: 0,
    hover: null,
  };

  const loader = createStationLoader({
    scene,
    ctx,
    partSystem,
    labels,
    shadows,
    isReduced: () => state.reducedMotion,
  });
  const records = loader.records;
  const yaw = new CriticalSpring(0, YAW_SMOOTH_SECONDS);
  const silhouetteRadius = new CriticalSpring(0, SILHOUETTE_SMOOTH_SECONDS);
  const size = { width: 1, height: 1 };
  const pointer = { x: 0, y: 0, isDirty: false, isInside: false };
  const focus = { center: new THREE.Vector3(), radius: FALLBACK_RADIUS, corners: null, labels: null };
  const figureBox = new THREE.Box3();
  const figureSphere = new THREE.Sphere();
  const cornerPool = Array.from({ length: 8 }, () => new THREE.Vector3());
  const cameraFocus = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let activeIndex = -1;
  let activeId = null;
  let activeView = null;
  let activeSince = 0;
  let presence = 1;
  let hasFramed = false;
  let hoverPart = null;
  let rafId = 0;
  let lastNow = 0;
  let isDisposed = false;

  function applyChapter(chapter) {
    state.chapter = chapter;
    activeView = viewForChapter(chapter.id);
    const nextIndex = activeView ? stationIndex(activeView.station) : -1;
    const nextId = nextIndex >= 0 ? STATIONS[nextIndex].id : null;
    if (nextId !== activeId) activeSince = state.time;
    activeIndex = nextIndex;
    activeId = nextId;
    focus.labels = activeView && activeView.labels ? activeView.labels : null;
    state.t = Math.max(0, activeIndex) / (STATIONS.length - 1);
    signal.setChapter(chapter.id, chapter.index);
    signal.setStation(activeIndex);
    if (activeIndex < 0) return;
    loader.retry(activeIndex);
    [activeIndex, activeIndex + 1, activeIndex - 1].forEach((index) => loader.ensure(index));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    size.width = Math.max(1, Math.round(rect.width));
    size.height = Math.max(1, Math.round(rect.height));
    renderer.setSize(size.width, size.height, false);
    rig.snap();
    slots.markDirty();
  }

  /** Station build-up on first arrival: staggered springs, then the callouts. */
  function introduce(record) {
    record.hasIntro = true;
    if (state.reducedMotion || partSystem.isExploded()) {
      record.labelsReadyAt = state.time + LABEL_LEAD_S;
      return;
    }
    record.labelsReadyAt = state.time + partSystem.assemble(record.def.id, { delay: INTRO_DELAY_S });
  }

  /** World-space volume the camera should frame for the active chapter. */
  function resolveFocus(record) {
    const def = STATIONS[activeIndex];
    const keys = activeView.focusFigures;
    const boxes = keys && record ? keys.map((key) => record.figureBoxes.get(key)).filter(Boolean) : [];
    const hasFigures = boxes.length > 0;
    if (hasFigures) {
      figureBox.makeEmpty();
      boxes.forEach((box) => figureBox.union(box));
      figureBox.getBoundingSphere(figureSphere);
      scratch.copy(figureSphere.center);
    } else if (record) scratch.copy(record.focus.center);
    else scratch.set(0, FALLBACK_LIFT, 0);
    focus.center.set(...def.position).add(scratch);
    if (hasFigures) focus.radius = figureSphere.radius * FIGURE_FOCUS_PADDING;
    else focus.radius = record ? record.focus.radius : FALLBACK_RADIUS;
    focus.corners = null;
    if (!record) return;
    if (hasFigures) {
      focus.corners = cornerPool;
      const { min, max } = figureBox;
      [min.x, max.x].forEach((x, i) =>
        [min.y, max.y].forEach((y, j) =>
          [min.z, max.z].forEach((z, k) => cornerPool[i * 4 + j * 2 + k].set(x, y, z).add(record.wrapper.position)),
        ),
      );
      return;
    }
    focus.corners = cornerPool;
    record.focus.corners.forEach((corner, i) => cornerPool[i].copy(corner).add(record.wrapper.position));
  }

  function frameCamera(record, dt) {
    const slot = slots.pick(state.chapter.id, dt);
    const view = slots.view();
    if (activeIndex >= 0 && (record || hasFramed)) {
      resolveFocus(record);
      rig.setTarget(focus, fitRect(slot, view, labels.columnWidth()), size);
      silhouetteRadius.target = rig.extent().halfW * rig.pixelsPerUnit();
      if (!hasFramed) silhouetteRadius.snap();
      hasFramed = true;
    }
    rig.update(dt, camera, size, life.parallax(dt, state.reducedMotion));
    rig.focus(cameraFocus);
    return { slot, view };
  }

  function pickActive() {
    if (!activeId || !records.has(activeId) || !pointer.isInside) return null;
    const rect = slots.view();
    return partSystem.pick(activeId, camera, pointer.x - rect.left, pointer.y - rect.top, size.width, size.height);
  }

  function updateHover() {
    if (!pointer.isDirty) return;
    pointer.isDirty = false;
    hoverPart = pickActive();
    state.hover = hoverPart;
    canvas.style.cursor = hoverPart ? 'pointer' : '';
  }

  function updateStations(dt) {
    partSystem.beginFrame();
    records.forEach((record) => {
      const isActive = record.def.id === activeId;
      record.pivot.rotation.y = isActive ? yaw.value : record.pivot.rotation.y * 0.9;
      if (!record.wrapper.visible) return;
      record.floater.position.y = isActive ? life.bob(state.time, record.focus.radius * 2, state.reducedMotion) : 0;
      state.active = isActive;
      record.obj.update(dt, state);
    });
    state.lastControl = null;
    partSystem.update(dt);
  }

  function updateLabels(record, dt, frameInfo) {
    const isReady = record && state.time >= record.labelsReadyAt && state.time - activeSince > LABEL_SETTLE_S;
    silhouetteRadius.step(dt);
    projected.copy(cameraFocus).project(camera);
    const { view, slot } = frameInfo;
    labels.update({
      activeId,
      isShown: Boolean(isReady),
      hoverLabel: hoverPart ? hoverPart.userData.label : null,
      camera,
      view,
      bounds: slot,
      silhouette: {
        x: view.left + (projected.x * 0.5 + 0.5) * view.width,
        y: view.top + (-projected.y * 0.5 + 0.5) * view.height,
        r: silhouetteRadius.value,
      },
      focus,
      dt,
    });
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const rawMs = now - lastNow;
    lastNow = now;
    const dt = Math.min(rawMs / 1000, MAX_DT);
    governor.track(rawMs);
    state.time += dt;

    const turn = gamepad.poll(dt);
    if (turn) setYawTarget(yaw.target + turn * GAMEPAD_TURN_SPEED * dt);
    yaw.step(dt);
    state.yaw = yaw.value;

    // The index chapter shows no station (the page fades the canvas); once the
    // specimens have shrunk away there is nothing left to draw.
    const wantedPresence = activeIndex < 0 ? 0 : 1;
    presence = state.reducedMotion ? wantedPresence : presence + (wantedPresence - presence) * (1 - Math.exp(-PRESENCE_RATE * dt));
    if (wantedPresence === 0 && presence < PRESENCE_EPSILON) {
      presence = 0;
      loader.updateVisibility(cameraFocus, scratch, 0);
      labels.update({ activeId: null, isShown: false, dt });
      return;
    }

    const record = activeId ? records.get(activeId) : null;
    const frameInfo = frameCamera(record, dt);
    if (record && !record.hasIntro && slots.isOnScreen(frameInfo.slot)) introduce(record);
    loader.updateVisibility(cameraFocus, scratch, presence);
    updateStations(dt);
    updateHover();
    signal.setSlot(frameInfo.slot, frameInfo.view, state.chapter.id === 'hero');
    signal.update(dt, state.time, rig.pixelsPerUnit(), state.reducedMotion);
    updateLabels(record, dt, frameInfo);
    renderer.render(scene, camera);
  }

  function setYawTarget(value) {
    yaw.target = Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, value));
    if (state.reducedMotion) yaw.snap(yaw.target);
  }

  function start() {
    if (rafId || isDisposed) return;
    lastNow = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  function toggleBreak(event) {
    const forced = event && event.detail && typeof event.detail.value === 'boolean';
    const next = forced ? event.detail.value : !partSystem.isExploded();
    state.exploded = next;
    partSystem.setExploded(next, { immediate: state.reducedMotion });
  }

  function onControl(event) {
    const { action, value } = event.detail || {};
    if (!action) return;
    if (action === 'sound') {
      sound.toggle(value);
      return;
    }
    if (action === 'break') {
      toggleBreak({ detail: { value: typeof value === 'boolean' ? value : undefined } });
      return;
    }
    state.controls[action] = value;
    state.lastControl = { action, value };
  }

  function setTheme(name) {
    state.theme = name;
    ctx.theme = name;
    materials.setTheme(name);
    lighting.setTheme(name);
    shadows.setTheme(name);
    signal.setTheme(name);
  }

  function onTheme(event) {
    const name = event.detail && event.detail.theme;
    if (name === 'paper' || name === 'ink') setTheme(name);
  }

  function onChapter(event) {
    const detail = event.detail || {};
    applyChapter({ id: detail.id || '', index: detail.index || 0 });
  }

  function onMotionChange() {
    state.reducedMotion = motionQuery.matches;
    rig.setReducedMotion(motionQuery.matches);
  }

  const toPointer = (x, y) => {
    pointer.x = x;
    pointer.y = y;
    pointer.isInside = true;
  };

  const stopDrag = createDragTurn(canvas, {
    onTurn: (delta) => setYawTarget(yaw.target + delta),
    onTap: (x, y) => {
      toPointer(x, y);
      const part = pickActive();
      const record = records.get(activeId);
      if (part && record) record.obj.onPick(part);
    },
    onMove: (x, y) => {
      toPointer(x, y);
      pointer.isDirty = true;
    },
    onLeave: () => {
      pointer.isInside = false;
      pointer.isDirty = true;
    },
  });

  const resizeObserver = new ResizeObserver(resize);

  function dispose() {
    isDisposed = true;
    stop();
    stopDrag();
    resizeObserver.disconnect();
    window.removeEventListener('break', toggleBreak);
    window.removeEventListener('control', onControl);
    window.removeEventListener('theme', onTheme);
    window.removeEventListener('chapter', onChapter);
    document.removeEventListener('visibilitychange', onVisibility);
    motionQuery.removeEventListener('change', onMotionChange);
    loader.dispose();
    rig.snap();
    life.dispose();
    slots.dispose();
    signal.dispose();
    labels.dispose();
    sound.dispose();
    lighting.dispose();
    shadows.dispose();
    materials.dispose();
    renderer.dispose();
  }

  window.addEventListener('break', toggleBreak);
  window.addEventListener('control', onControl);
  window.addEventListener('theme', onTheme);
  window.addEventListener('chapter', onChapter);
  document.addEventListener('visibilitychange', onVisibility);
  motionQuery.addEventListener('change', onMotionChange);
  resizeObserver.observe(canvas);

  setTheme(theme);
  resize();
  applyChapter(state.chapter);
  start();

  return { dispose, setTheme, renderer, scene, camera, state, records };
}
