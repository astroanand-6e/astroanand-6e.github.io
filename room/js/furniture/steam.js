// Faint steam rising from the mug: three soft ribbons, bent each frame on the CPU (one draw call).
import * as THREE from 'three';
import { DESK } from '../config.js';
import { MUG } from './props.js';

const WISPS = 3;
const ROWS = 7;
const HEIGHT = 1.9;
const WIDTH = 0.17;
const SWAY = 0.24;
const RISE_HZ = 1.2;
const TEXTURE = Object.freeze({ w: 48, h: 96 });
const OPACITY = 0.46;

function softTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE.w;
  canvas.height = TEXTURE.h;
  const g = canvas.getContext('2d');
  const image = g.createImageData(TEXTURE.w, TEXTURE.h);
  for (let y = 0; y < TEXTURE.h; y += 1) {
    for (let x = 0; x < TEXTURE.w; x += 1) {
      const u = x / (TEXTURE.w - 1);
      const v = y / (TEXTURE.h - 1);
      const alpha = Math.sin(Math.PI * v) ** 0.9 * (1 - Math.abs(2 * u - 1)) ** 1.4;
      const i = (y * TEXTURE.w + x) * 4;
      image.data.set([255, 255, 255, Math.round(alpha * 255)], i);
    }
  }
  g.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

export function createSteam() {
  const verts = WISPS * ROWS * 2;
  const position = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
  const uv = new THREE.BufferAttribute(new Float32Array(verts * 2), 2);
  const index = [];
  for (let w = 0; w < WISPS; w += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const i = (w * ROWS + r) * 2;
      uv.setXY(i, 0, r / (ROWS - 1));
      uv.setXY(i + 1, 1, r / (ROWS - 1));
      if (r < ROWS - 1) index.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('uv', uv);
  geometry.setIndex(index);
  const texture = softTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture, color: 0xeef8f8, transparent: true, opacity: OPACITY, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  const baseY = DESK.top + 0.07 + MUG.height;
  let clock = 0;

  function update(dt, reducedMotion) {
    if (!reducedMotion) clock += dt;
    for (let w = 0; w < WISPS; w += 1) {
      for (let r = 0; r < ROWS; r += 1) {
        const h = r / (ROWS - 1);
        const wave = Math.sin(h * 3.4 - clock * RISE_HZ + w * 2.1);
        const cx = MUG.x + (w - 1) * 0.2 + wave * SWAY * h;
        const cz = MUG.z + Math.cos(h * 2.6 - clock * 0.8 + w) * 0.12 * h;
        const half = (WIDTH * (0.6 + h * 0.9)) / 2;
        const i = (w * ROWS + r) * 2;
        position.setXYZ(i, cx - half, baseY + h * HEIGHT, cz);
        position.setXYZ(i + 1, cx + half, baseY + h * HEIGHT, cz);
      }
    }
    position.needsUpdate = true;
  }
  update(0, true);

  return {
    mesh,
    update,
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
