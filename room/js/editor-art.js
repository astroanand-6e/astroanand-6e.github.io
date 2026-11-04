// The MacBook shows code: a dark editor made of colored bars (no readable text), painted once.
import * as THREE from 'three';

const W = 1536;
const H = 998;
const CORNER_PX = 36;
const TOKENS = ['#e4637c', '#6bbf8a', '#5aa9e6', '#f2a65a', '#9b7fe6', '#d6d9de'];
const INDENTS = [0, 1, 1, 2, 2, 2, 1, 0, 0, 1, 2, 3, 3, 2, 1, 1, 0];
const ROW_H = 34;
const CODE_X = 380;
const FIRST_ROW_Y = 96;
const ACTIVE_ROW = 7;
const MAX_ANISOTROPY = 8;

function createRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function bar(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
}

function paintChrome(g) {
  g.fillStyle = '#171b23';
  g.fillRect(0, 0, W, 56);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(36 + i * 30, 28, 9, 0, Math.PI * 2);
    g.fill();
  });
  [0, 1, 2].forEach((i) => {
    g.fillStyle = i === 0 ? '#0f1218' : '#1d222c';
    g.beginPath();
    g.roundRect(170 + i * 230, 12, 214, 44, [10, 10, 0, 0]);
    g.fill();
    bar(g, 194 + i * 230, 28, 100 + i * 14, 12, i === 0 ? '#aab2c0' : '#566073');
  });
  g.fillStyle = '#121620';
  g.fillRect(0, 56, 320, H - 56);
  g.fillStyle = '#1e5e63';
  g.fillRect(0, 56 + 3 * 38 + 6, 320, 36);
}

function paintTree(g, rand) {
  for (let i = 0; i < 14; i += 1) {
    const indent = [0, 1, 1, 0, 1, 2, 2, 1, 0, 1, 1, 2, 1, 0][i];
    const y = 66 + i * 38 + 12;
    g.fillStyle = i % 3 === 0 ? '#f2a65a' : '#5aa9e6';
    g.fillRect(28 + indent * 26, y, 14, 14);
    bar(g, 54 + indent * 26, y + 1, 70 + rand() * 120, 12, '#4d5568');
  }
}

function paintCode(g, rand) {
  g.fillStyle = '#171c27';
  g.fillRect(320, FIRST_ROW_Y + ACTIVE_ROW * ROW_H - 6, W - 320, ROW_H);
  for (let r = 0; r < 24; r += 1) {
    const y = FIRST_ROW_Y + r * ROW_H;
    bar(g, 340, y + 5, 24, 12, '#323949');
    if (r % 7 === 4) continue;
    let x = CODE_X + INDENTS[r % INDENTS.length] * 44;
    const segments = 2 + Math.floor(rand() * 4);
    for (let s = 0; s < segments; s += 1) {
      const w = 36 + rand() * 170;
      bar(g, x, y + 4, w, 14, TOKENS[Math.floor(rand() * TOKENS.length)]);
      x += w + 14;
    }
    if (r === ACTIVE_ROW) {
      g.fillStyle = '#f4efe6';
      g.fillRect(x, y, 3, 22);
    }
  }
}

function paintMinimap(g, rand) {
  for (let r = 0; r < 60; r += 1) {
    const w = 10 + rand() * 70;
    bar(g, W - 150, 80 + r * 9, w, 4, `${TOKENS[Math.floor(rand() * TOKENS.length)]}88`);
  }
  g.strokeStyle = '#3a4252';
  g.lineWidth = 2;
  g.strokeRect(W - 156, 120, 130, 150);
}

function paintStatus(g) {
  g.fillStyle = '#143f43';
  g.fillRect(0, H - 40, W, 40);
  g.fillStyle = '#21d6cf';
  g.fillRect(0, H - 40, 120, 40);
  [160, 290, 410].forEach((x) => bar(g, x, H - 26, 90, 12, '#6fa9a8'));
}

export function paintEditor(canvas) {
  const g = canvas.getContext('2d');
  const rand = createRandom(5);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.save();
  g.beginPath();
  g.roundRect(0, 0, W, H, [CORNER_PX, CORNER_PX, 0, 0]);
  g.clip();
  g.fillStyle = '#0f1218';
  g.fillRect(0, 0, W, H);
  paintChrome(g);
  paintTree(g, rand);
  paintCode(g, rand);
  paintMinimap(g, rand);
  paintStatus(g);
  g.restore();
  return canvas;
}

/** Puts the editor on a laptop screen mesh. */
export function createEditorArt({ screenMesh, renderer }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const texture = new THREE.CanvasTexture(paintEditor(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(MAX_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  screenMesh.material = material;
  renderer.initTexture(texture);
  return {
    dispose() {
      material.dispose();
      texture.dispose();
    },
  };
}
