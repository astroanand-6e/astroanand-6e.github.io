// Baked contact shadows: every footprint in the room is a pair of soft quads in one merged mesh.
import * as THREE from 'three';

const TEXTURE_SIZE = 128;
const BLUR_PX = 17;
const RECT_INSET = 0.24;
const SOFT_SCALE = 1.18;
const CONTACT_SCALE = 0.9;
const SOFT_ALPHA = 0.34;
const CONTACT_ALPHA = 0.5;
const DEFAULT_LIFT = 0.03;
const OFFSET_SHARE = Object.freeze({ x: -0.045, z: -0.035 });
const THEME_OPACITY = Object.freeze({ paper: 0.55, ink: 1 });
const RENDER_ORDER = -10;
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function makeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const g = canvas.getContext('2d');
  const inset = TEXTURE_SIZE * RECT_INSET;
  const size = TEXTURE_SIZE - inset * 2;
  // The rect is drawn off-canvas; only its blurred shadow lands inside.
  g.shadowColor = 'rgba(0,0,0,1)';
  g.shadowBlur = BLUR_PX;
  g.shadowOffsetX = TEXTURE_SIZE;
  g.fillRect(inset - TEXTURE_SIZE, inset, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createShadowLayer(theme = 'paper') {
  const entries = [];
  const texture = makeTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  let mesh = null;

  function setTheme(name) {
    material.opacity = THEME_OPACITY[name] ?? THEME_OPACITY.paper;
  }
  setTheme(theme);

  /** Footprint centred on world (x, z), size w x d, optional yaw and height. */
  function add({ x, z, w, d, y = DEFAULT_LIFT, yaw = 0, strength = 1 }) {
    entries.push({ x, z, w, d, y, yaw, strength });
  }

  function pushQuad(buffers, { cx, cz, w, d, y, yaw, alpha }) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const base = buffers.position.length / 3;
    CORNERS.forEach(([sx, sz]) => {
      const lx = (sx * w) / 2;
      const lz = (sz * d) / 2;
      buffers.position.push(cx_(cx, lx, lz, cos, sin), y, cz_(cz, lx, lz, cos, sin));
      buffers.uv.push(sx > 0 ? 1 : 0, sz > 0 ? 0 : 1);
      buffers.color.push(0, 0, 0, alpha);
    });
    buffers.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const cx_ = (cx, lx, lz, cos, sin) => cx + lx * cos + lz * sin;
  const cz_ = (cz, lx, lz, cos, sin) => cz - lx * sin + lz * cos;

  function build() {
    const span = 1 / (1 - RECT_INSET * 2);
    const buffers = { position: [], uv: [], color: [], index: [] };
    entries.forEach((e) => {
      const cx = e.x + e.w * OFFSET_SHARE.x;
      const cz = e.z + e.d * OFFSET_SHARE.z;
      pushQuad(buffers, { cx, cz, w: e.w * span * SOFT_SCALE, d: e.d * span * SOFT_SCALE, y: e.y, yaw: e.yaw, alpha: SOFT_ALPHA * e.strength });
      pushQuad(buffers, { cx, cz, w: e.w * span * CONTACT_SCALE, d: e.d * span * CONTACT_SCALE, y: e.y + 0.004, yaw: e.yaw, alpha: CONTACT_ALPHA * e.strength });
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.color, 4));
    geometry.setIndex(buffers.index);
    mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = RENDER_ORDER;
    mesh.raycast = () => {};
    return mesh;
  }

  function dispose() {
    if (mesh) mesh.geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  return { add, build, setTheme, dispose };
}
