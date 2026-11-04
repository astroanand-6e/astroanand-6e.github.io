// Plank floor painted once to a canvas: staggered boards, hairline seams, a little grain.
import * as THREE from 'three';
import { ROOM } from './config.js';

const PX_PER_UNIT = 44;
const PLANK_WIDTH = 1.05;
const PLANK_MIN = 5;
const PLANK_SPAN = 8;
const BASE_TONES = ['#e5cfa8', '#dec79f', '#e9d4ae', '#dbc299', '#e2cba3'];
const SEAM = 'rgba(96, 68, 34, 0.34)';
const GRAIN = 'rgba(120, 86, 44, 0.07)';
const GRAIN_STROKES = 5;
const MAX_ANISOTROPY = 8;

// Deterministic: the floor must not change between visits.
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function paintPlank(g, rand, x, y, w, h) {
  g.fillStyle = BASE_TONES[Math.floor(rand() * BASE_TONES.length)];
  g.fillRect(x, y, w, h);
  g.strokeStyle = GRAIN;
  g.lineWidth = 1;
  for (let i = 0; i < GRAIN_STROKES; i += 1) {
    const gy = y + rand() * h;
    g.beginPath();
    g.moveTo(x + rand() * w * 0.3, gy);
    g.lineTo(x + w * (0.6 + rand() * 0.4), gy + (rand() - 0.5) * 3);
    g.stroke();
  }
  g.fillStyle = SEAM;
  g.fillRect(x, y, 1.5, h);
}

export function makeFloorTexture(renderer) {
  const width = Math.round((ROOM.x1 - ROOM.x0) * PX_PER_UNIT);
  const height = Math.round((ROOM.z1 - ROOM.z0) * PX_PER_UNIT);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const rand = createRandom(7);
  const plankPx = PLANK_WIDTH * PX_PER_UNIT;
  for (let y = 0; y < height; y += plankPx) {
    let x = -rand() * PLANK_SPAN * PX_PER_UNIT;
    while (x < width) {
      const length = (PLANK_MIN + rand() * PLANK_SPAN) * PX_PER_UNIT;
      paintPlank(g, rand, x, y, length, plankPx);
      x += length;
    }
    g.fillStyle = SEAM;
    g.fillRect(0, y, width, 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(MAX_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
  return texture;
}
