/* Crow burst. A seeded flock is born on the silhouette of a source image, then flies at the
   camera. The per-particle table is built once (the pattern the HyperFrames particle-image-reveal
   and vfx-shatter blocks use, Apache-2.0); every frame afterwards is a pure function of
   (table, p), repainted from scratch, so any seek order gives the same pixels. */
import { mulberry32 } from '../rng.js';
import { clamp01, easeInOut, span } from '../timeline-utils.js';

const TAU = Math.PI * 2;
const VANISH = { x: 0.5, y: 0.44 };
const SAMPLE_W = 96;
const ALPHA_MIN = 140;
const BIRTH_SPREAD = 0.14;
const FLIGHT_START = 0.05;
const FLAP_MIN = 8;
const FLAP_MAX = 14;
const BASE_SIZE_FRAC = 0.07;

/* Crow silhouette in a 100-unit box, nose along +x: body with a head and beak, a fanned tail,
   and the wing in three poses. The flap cycle runs up, mid, down, mid. */
const BODY = new Path2D('M-30 -6 Q0 -16 26 -11 Q30 -20 42 -17 L64 -10 L44 -6 Q38 -2 32 1 Q4 13 -26 7 L-54 16 L-47 1 L-54 -13 Z');
const WING_POSES = [
  new Path2D('M14 -8 Q4 -34 -22 -50 Q-26 -36 -34 -34 Q-30 -26 -40 -22 Q-22 -12 -24 -4 Z'),
  new Path2D('M14 -8 Q-8 -20 -48 -20 Q-38 -14 -48 -10 Q-34 -8 -44 -3 Q-22 0 -22 2 Z'),
  new Path2D('M14 -2 Q2 18 -26 36 Q-26 24 -34 22 Q-28 16 -38 10 Q-22 6 -22 2 Z'),
];
const FLAP_ORDER = [0, 1, 2, 1];
const UNITS = 100;

function drawCrow(ctx, cycle) {
  const pose = WING_POSES[FLAP_ORDER[Math.floor((cycle - Math.floor(cycle)) * FLAP_ORDER.length)]];
  ctx.fillStyle = '#000';
  ctx.save();
  ctx.translate(10, -2);
  ctx.scale(0.86, 0.86);
  ctx.fill(pose);
  ctx.restore();
  ctx.fill(BODY);
  ctx.fill(pose);
}

/* Collects normalized canvas-space points from the opaque pixels of an image element. */
function sampleSilhouette(img, canvas, count, rng) {
  const fallback = () => Array.from({ length: count }, () => {
    const a = rng() * TAU;
    const r = Math.sqrt(rng());
    return { x: 0.5 + Math.cos(a) * r * 0.18, y: 0.5 + Math.sin(a) * r * 0.36 };
  });
  try {
    const box = img.getBoundingClientRect();
    const host = canvas.getBoundingClientRect();
    if (!img.naturalWidth || !box.width || !host.width) return fallback();
    const h = Math.round((SAMPLE_W * img.naturalHeight) / img.naturalWidth);
    const probe = document.createElement('canvas');
    probe.width = SAMPLE_W;
    probe.height = h;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(img, 0, 0, SAMPLE_W, h);
    const data = pctx.getImageData(0, 0, SAMPLE_W, h).data;
    const pixels = [];
    for (let i = 0; i < SAMPLE_W * h; i += 1) if (data[i * 4 + 3] > ALPHA_MIN) pixels.push(i);
    if (pixels.length < count) return fallback();
    return Array.from({ length: count }, () => {
      const idx = pixels[Math.floor(rng() * pixels.length)];
      const u = ((idx % SAMPLE_W) + rng()) / SAMPLE_W;
      const v = (Math.floor(idx / SAMPLE_W) + rng()) / h;
      return { x: (box.left - host.left + u * box.width) / host.width, y: (box.top - host.top + v * box.height) / host.height };
    });
  } catch (error) {
    return fallback();
  }
}

function buildTable(points, rng) {
  const rows = points.map((s) => {
    const dx = s.x - VANISH.x;
    const dy = s.y - VANISH.y;
    const heading = Math.atan2(dy * 0.3, dx || 0.001) + (rng() - 0.5) * 0.7;
    return {
      sx: s.x, sy: s.y, heading,
      birth: rng() * BIRTH_SPREAD,
      end: 0.7 + rng() * 0.3,
      spread: 2.5 + rng() * 7,
      grow: 2 + rng() * 11,
      curl: (rng() - 0.5) * 0.5,
      phase: rng() * TAU,
      rate: FLAP_MIN + rng() * (FLAP_MAX - FLAP_MIN),
      size: 0.45 + rng() * 0.9,
      bob: rng() * TAU,
    };
  });
  return rows.sort((a, b) => a.grow - b.grow);
}

function drawRow(ctx, row, p, w, h) {
  const born = clamp01((p - row.birth) / 0.05);
  if (born <= 0) return;
  const f = easeInOut(span(p, row.birth + FLIGHT_START, row.end));
  const k = 1 + Math.pow(f, 2.2) * row.spread;
  const perp = Math.sin(f * Math.PI) * row.curl;
  const x = VANISH.x + (row.sx - VANISH.x) * k + -Math.sin(row.heading) * perp;
  const y = VANISH.y + (row.sy - VANISH.y) * k + Math.cos(row.heading) * perp;
  const scale = h * BASE_SIZE_FRAC * row.size * (1 + Math.pow(f, 2.4) * row.grow);
  if (x < -0.6 || x > 1.6 || y < -0.6 || y > 1.6) return;
  const facesLeft = Math.cos(row.heading) < 0;
  ctx.save();
  ctx.globalAlpha = born;
  ctx.translate(x * w, y * h + Math.sin(p * 40 + row.bob) * scale * 0.04);
  ctx.rotate(facesLeft ? row.heading + Math.PI : row.heading);
  ctx.scale(facesLeft ? -scale / UNITS : scale / UNITS, scale / UNITS);
  drawCrow(ctx, row.phase + row.rate * p);
  ctx.restore();
}

/* options: { count, seed, getSource: () => img element, maxDpr, scale } */
export function createCrows(canvas, options) {
  const ctx = canvas.getContext('2d');
  let table = [];
  let lastP = 0;
  let isActive = false;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, options.maxDpr) * options.scale;
    canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
  }

  function paint() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (lastP <= 0.001) return;
    table.forEach((row) => drawRow(ctx, row, lastP, canvas.width, canvas.height));
  }

  return {
    render(p) {
      lastP = clamp01(p);
      if (isActive) paint();
    },
    wake() {
      if (isActive) return;
      fit();
      const rng = mulberry32(options.seed);
      table = buildTable(sampleSilhouette(options.getSource(), canvas, options.count, rng), rng);
      isActive = true;
      paint();
    },
    release() {
      isActive = false;
      table = [];
    },
    get isActive() { return isActive; },
  };
}
