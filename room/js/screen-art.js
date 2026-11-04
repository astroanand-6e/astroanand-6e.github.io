// The MacBook's game: the "Paper City" title screen (see title-scene.js) on the laptop's display, plus a
// blinking prompt on its own small plane, so the big texture is only re-uploaded when the theme changes.
import * as THREE from 'three';
import {
  TITLE_W, TITLE_H, PROMPT_W, PROMPT_H, TITLE_FONT_FACE, PROMPT_TEXT, paintTitleScene, paintPrompt,
} from './title-scene.js';

const BLINK_SECONDS = 0.6;
const OVERLAY_LIFT = 0.002;
const PROMPT_WIDTH_SHARE = 0.46;
const PROMPT_FROM_BOTTOM = 0.1;
const MAX_ANISOTROPY = 8;

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function makeTexture(canvas, renderer) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(MAX_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

/** Replaces the MacBook's screen material with the title screen and adds the blinking prompt. */
export function createScreenArt({ screenMesh, renderer, theme }) {
  const screenCanvas = makeCanvas(TITLE_W, TITLE_H);
  const promptCanvas = makeCanvas(PROMPT_W, PROMPT_H);
  const texture = makeTexture(screenCanvas, renderer);
  const promptTexture = makeTexture(promptCanvas, renderer);
  let current = theme === 'ink' ? 'ink' : 'paper';

  function repaint() {
    paintTitleScene(screenCanvas, current);
    paintPrompt(promptCanvas);
    texture.needsUpdate = true;
    promptTexture.needsUpdate = true;
  }
  repaint();

  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  screenMesh.material = material;

  screenMesh.geometry.computeBoundingBox();
  const box = screenMesh.geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const promptMaterial = new THREE.MeshBasicMaterial({
    map: promptTexture, transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const width = size.x * PROMPT_WIDTH_SHARE;
  const prompt = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * PROMPT_H) / PROMPT_W).rotateX(Math.PI / 2), promptMaterial);
  // The screen plane faces -y in lid space; sit just in front of it, near the bottom edge.
  prompt.position.set(center.x, box.min.y - OVERLAY_LIFT, box.min.z + size.z * PROMPT_FROM_BOTTOM);
  prompt.raycast = () => {};
  screenMesh.add(prompt);

  renderer.initTexture(texture);
  renderer.initTexture(promptTexture);

  // The serif arrives from the page's font request; repaint once it is there (the fallback shows until then).
  let isDisposed = false;
  if (document.fonts && document.fonts.load) {
    document.fonts.load(TITLE_FONT_FACE, PROMPT_TEXT).then(() => {
      if (!isDisposed) repaint();
    }).catch(() => {});
  }

  let clock = 0;
  function update(dt, reduced) {
    clock += dt;
    prompt.visible = reduced || Math.floor(clock / BLINK_SECONDS) % 2 === 0;
  }

  function setTheme(name) {
    const next = name === 'ink' ? 'ink' : 'paper';
    if (next === current) return;
    current = next;
    repaint();
  }

  function dispose() {
    isDisposed = true;
    screenMesh.remove(prompt);
    prompt.geometry.dispose();
    [material, promptMaterial].forEach((m) => m.dispose());
    [texture, promptTexture].forEach((t) => t.dispose());
  }

  return { update, setTheme, dispose };
}
