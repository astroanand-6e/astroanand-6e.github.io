/* Hero page wiring: builds one paused timeline per scene (js/hero/scenes/*), stacks them on a
   master timeline and scrubs it with a pinned ScrollTrigger. Scene code never touches GSAP's
   global or ScrollTrigger, so the same buildScene() runs in a HyperFrames composition.
   GSAP 3.13 and ScrollTrigger load as classic scripts from jsDelivr (see index.html). */
import {
  GL_MAX_DPR, GL_SCALE_DESKTOP, GL_SCALE_MOBILE, MOBILE_QUERY, SCENES, SCRUB_SECONDS, SEED_CROWS,
  VH_PER_SECOND_DESKTOP, VH_PER_SECOND_MOBILE, WAKE_MARGIN_S,
} from './config.js';
import { hydrateImages } from './placeholders.js';
import { CUES, createHeroSound } from './sound.js';
import { initStaticHero } from './static-mode.js';

const LOADERS = Object.freeze({
  intro: () => import('./scenes/intro.js'),
  palm: () => import('./scenes/palm.js'),
  eyes: () => import('./scenes/eyes.js'),
  desk: () => import('./scenes/desk.js'),
  handoff: () => import('./scenes/handoff.js'),
});
const FOCUS_AT = Object.freeze({ intro: 0, handoff: 6 });
const CROWS_DESKTOP = 150;
const CROWS_MOBILE = 70;
const RESIZE_DEBOUNCE_MS = 220;
const PINNED_CLASS = 'hx-pinned';
const LIVE_CLASS = 'hx-live';

const root = () => document.getElementById('top');
const idle = (task) => ('requestIdleCallback' in window ? window.requestIdleCallback(task, { timeout: 1200 }) : setTimeout(task, 200));

function sceneOptions() {
  const isMobile = window.matchMedia(MOBILE_QUERY).matches;
  return {
    glScale: isMobile ? GL_SCALE_MOBILE : GL_SCALE_DESKTOP,
    maxDpr: GL_MAX_DPR,
    crowCount: isMobile ? CROWS_MOBILE : CROWS_DESKTOP,
    seed: SEED_CROWS,
  };
}

function buildMaster(gsap, modules, host, opts) {
  const master = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  const scenes = [];
  let cursor = 0;
  SCENES.forEach((def, i) => {
    const start = i === 0 ? 0 : cursor - def.overlap;
    const el = host.querySelector(`[data-hx-scene="${def.id}"]`);
    const stl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    const handle = modules[i].buildScene(stl, el, opts);
    stl.paused(false);
    master.add(stl, start);
    cursor = start + def.duration;
    scenes.push({ def, el, start, end: cursor, handle, isAwake: false });
  });
  return { master, scenes };
}

function setAwake(scene, isAwake) {
  if (scene.isAwake === isAwake) return;
  scene.isAwake = isAwake;
  scene.handle.fx.forEach((fx) => (isAwake ? fx.wake() : fx.release()));
}

function syncFx(scenes, time, isOn) {
  scenes.forEach((scene) => {
    const near = isOn && time >= scene.start - WAKE_MARGIN_S && time <= scene.end + WAKE_MARGIN_S;
    setAwake(scene, near);
  });
}

function createScroller(ScrollTrigger, host, master, scenes) {
  const vhPerSecond = window.matchMedia(MOBILE_QUERY).matches ? VH_PER_SECOND_MOBILE : VH_PER_SECOND_DESKTOP;
  let isOn = true;
  const st = ScrollTrigger.create({
    trigger: host,
    start: 'top top',
    end: () => `+=${Math.round((master.duration() * vhPerSecond * window.innerHeight) / 100)}`,
    pin: host.querySelector('.hx-pin'),
    scrub: SCRUB_SECONDS,
    animation: master,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: () => syncFx(scenes, master.time(), isOn),
    onToggle: (self) => {
      isOn = self.isActive;
      document.documentElement.classList.toggle(PINNED_CLASS, isOn);
      syncFx(scenes, master.time(), isOn);
    },
  });
  return st;
}

