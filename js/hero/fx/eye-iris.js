/* Close-up iris (scenes/eyes.js): each eye ignites into a glowing red iris with a dark limbal ring, a
   pupil and three curved blades that spin in and settle, drawn crisp at device resolution on one small
   canvas per eye. It paints only where the real iris shows: clipped to the iris circle and to below the
   upper lid, both measured off assets/hero/eyes.webp (1024x768) from gamma-boosted crops on 2026-11-18.
   That is the full iris edge; CLOSEUP_EYES in config.js marks the red glow inside it, which sits lower.
   An original design (a three-blade pinwheel), not a copy of any anime eye.
   render(p, t): p 0..1 is the ignition, t the scene time in seconds (a slow drift once lit). */
import { easeOut, span } from '../timeline-utils.js';

const TAU = Math.PI * 2;
const PLATE = Object.freeze({ w: 1024, h: 768 });
const BOX = 2.4; /* canvas side, in iris radii */
const MAX_DPR = 3;
const DRIFT = 0.22; /* radians per second once lit */
const ALPHA = 0.95; /* a trace of the painted iris shows through */
/* x, y, r: the iris circle. lid: the upper lid line (start, middle, end) the iris slides under.
   glint: the plate's own catchlight, redrawn on top so the eye stays wet. Plate pixels. */
export const IRISES = Object.freeze([
  Object.freeze({ x: 439, y: 318, r: 22, lid: [[412, 311], [439, 306.5], [466, 311]], glint: [445.5, 316] }),
  Object.freeze({ x: 668, y: 311, r: 22, lid: [[641, 305], [668, 300], [695, 302]], glint: [675, 306] }),
]);
/* Fixed fibre pattern: [angle, length 0..1, light?] for 64 strands, the same on every frame. */
const FIBRES = Object.freeze(Array.from({ length: 64 }, (_, i) => {
  const h = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  return Object.freeze([(i / 64) * TAU + (h - 0.5) * 0.08, 0.78 + 0.18 * h, i % 3 !== 0]);
}));

const polar = (rad, a) => [rad * Math.cos(a), rad * Math.sin(a)];

function clipToVisible(ctx, eye) {
  const { x, y, r, lid } = eye;
  const [[x0, y0], [xm, ym], [x1, y1]] = lid;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();
  /* The control point that makes the curve pass through the middle point at t = 0.5. */
  const cx = 2 * xm - (x0 + x1) / 2;
  const cy = 2 * ym - (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x0 - x - r, y0 - y);
  ctx.lineTo(x0 - x, y0 - y);
  ctx.quadraticCurveTo(cx - x, cy - y, x1 - x, y1 - y);
  ctx.lineTo(x1 - x + r, y1 - y);
  ctx.lineTo(x1 - x + r, 2 * r);
  ctx.lineTo(x0 - x - r, 2 * r);
  ctx.closePath();
  ctx.clip();
}

function ring(ctx, radius, width, style) {
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();
}

function paintIris(ctx, r) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, '#140000');
  g.addColorStop(0.24, '#4a0004');
  g.addColorStop(0.5, '#c0080f');
  g.addColorStop(0.78, '#f0241b');
  g.addColorStop(0.92, '#8c0007');
  g.addColorStop(1, '#1e0000');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  /* Light pools in the lower iris and the top sits in the lid's shade, as in the painted eye. */
  const pool = ctx.createRadialGradient(0, r * 0.5, 0, 0, r * 0.5, r * 0.8);
  pool.addColorStop(0, 'rgba(255, 140, 110, 0.32)');
  pool.addColorStop(1, 'rgba(255, 140, 110, 0)');
  ctx.fillStyle = pool;
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  const shade = ctx.createLinearGradient(0, -r, 0, r * 0.2);
  shade.addColorStop(0, 'rgba(20, 0, 0, 0.55)');
  shade.addColorStop(1, 'rgba(20, 0, 0, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(-r, -r, 2 * r, 1.2 * r);
  ctx.lineWidth = r * 0.016;
  FIBRES.forEach(([a, len, isLight]) => {
    ctx.strokeStyle = isLight ? 'rgba(255, 150, 120, 0.2)' : 'rgba(50, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.moveTo(...polar(r * 0.3, a));
    ctx.lineTo(...polar(r * len, a));
    ctx.stroke();
  });
}

