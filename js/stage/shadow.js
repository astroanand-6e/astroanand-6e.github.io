import * as THREE from 'three';

const TEXTURE_SIZE = 256;
const BLUR_PX = 34;
const RECT_INSET = 0.24;
const SOFT_SCALE = 1.14;
const CONTACT_SCALE = 0.86;
const GROUND_LIFT = 0.02;
const OFFSET_SHARE = { x: 0.035, z: -0.02 };
const OPACITY = {
  paper: { soft: 0.2, contact: 0.3 },
  ink: { soft: 0.42, contact: 0.55 },
};

function makeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const g = canvas.getContext('2d');
  const inset = TEXTURE_SIZE * RECT_INSET;
  const size = TEXTURE_SIZE - inset * 2;
  // Draw the rect off-canvas and keep only its blurred shadow (works without ctx.filter).
  g.shadowColor = 'rgba(0,0,0,1)';
  g.shadowBlur = BLUR_PX;
  g.shadowOffsetX = TEXTURE_SIZE;
  g.fillRect(inset - TEXTURE_SIZE, inset, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Baked soft contact shadows: a wide soft layer plus a tight dark core. */
export function createShadows(theme = 'paper') {
  const texture = makeTexture();
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const make = () =>
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const materials = { soft: make(), contact: make() };
  let current = theme;

  function applyTheme(name) {
    current = OPACITY[name] ? name : 'paper';
    materials.soft.opacity = OPACITY[current].soft;
    materials.contact.opacity = OPACITY[current].contact;
  }
  applyTheme(theme);

  return {
    setTheme: applyTheme,
    /** Adds the pair under `parent`, sized to a local-space footprint box. */
    add(parent, box) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const span = 1 / (1 - RECT_INSET * 2);
      const group = new THREE.Group();
      group.position.set(
        center.x + size.x * OFFSET_SHARE.x,
        box.min.y + GROUND_LIFT,
        center.z + size.z * OFFSET_SHARE.z,
      );
      [
        ['soft', SOFT_SCALE, -2],
        ['contact', CONTACT_SCALE, -1],
      ].forEach(([layer, scale, order]) => {
        const mesh = new THREE.Mesh(geometry, materials[layer]);
        mesh.scale.set(size.x * span * scale, 1, size.z * span * scale);
        mesh.renderOrder = order;
        mesh.raycast = () => {};
        group.add(mesh);
      });
      parent.add(group);
      return group;
    },
    dispose() {
      texture.dispose();
      geometry.dispose();
      materials.soft.dispose();
      materials.contact.dispose();
    },
  };
}
