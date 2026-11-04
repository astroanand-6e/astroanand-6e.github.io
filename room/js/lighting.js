// Room lighting: a hemisphere fill and a front-top key (tuned so floor, back wall and left wall land in three
// different toon bands). At night the room is dark; two LED lights (under the riser, under the desk) do the work.
import * as THREE from 'three';
import { CriticalSpring } from '../../js/stage/motion.js';

const KEY_POSITION = Object.freeze([7.4, 32, 22.6]);
const PRESETS = {
  paper: { sky: 0xfffdf8, ground: 0xe4d8c3, hemi: 1.9, key: 1.2, keyColor: 0xfff3e2 },
  ink: { sky: 0x7f8aa4, ground: 0x0d0f14, hemi: 0.34, key: 0.4, keyColor: 0x9db2d6 },
};
const NIGHT_SMOOTH_S = 0.7;

export function createRoomLighting(scene, theme = 'paper') {
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(...KEY_POSITION);
  // Colour and strength of both are driven by furniture/leds.js.
  const riser = new THREE.PointLight(0x21d6cf, 0, 16, 2);
  const floor = new THREE.PointLight(0x21d6cf, 0, 14, 2);
  scene.add(hemisphere, key, riser, floor);

  const night = new CriticalSpring(0, NIGHT_SMOOTH_S);

  function applyPreset(next) {
    const p = PRESETS[next] || PRESETS.paper;
    hemisphere.color.setHex(p.sky);
    hemisphere.groundColor.setHex(p.ground);
    hemisphere.intensity = p.hemi;
    key.color.setHex(p.keyColor);
    key.intensity = p.key;
  }

  /** Lights swap at once (the page's theme reveal covers it); glows ease in afterwards. */
  function setTheme(next, { immediate = false } = {}) {
    applyPreset(next);
    night.target = next === 'ink' ? 1 : 0;
    if (immediate) night.snap(night.target);
  }

  setTheme(theme, { immediate: true });

  return {
    setTheme,
    update: (dt) => night.step(dt),
    leds: { riser, floor },
    night: () => night.value,
    dispose() {
      scene.remove(hemisphere, key, riser, floor);
      [hemisphere, key, riser, floor].forEach((l) => l.dispose && l.dispose());
    },
  };
}