/* One blade: a thin sickle from beside the pupil out toward the rim, swept clockwise. */
function blade(ctx, r, a, grow) {
  const base = polar(r * 0.25, a - 0.3);
  const tip = polar(r * (0.3 + 0.55 * grow), a + 0.5 + 0.35 * grow);
  ctx.beginPath();
  ctx.moveTo(...base);
  ctx.quadraticCurveTo(...polar(r * (0.3 + 0.5 * grow), a - 0.35), ...tip);
  ctx.quadraticCurveTo(...polar(r * (0.28 + 0.24 * grow), a + 0.55), ...base);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function paintMarks(ctx, r, spin, grow) {
  ring(ctx, r * 0.56, r * 0.035, `rgba(18, 0, 0, ${(0.8 * grow).toFixed(3)})`);
  ctx.fillStyle = '#0d0000';
  ctx.strokeStyle = 'rgba(255, 90, 70, 0.45)';
  ctx.lineWidth = r * 0.02;
  if (grow > 0) for (let k = 0; k < 3; k += 1) blade(ctx, r, spin + (k * TAU) / 3, grow);
  ctx.fillStyle = '#050000';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, TAU);
  ctx.fill();
  ring(ctx, r * 0.245, r * 0.03, 'rgba(255, 70, 50, 0.5)');
  ring(ctx, r * 0.955, r * 0.1, '#0c0000');
}

/* The lid's shadow on the top of the iris, then the plate's catchlight back on top. */
function paintLight(ctx, eye) {
  const { x, y, r, lid, glint } = eye;
  const top = lid[1][1] - y;
  const shade = ctx.createLinearGradient(0, top, 0, top + r * 0.35);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(-r, top, 2 * r, r * 0.35);
  ctx.fillStyle = 'rgba(255, 245, 240, 0.9)';
  ctx.beginPath();
  ctx.ellipse(glint[0] - x, glint[1] - y, r * 0.11, r * 0.075, -0.3, 0, TAU);
  ctx.fill();
}

/* The ignition: a ring of light runs out from the pupil to the rim. */
function paintFlash(ctx, r, p) {
  const q = span(p, 0.05, 0.5);
  if (q <= 0 || q >= 1) return;
  ctx.globalCompositeOperation = 'lighter';
  ring(ctx, r * (0.2 + 0.8 * easeOut(q)), r * 0.07, `rgba(255, 210, 196, ${(0.9 * (1 - q)).toFixed(3)})`);
  ctx.globalCompositeOperation = 'source-over';
}

function drawEye(ctx, eye, p, t) {
  const { r } = eye;
  const grow = easeOut(span(p, 0.15, 0.75));
  const spin = -0.6 + (1 - easeOut(p)) * TAU * 1.5 + Math.max(0, t) * DRIFT;
  ctx.save();
  clipToVisible(ctx, eye);
  ctx.globalAlpha = ALPHA * easeOut(span(p, 0, 0.35));
  paintIris(ctx, r);
  paintMarks(ctx, r, spin, grow);
  ctx.globalAlpha = 1;
  paintLight(ctx, eye);
  paintFlash(ctx, r, p);
  ctx.restore();
}

/* canvases: one per entry of IRISES, inside the close-up figure (its box is the plate's 4:3). */
export function createIris(canvases) {
  const eyes = canvases.slice(0, IRISES.length).map((canvas, i) => {
    const eye = IRISES[i];
    canvas.style.left = `${((eye.x / PLATE.w) * 100).toFixed(3)}%`;
    canvas.style.top = `${((eye.y / PLATE.h) * 100).toFixed(3)}%`;
    canvas.style.width = `calc(var(--fig-h) * ${((BOX * eye.r) / PLATE.h).toFixed(5)})`;
    canvas.style.height = canvas.style.width;
    return { canvas, ctx: canvas.getContext('2d'), eye };
  });
  let last = { p: 0, t: 0 };

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    eyes.forEach(({ canvas }) => {
      const px = Math.max(2, Math.round(canvas.clientWidth * dpr));
      if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    });
  }

  function render(p, t = 0) {
    last = { p, t };
    eyes.forEach(({ canvas, ctx, eye }) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (p <= 0) return;
      const k = canvas.width / (BOX * eye.r);
      ctx.setTransform(k, 0, 0, k, canvas.width / 2, canvas.height / 2);
      drawEye(ctx, eye, p, t);
    });
  }

  window.addEventListener('resize', () => { size(); render(last.p, last.t); });
  return {
    render,
    wake() { size(); render(last.p, last.t); },
    repaint() { render(last.p, last.t); },
    release() {},
  };
}