/* Keyboard users who tab to a link inside a scene that is off screen are scrolled to it. */
function guardFocus(host, st, master, scenes) {
  host.addEventListener('focusin', (event) => {
    const el = event.target.closest('[data-hx-scene]');
    const scene = scenes.find((s) => s.el === el);
    if (!scene) return;
    const t = master.time();
    if (t >= scene.start && t <= scene.end - 1) return;
    const at = scene.start + (FOCUS_AT[scene.def.id] ?? 0);
    window.scrollTo({ top: st.start + (at / master.duration()) * (st.end - st.start) });
  });
}

function watchResize(scenes) {
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      scenes.filter((s) => s.isAwake).forEach((s) => { setAwake(s, false); setAwake(s, true); });
    }, RESIZE_DEBOUNCE_MS);
  });
}

/* Dev and verification handle: set progress directly, or time a sweep of the timeline. */
function exposeDebug(master, scenes, st) {
  const glFx = () => scenes.flatMap((s) => (s.isAwake ? s.handle.gl : []));
  const sync = () => syncFx(scenes, master.time(), true);
  window.__hero = {
    master, scenes, st,
    set(progress) { master.progress(progress); sync(); },
    bench(frames = 240) {
      const times = [];
      for (let i = 0; i <= frames; i += 1) {
        const t0 = performance.now();
        master.progress(i / frames);
        sync();
        glFx().forEach((fx) => fx.gl && fx.gl.finish());
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      return { avg: +avg.toFixed(2), p95: +times[Math.floor(times.length * 0.95)].toFixed(2), max: +times[times.length - 1].toFixed(2), frames };
    },
  };
}

const SOUND_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h3l4-3.5v11L6 12H3z"/><path class="hx-wave" d="M13.5 7.2a4 4 0 0 1 0 5.6M15.8 5a7 7 0 0 1 0 10"/><path class="hx-mute" d="M13.5 7.5l4 5M17.5 7.5l-4 5"/></svg>';

/* Sound toggle sits in the top bar; cues are placed at each scene's start on the master. */
function mountSound(host, master, scenes) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-btn hx-sound';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', 'Hero sound off');
  button.innerHTML = SOUND_ICON;
  const help = document.getElementById('help-btn');
  if (help) help.before(button);
  else host.querySelector('.hx-pin').append(button);
  const cues = scenes
    .flatMap((scene) => (CUES[scene.def.id] || []).map((cue) => ({ at: scene.start + cue.at, play: cue.play })))
    .sort((a, b) => a.at - b.at);
  const sound = createHeroSound(button, cues);
  master.eventCallback('onUpdate', () => sound.update(master.time()));
}

async function startLive(host) {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  const modules = await Promise.all(SCENES.map((def) => LOADERS[def.id]()));
  const { master, scenes } = buildMaster(gsap, modules, host, sceneOptions());
  const st = createScroller(ScrollTrigger, host, master, scenes);
  mountSound(host, master, scenes);
  guardFocus(host, st, master, scenes);
  watchResize(scenes);
  exposeDebug(master, scenes, st);
  syncFx(scenes, master.time(), st.isActive);
  host.classList.add('hx-ready');
}

export function initHero() {
  const host = root();
  if (!host || !host.querySelector('.hx-pin')) return;
  hydrateImages(host);
  const hasGsap = Boolean(window.gsap && window.ScrollTrigger);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!hasGsap || reduced) {
    initStaticHero(host);
    return;
  }
  host.classList.add(LIVE_CLASS);
  idle(() => startLive(host).catch((error) => {
    console.warn(`hero: falling back to the static layout (${error.message})`);
    host.classList.remove(LIVE_CLASS);
    initStaticHero(host);
  }));
}
