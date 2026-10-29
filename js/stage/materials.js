import * as THREE from 'three';

// Key-light multipliers for the three toon bands (shadow, mid, lit).
const RAMPS = {
  paper: [0, 118, 255],
  ink: [0, 96, 255],
};
const OUTLINE_ANGLE_DEG = 30;
const LINE_OPACITY = { paper: 1, ink: 0.58 };
const SAKURA_GLOW = { paper: 0, ink: 0.6 };
const POLYGON_OFFSET = 1;

// Roles stay fixed across themes; only the colors swap. Paper reads as a
// technical plate (clean, near-flat fills); ink bodies are slightly
// desaturated so the sakura accents are the only thing that glows.
const PALETTES = {
  paper: {
    paper: 0xf4efe6,
    ink: 0x1c1a17,
    sakura: 0xd47589,
    white: 0xfbfaf5,
    dark: 0x2b2825,
    silver: 0xc9cccd,
    glass: 0xbcd4da,
    line: 0x1c1a17,
  },
  ink: {
    paper: 0x35322d,
    ink: 0xe9e2d3,
    sakura: 0xe98fa4,
    white: 0xd3d0c8,
    dark: 0x100f0d,
    silver: 0x8a8d90,
    glass: 0x3d555e,
    line: 0xe9e2d3,
  },
};

const SOLID_ROLES = ['paper', 'ink', 'sakura', 'white', 'dark', 'silver'];

function makeGradientMap() {
  const data = new Uint8Array(RAMPS.paper);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeToon(gradientMap, extra = {}) {
  return new THREE.MeshToonMaterial({
    gradientMap,
    // Push fills back a hair so hairline outlines never z-fight their own faces.
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET,
    polygonOffsetUnits: POLYGON_OFFSET,
    ...extra,
  });
}

/**
 * Shared toon materials. Every role is a single live instance: setTheme()
 * recolors in place, so object modules never need to react to theme changes.
 * Roles: paper, ink, sakura, white (plastic), dark (platter), silver, glass.
 */
export function createMaterials(initialTheme = 'paper') {
  const gradient = makeGradientMap();
  const edgeCache = new WeakMap();
  const lineMaterial = new THREE.LineBasicMaterial({ transparent: true });
  const materials = { gradient, line: lineMaterial, theme: initialTheme };

  SOLID_ROLES.forEach((role) => {
    materials[role] = makeToon(gradient);
  });
  materials.glass = makeToon(gradient, { transparent: true, opacity: 0.42, depthWrite: false });
  materials.plastic = materials.white;

  function setTheme(name) {
    const palette = PALETTES[name];
    if (!palette) return;
    materials.theme = name;
    [...SOLID_ROLES, 'glass'].forEach((role) => materials[role].color.setHex(palette[role]));
    gradient.image.data.set(RAMPS[name]);
    gradient.needsUpdate = true;
    lineMaterial.color.setHex(palette.line);
    lineMaterial.opacity = LINE_OPACITY[name];
    materials.sakura.emissive.setHex(palette.sakura);
    materials.sakura.emissiveIntensity = SAKURA_GLOW[name];
  }

  function makeOutline(mesh, thresholdDeg = OUTLINE_ANGLE_DEG) {
    let edges = edgeCache.get(mesh.geometry);
    if (!edges) {
      edges = new THREE.EdgesGeometry(mesh.geometry, thresholdDeg);
      edgeCache.set(mesh.geometry, edges);
    }
    const line = new THREE.LineSegments(edges, lineMaterial);
    line.raycast = () => {};
    line.userData.isOutline = true;
    line.matrixAutoUpdate = false;
    mesh.add(line);
    return line;
  }

  function onTheme(event) {
    setTheme(event.detail && event.detail.theme);
  }
  window.addEventListener('theme', onTheme);
  setTheme(initialTheme);

  materials.setTheme = setTheme;
  materials.makeOutline = makeOutline;
  materials.palettes = PALETTES;
  materials.dispose = () => {
    window.removeEventListener('theme', onTheme);
    gradient.dispose();
    lineMaterial.dispose();
    [...SOLID_ROLES, 'glass'].forEach((role) => materials[role].dispose());
  };
  return materials;
}
