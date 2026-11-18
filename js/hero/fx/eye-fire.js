/* Eye ignition: a red anamorphic streak plus an original three-blade aperture iris.
   The streak is the closed-form tent gradient from the HyperFrames vfx-anamorphic-flare block
   (Apache-2.0), retinted red. The iris is original: three tangent blades turning around a glowing
   opening. Every frame is a pure function of p (0..1), so it renders identically on any seek. */
import { clamp01, easeOut, isPaper, span } from '../timeline-utils.js';

const TAU = Math.PI * 2;
const BLADE_COUNT = 3;
const STREAK_HALF_FRAC = 0.46;
const STREAK_CORE_PX = 2.2;
const STREAK_BAND_PX = 16;
const IRIS_RADIUS_FRAC = 0.05;
const IRIS_TURNS = 0.75;
/* Measured against assets/hero/eyes.webp: a real iris there is about 3.9% of the portrait's
   height across, which the close-up's own canvas geometry puts at a drawn radius of ~1.8% of
   this canvas's height at scale 1 (docs/IRIS-ALIGNMENT.md has the conversion). BLADE_REACH and
   the outer-ring radius below used to run the blades and ring out past 2x the drawn iris itself,
   which is why they spilled off the iris onto the lens, frame and brow; both are now sized to
   stay close to the iris edge instead. */
const BLADE_REACH = 1.2;
/* Dark: light added on black (canvas 'lighter', CSS screen). Paper: deep red ink laid over the
   art (source-over, CSS multiply in css/hero.css), since added light vanishes on a light page. */
const NIGHT = Object.freeze({ red: '255,42,31', hot: '255,170,140', op: 'lighter', glow: 1, marks: true });
/* On paper the soft glow reads as a red stain on his face if pushed too far, so it stays modest here;
   most of the paper glow comes from the layered drop-shadow in css/hero.css, which can blur well past
   this canvas's own edges without muddying the skin under it. */
/* marks: false - on paper the face-sized ring and blades are opaque red ink, not light, and read as
   scratches across his face; the paper theme keeps only the soft glow. */
const PAPER = Object.freeze({ red: '176,0,0', hot: '225,6,0', op: 'source-over', glow: 0.22, marks: false });
let RED = NIGHT.red;
let HOT = NIGHT.hot;
let GLOW = NIGHT.glow;
let MARKS = NIGHT.marks;

function glow(ctx, x, y, radius, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${HOT},${alpha})`);
  g.addColorStop(0.25, `rgba(${RED},${alpha * 0.6})`);
  g.addColorStop(1, `rgba(${RED},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function streak(ctx, x, y, half, thickness, alpha) {
  const g = ctx.createLinearGradient(x - half, 0, x + half, 0);
  g.addColorStop(0, `rgba(${RED},0)`);
  g.addColorStop(0.5, `rgba(${HOT},${alpha})`);
  g.addColorStop(1, `rgba(${RED},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - half, y - thickness / 2, half * 2, thickness);
}

function strokeBlades(ctx, x, y, open, spin, alpha) {
  const reach = open * BLADE_REACH;
  const passes = [[9, 0.12], [3.2, 0.5], [1.1, 0.95]];
  passes.forEach(([width, a]) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(${width < 2 ? HOT : RED},${a * alpha})`;
    ctx.beginPath();
    for (let k = 0; k < BLADE_COUNT; k += 1) {
      const phi = spin + (k * TAU) / BLADE_COUNT;
      const tx = x + open * Math.cos(phi);
      const ty = y + open * Math.sin(phi);
      ctx.moveTo(tx - reach * 0.3 * -Math.sin(phi), ty - reach * 0.3 * Math.cos(phi));
      ctx.lineTo(tx - reach * -Math.sin(phi), ty - reach * Math.cos(phi));
    }
    ctx.stroke();
  });
}

/* Per-point strengths (all default to 1): glow, streak (length and alpha), thin (streak thickness), iris (alpha). */
const STRENGTH = Object.freeze({ glow: 1, streak: 1, thin: 1, iris: 1 });

function drawPoint(ctx, w, h, spec, p) {
  const point = { ...STRENGTH, ...spec };
  const x = point.x * w;
  const y = point.y * h;
  const ignite = easeOut(span(p, 0, 0.45));
  const iris = easeOut(span(p, 0.2, 1));
  const radius = h * IRIS_RADIUS_FRAC * point.scale;
  const open = radius * (0.35 + 0.65 * iris);
  glow(ctx, x, y, radius * (1.2 + 3 * ignite * GLOW), 0.85 * ignite * point.glow * GLOW);
  const len = w * STREAK_HALF_FRAC * point.streak * ignite;
  streak(ctx, x, y, len, STREAK_BAND_PX * point.scale * point.thin, 0.28 * ignite * point.streak);
  streak(ctx, x, y, len * 0.7, STREAK_CORE_PX * point.scale * point.thin, 0.95 * ignite * point.streak);
  if (iris <= 0 || !MARKS) return;
  strokeBlades(ctx, x, y, open, iris * IRIS_TURNS * TAU, iris * point.iris);
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${RED},${0.55 * iris * point.iris})`;
  ctx.beginPath();
  ctx.arc(x, y, open * 1.15, 0, TAU);
  ctx.stroke();
}

/* points: [{ x, y, scale }] in 0..1 canvas coordinates. */
export function createEyeFire(canvas, points) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  let lastP = 0;
  function render(p) {
    lastP = clamp01(p);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    if (lastP <= 0.001) return;
    const look = isPaper() ? PAPER : NIGHT;
    RED = look.red;
    HOT = look.hot;
    GLOW = look.glow;
    MARKS = look.marks;
    ctx.globalCompositeOperation = look.op;
    points.forEach((point) => drawPoint(ctx, w, h, point, lastP));
  }
  return { render, wake() { render(lastP); }, repaint() { render(lastP); }, release() {} };
}
