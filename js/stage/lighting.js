import * as THREE from 'three';

// Key light is placed so the three toon bands land on top (lit), the left
// face (mid) and the right face (shadow) of an isometric box.
const KEY_POSITION = [-7.5, 12.5, 3.75];
// Rim comes from behind and above: it only grazes silhouettes that curve away.
const RIM_POSITION = [-9, 6, -11];

const LIGHTS = {
  paper: {
    sky: 0xfffdf8,
    ground: 0xe4d8c3,
    hemi: 1.95,
    key: 1.2,
    keyColor: 0xfff4e4,
    rim: 0xffffff,
    rimIntensity: 0.28,
  },
  ink: {
    sky: 0xb8c2dc,
    ground: 0x2c2832,
    hemi: 1.5,
    key: 1.75,
    keyColor: 0xffeedd,
    rim: 0xf4a7b9,
    rimIntensity: 1.0,
  },
};

/** Hemisphere fill + toon key + subtle rim. Theme swaps update in place. */
export function createLighting(scene, theme = 'paper') {
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  const rim = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(...KEY_POSITION);
  rim.position.set(...RIM_POSITION);
  scene.add(hemisphere, key, rim);

  function setTheme(name) {
    const preset = LIGHTS[name] || LIGHTS.paper;
    hemisphere.color.setHex(preset.sky);
    hemisphere.groundColor.setHex(preset.ground);
    hemisphere.intensity = preset.hemi;
    key.color.setHex(preset.keyColor);
    key.intensity = preset.key;
    rim.color.setHex(preset.rim);
    rim.intensity = preset.rimIntensity;
  }
  setTheme(theme);

  return {
    setTheme,
    dispose() {
      scene.remove(hemisphere, key, rim);
      hemisphere.dispose();
      key.dispose();
      rim.dispose();
    },
  };
}
