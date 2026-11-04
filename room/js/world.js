// Builds the whole diorama: shell, static furniture (one bake), animated props and the desk gear.
import * as THREE from 'three';
import { createRoomMaterials } from './materials.js';
import { createRoomLighting } from './lighting.js';
import { createShadowLayer } from './shadows.js';
import { createBaker, meshFromBake, disposeTree, ownLines } from './geo.js';
import { createShell } from './shell.js';
import { bakeDesk } from './furniture/desk.js';
import { createGear } from './furniture/gear.js';
import { bakeChair } from './furniture/chair.js';
import { bakeRug } from './furniture/rug.js';
import { bakePrint } from './furniture/print.js';
import { bakeHeadphones } from './furniture/headphones.js';
import { bakeShelf, createRecord } from './furniture/shelf.js';
import { bakePot, createPlant } from './furniture/plant.js';
import { createLamp } from './furniture/lamp.js';
import { createSwitch } from './furniture/switch.js';
import { bakeWindow, createWindowView } from './furniture/window.js';
import { bakeDoorFrame, createDoor } from './furniture/door.js';
import { createGlow } from './furniture/glow.js';

function propTarget(id, prop, mats, { axis = 'y', lift }) {
  return {
    id,
    holder: prop.group,
    axis,
    base: prop.group.position[axis],
    proxies: [prop.proxy],
    lines: ownLines(prop.group, mats.line),
    lift,
  };
}

export function buildWorld({ renderer, theme }) {
  const scene = new THREE.Scene();
  const mats = createRoomMaterials(theme);
  const lighting = createRoomLighting(scene, theme);
  const shadows = createShadowLayer(theme);
  const baker = createBaker();
  const shell = createShell({ renderer, mats });

  shell.bakeTrim(baker);
  bakeDesk(baker, shadows);
  bakeChair(baker, shadows);
  bakeRug(baker, shadows);
  bakePrint(baker);
  bakeHeadphones(baker);
  bakeShelf(baker, shadows);
  bakePot(baker, shadows);
  bakeWindow(baker);
  bakeDoorFrame(baker);
  const gear = createGear({ renderer, mats, theme, shadows, bakeInto: baker });

  const furniture = meshFromBake(baker.build(), mats.furniture, mats.line);
  furniture.name = 'furniture';

  const door = createDoor({ mats });
  const windowView = createWindowView();
  const plant = createPlant({ mats });
  const lamp = createLamp({ mats });
  const record = createRecord({ mats });
  const lightSwitch = createSwitch({ mats });
  lamp.group.updateMatrixWorld(true);
  const lampAt = lamp.bulbWorld();
  lighting.lamp.position.copy(lampAt);
  lighting.strip.position.set(0, 5.4, -7);
  const glow = createGlow({ lampWorld: lampAt });

  scene.add(shell.group, furniture, shadows.build(), gear.group, door.group, windowView.group,
    plant.group, lamp.group, record.group, lightSwitch.group, glow.group);

  const targets = [
    ...gear.targets,
    propTarget('switch', lightSwitch, mats, { axis: 'x', lift: 0.32 }),
    propTarget('lamp', lamp, mats, { lift: 0.35 }),
    propTarget('plant', plant, mats, { lift: 0.3 }),
    propTarget('records', record, mats, { lift: 0.45 }),
  ];
  // Large furniture that can hide a target from the pointer.
  const occluders = [];

  lightSwitch.setLightsOn(theme !== 'ink', { immediate: true });

  function update(dt, state) {
    lighting.update(dt);
    const night = lighting.night();
    const lampGlow = lighting.lampGlow();
    gear.update(dt, state);
    door.update(dt);
    windowView.update(dt, night, state.reducedMotion);
    plant.update(dt);
    lamp.update(dt, lampGlow);
    record.update(dt);
    lightSwitch.update(dt, night, state.reducedMotion);
    glow.update(night, lampGlow, state.theme === 'ink');
  }

  function setTheme(name) {
    lighting.setTheme(name);
    shadows.setTheme(name);
    mats.setNight(name === 'ink' ? 1 : 0);
    gear.setTheme(name);
    lightSwitch.setLightsOn(name !== 'ink');
  }

  function dispose() {
    [gear, shell, door, windowView, plant, lamp, record, lightSwitch, glow].forEach((part) => part.dispose());
    disposeTree(furniture);
    targets.forEach((t) => t.lines.dispose());
    shadows.dispose();
    lighting.dispose();
    mats.dispose();
  }

  const setHalo = (id, amount, color) => glow.setHalo(id, amount, color);

  return { scene, mats, lighting, shell, gear, door, plant, lamp, record, lightSwitch, targets, occluders, update, setTheme, setHalo, dispose };
}
