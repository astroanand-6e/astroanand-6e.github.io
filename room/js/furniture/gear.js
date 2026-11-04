// The four desk figures, reused as-is from js/objects and wrapped here: placement, pick proxies,
// per-object outline materials (so hover can tint one object), LED pulse and the MacBook's game screen.
import * as THREE from 'three';
import { create as createFlx4 } from '../../../js/objects/ddj-flx4.js';
import { create as createMacbook } from '../../../js/objects/macbook.js';
import { create as createDualsense } from '../../../js/objects/dualsense.js';
import { create as createMic } from '../../../js/objects/mic.js';
import { partApi } from '../../../js/stage/parts.js';
import { DESK } from '../config.js';
import { ownLines } from '../geo.js';
import { createScreenArt } from '../screen-art.js';

const STAND_HEIGHT = 1.45;
const PLACEMENT = Object.freeze({
  flx4: { x: -3.1, z: -10.7, yaw: 0.02, y: 0 },
  macbook: { x: -7.9, z: -11.5, yaw: 0.42, y: STAND_HEIGHT },
  dualsense: { x: 0.9, z: -9.5, yaw: -0.5, y: 0 },
  mic: { x: 1.7, z: -13.1, yaw: 0, y: 0 },
});
const PICK_PADDING = 0.35;
const BEAT_BPM = 62;
const FLX4_GLOW_HEX = 0xff8a2e;
const GLOW_RANGE = Object.freeze({ paper: [0.12, 0.7], ink: [0.5, 1.15] });
const SHADOW_SIZE = Object.freeze({
  flx4: [5.4, 3.3], macbook: [3.6, 3.0], dualsense: [2.0, 1.6], mic: [1.5, 1.5],
});

const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });

function holderFor(key) {
  const p = PLACEMENT[key];
  const holder = new THREE.Group();
  holder.name = `gear-${key}`;
  holder.position.set(p.x, DESK.top + p.y, p.z);
  holder.rotation.y = p.yaw;
  return holder;
}

function proxyFromBox(box, key) {
  const size = box.getSize(new THREE.Vector3()).addScalar(PICK_PADDING);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), hiddenMaterial);
  proxy.position.copy(box.getCenter(new THREE.Vector3()));
  proxy.visible = false;
  proxy.userData.target = key;
  return proxy;
}

function findPart(figure, label) {
  return figure.parts.find((part) => part.userData.label === label);
}

function partBox(figure, label) {
  return new THREE.Box3().setFromObject(findPart(figure, label));
}

function findGlowMaterial(group) {
  let found = null;
  group.traverse((node) => {
    const m = node.material;
    if (!found && m && m.isMeshToonMaterial && m.emissive.getHex() === FLX4_GLOW_HEX) found = m;
  });
  return found;
}

function bakeStand(baker, key) {
  const p = PLACEMENT[key];
  const rot = [0, p.yaw, 0];
  const at = (dx, dz) => [
    p.x + dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw),
    DESK.top,
    p.z - dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw),
  ];
  const metal = { color: 0x8a8d90, rot };
  baker.rbox(3.0, 0.16, 2.3, 0.06, { ...metal, pos: [at(0, 0)[0], DESK.top + STAND_HEIGHT - 0.16, at(0, 0)[2]] });
  [-1.15, 1.15].forEach((dx) => baker.rbox(0.28, STAND_HEIGHT - 0.16, 1.9, 0.08, { color: 0x2b2825, rot, pos: at(dx, 0) }));
}

export function createGear({ renderer, mats, theme, shadows, bakeInto }) {
  const ctx = { THREE, materials: mats.shared, parts: partApi, theme };
  const factories = { flx4: createFlx4, macbook: createMacbook, dualsense: createDualsense, mic: createMic };
  const figures = Object.fromEntries(Object.entries(factories).map(([key, make]) => [key, make(ctx)]));
  const holders = {};
  const group = new THREE.Group();
  group.name = 'gear';

  Object.entries(figures).forEach(([key, figure]) => {
    const holder = holderFor(key);
    holder.add(figure.group);
    group.add(holder);
    holders[key] = holder;
    const [w, d] = SHADOW_SIZE[key];
    shadows.add({ x: PLACEMENT[key].x, z: PLACEMENT[key].z, w, d, y: DESK.top + 0.03, yaw: PLACEMENT[key].yaw, strength: 0.9 });
  });
  bakeStand(bakeInto, 'macbook');
  shadows.add({ x: PLACEMENT.macbook.x, z: PLACEMENT.macbook.z, w: 3.3, d: 2.6, y: DESK.top + 0.03, yaw: PLACEMENT.macbook.yaw, strength: 0.7 });

  const screenMesh = findPart(figures.macbook, 'game library / code');
  const screen = createScreenArt({ screenMesh, renderer, theme });
  const glowMaterial = findGlowMaterial(figures.flx4.group);

  const proxies = {
    decks: [proxyFromBox(new THREE.Box3().setFromObject(figures.flx4.group), 'decks')],
    game: ['m5 pro · 14 in', 'lid'].map((label) => proxyFromBox(partBox(figures.macbook, label), 'game')),
    controller: [proxyFromBox(new THREE.Box3().setFromObject(figures.dualsense.group), 'controller')],
  };
  holders.flx4.add(...proxies.decks);
  holders.macbook.add(...proxies.game);
  holders.dualsense.add(...proxies.controller);

  const lines = {
    decks: ownLines(holders.flx4, mats.line),
    game: ownLines(holders.macbook, mats.line),
    controller: ownLines(holders.dualsense, mats.line),
  };

  const state = { time: 0, t: 0, theme, exploded: false, active: false, reducedMotion: false, controls: {}, hover: null, yaw: 0 };
  let clock = 0;

  function pulseLeds(dt) {
    if (!glowMaterial) return;
    const [low, high] = GLOW_RANGE[state.theme] || GLOW_RANGE.paper;
    const phase = state.reducedMotion ? 0.35 : (clock * BEAT_BPM) / 60 % 1;
    const envelope = (1 - phase) ** 3;
    glowMaterial.emissiveIntensity = low + (high - low) * envelope;
  }

  function update(dt, { theme: name, reducedMotion }) {
    clock += dt;
    state.time = clock;
    state.theme = name;
    state.reducedMotion = reducedMotion;
    Object.values(figures).forEach((figure) => figure.update(dt, state));
    pulseLeds(dt);
    screen.update(dt, reducedMotion);
  }

  /** Targets for the interaction layer. link: hovering any of a linked set glows the whole set. */
  const target = (id, holder, extra) => ({ id, holder, axis: 'y', base: holder.position.y, proxies: proxies[id], lines: lines[id], ...extra });
  const targets = [
    target('decks', holders.flx4, { lift: 0.4 }),
    target('game', holders.macbook, { lift: 0.32, link: 'play' }),
    target('controller', holders.dualsense, { lift: 0.4, link: 'play' }),
  ];

  function dispose() {
    screen.dispose();
    Object.values(figures).forEach((figure) => figure.dispose());
    Object.values(lines).forEach((m) => m.dispose());
    Object.values(proxies).flat().forEach((p) => p.geometry.dispose());
  }

  return { group, figures, holders, targets, screenMesh, update, setTheme: screen.setTheme, dispose };
}
