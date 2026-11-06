/* Arm raise for the palm scene: stand -> three Qwen in-betweens -> palm, cross-dissolved on a canvas.
   The in-betweens are composited on stand's own pixels (only the arm differs), so the face never
   shimmers. Frames blend additively ('lighter' with weights 1-t and t), which is a true linear
   dissolve: the body stays fully opaque mid-blend instead of dipping like two stacked opacities.
   render(p) is a pure function of p (0..1), so scrubbing and seeking draw the same frame. */
import { clamp01 } from '../timeline-utils.js';

/* Gesture timing in frame space: a held start, a slow anticipation, a fast swing through the middle
   drawings, a tiny overshoot past the palm drawing and a settle. */
function gesture(p) {
  const t = clamp01(p);
  const s = t * t * (3 - 2 * t);
  const swing = s + Math.sin(s * Math.PI) * 0.06 * (1 - s); /* front-loaded energy */
  return Math.min(1, swing);
}

export function createPoseBlend(canvas, images) {
  const ctx = canvas.getContext('2d');
  let lastP = 0;
  let size = [0, 0];

  function fit() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    if (w !== size[0] || h !== size[1]) {
      canvas.width = w;
      canvas.height = h;
      size = [w, h];
    }
  }

  function draw(img, alpha) {
    if (alpha <= 0.001 || !img.complete || !img.naturalWidth) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, 0, 0, size[0], size[1]);
  }

  function render(p) {
    lastP = clamp01(p);
    fit();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, size[0], size[1]);
    if (lastP <= 0) return;
    const f = gesture(lastP) * (images.length - 1);
    const k = Math.min(images.length - 2, Math.floor(f));
    const t = f - k;
    ctx.globalCompositeOperation = 'lighter';
    draw(images[k], 1 - t);
    draw(images[k + 1], t);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  return {
    render,
    wake() { render(lastP); },
    release() {},
    /* Hand position (fraction of the figure) for effects that follow the gesture. */
    progress: () => gesture(lastP),
  };
}
