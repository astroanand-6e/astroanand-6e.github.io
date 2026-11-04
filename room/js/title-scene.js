// "Paper City" title screen, painted to a canvas: a low-angle skyline cut from layered paper, palm silhouettes
// and the title in Instrument Serif italic. Golden hour for the paper theme, the same city at night for ink.
// Kept to a few big shapes so it still reads at thumbnail size.
export const TITLE_W = 1760;
export const TITLE_H = 990;
export const PROMPT_W = 1536;
export const PROMPT_H = 220;
export const TITLE_TEXT = 'Paper City';
export const PROMPT_TEXT = 'Press start';
export const TITLE_FONT_FACE = 'italic 400 64px "Instrument Serif"';

const FONT_FAMILY = '"Instrument Serif", Georgia, "Times New Roman", serif';
const HORIZON = 0.745;
const PAPER_CUT_BLUR = 16;

const SCENES = {
  paper: {
    sky: ['#fdf1d6', '#fcdfb6', '#f9c88f', '#f5aa68'],
    sun: { core: '#fff7da', rim: '#ffe2a0', glow: 'rgba(255, 233, 178, 0.75)' },
    layers: [
      { color: '#ebbd96', minH: 0.07, maxH: 0.2, minW: 44, maxW: 96, gap: 8, lit: 0, edge: 0.5 },
      { color: '#d28a68', minH: 0.1, maxH: 0.3, minW: 52, maxW: 110, gap: 10, lit: 0.05, edge: 0.8 },
      { color: '#7b4559', minH: 0.12, maxH: 0.4, minW: 78, maxW: 160, gap: 26, lit: 0.1, edge: 1.5 },
    ],
    window: '#ffe39d',
    shadow: 'rgba(70, 30, 40, 0.34)',
    ground: '#3b2432',
    palm: '#26161f',
    title: '#2e1a29',
    titleCut: '#fff2d6',
    stars: 0,
  },
  ink: {
    sky: ['#070b1b', '#0e1534', '#1b2250', '#3a2a5e', '#86405c'],
    sun: null,
    layers: [
      { color: '#1b2248', minH: 0.07, maxH: 0.2, minW: 44, maxW: 96, gap: 8, lit: 0.12, edge: 0.5 },
      { color: '#131a3b', minH: 0.1, maxH: 0.3, minW: 52, maxW: 110, gap: 10, lit: 0.22, edge: 0.8 },
      { color: '#0b1029', minH: 0.12, maxH: 0.4, minW: 78, maxW: 160, gap: 26, lit: 0.3, edge: 1.5 },
    ],
    window: '#ffd98a',
    shadow: 'rgba(0, 0, 8, 0.55)',
    ground: '#05071a',
    palm: '#03040d',
    title: '#f7f0e2',
    titleCut: '#d47589',
    stars: 44,
  },
};

function createRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function paintSky(g, scene) {
  const base = TITLE_H * HORIZON;
  const grad = g.createLinearGradient(0, 0, 0, base);
  scene.sky.forEach((color, i) => grad.addColorStop(i / (scene.sky.length - 1), color));
  g.fillStyle = grad;
  g.fillRect(0, 0, TITLE_W, TITLE_H);
}

function paintSun(g, scene) {
  const base = TITLE_H * HORIZON;
  const x = TITLE_W * 0.63;
  const r = TITLE_H * 0.15;
  const y = base - TITLE_H * 0.1;
  if (scene.sun) {
    const glow = g.createRadialGradient(x, y, r * 0.8, x, y, r * 3.6);
    glow.addColorStop(0, scene.sun.glow);
    glow.addColorStop(1, 'rgba(255, 233, 178, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, TITLE_W, TITLE_H);
    const disc = g.createRadialGradient(x, y, 0, x, y, r);
    disc.addColorStop(0, scene.sun.core);
    disc.addColorStop(1, scene.sun.rim);
    g.fillStyle = disc;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    return;
  }
  // Night: only the last of the evening light low at the horizon.
  const afterglow = g.createRadialGradient(x, base, 0, x, base, TITLE_W * 0.5);
  afterglow.addColorStop(0, 'rgba(212, 117, 137, 0.38)');
  afterglow.addColorStop(1, 'rgba(212, 117, 137, 0)');
  g.fillStyle = afterglow;
  g.fillRect(0, 0, TITLE_W, TITLE_H);
}

function paintStars(g, rand, count) {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * TITLE_W;
    const y = rand() * TITLE_H * 0.5;
    const r = 1.3 + rand() * 1.6;
    g.fillStyle = `rgba(255, 248, 230, ${0.5 + rand() * 0.5})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    if (i % 11 === 0) {
      g.strokeStyle = 'rgba(255, 248, 230, 0.55)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x - r * 4, y);
      g.lineTo(x + r * 4, y);
      g.moveTo(x, y - r * 4);
      g.lineTo(x, y + r * 4);
      g.stroke();
    }
  }
}

function paintWindows(g, rand, scene, layer, x, top, w, h) {
  if (layer.lit === 0) return;
  g.fillStyle = scene.window;
  for (let wy = top + 16; wy < top + h - 14; wy += 24) {
    for (let wx = x + 10; wx < x + w - 14; wx += 18) {
      if (rand() < layer.lit) g.fillRect(wx, wy, 7, 11);
    }
  }
}

// Buildings rise toward the left and right edges, so the city frames the title like a street canyon.
function paintLayer(g, rand, scene, layer) {
  const base = TITLE_H * HORIZON;
  const half = TITLE_W / 2;
  let x = -40 - rand() * 40;
  while (x < TITLE_W + 40) {
    const w = layer.minW + rand() * (layer.maxW - layer.minW);
    const away = Math.abs(x + w / 2 - half) / half;
    const rise = 1 + layer.edge * away ** 1.6;
    const h = TITLE_H * (layer.minH + rand() * (layer.maxH - layer.minH)) * rise;
    g.save();
    g.shadowColor = scene.shadow;
    g.shadowBlur = PAPER_CUT_BLUR;
    g.shadowOffsetY = 5;
    g.fillStyle = layer.color;
    g.fillRect(x, base - h, w, h + TITLE_H * 0.1);
    g.restore();
    paintWindows(g, rand, scene, layer, x, base - h, w, h);
    x += w + rand() * layer.gap;
  }
}

function paintFrond(g, top, angle, length) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tip = { x: top.x + dx * length, y: top.y + dy * length * 0.7 + length * 0.34 };
  const mid = { x: top.x + dx * length * 0.55, y: top.y + dy * length * 0.9 - length * 0.06 };
  const spread = length * 0.075;
  g.beginPath();
  g.moveTo(top.x, top.y);
  g.quadraticCurveTo(mid.x - dy * spread, mid.y + dx * spread, tip.x, tip.y);
  g.quadraticCurveTo(mid.x + dy * spread, mid.y - dx * spread, top.x, top.y);
  g.fill();
}

function paintPalm(g, scene, { x, lean, size }) {
  const base = TITLE_H;
  const top = { x: x + lean * size, y: base - size };
  const bend = { x: x + lean * size * 0.08, y: base - size * 0.55 };
  const [w0, w1, w2] = [size * 0.032, size * 0.024, size * 0.016];
  g.fillStyle = scene.palm;
  g.beginPath();
  g.moveTo(x - w0, base);
  g.quadraticCurveTo(bend.x - w1, bend.y, top.x - w2, top.y);
  g.lineTo(top.x + w2, top.y);
  g.quadraticCurveTo(bend.x + w1, bend.y, x + w0, base);
  g.closePath();
  g.fill();
  const fronds = 9;
  for (let i = 0; i < fronds; i += 1) {
    const angle = -Math.PI + ((i + 0.5) / fronds) * Math.PI;
    paintFrond(g, top, angle, size * (0.44 + 0.08 * Math.sin(i * 2.3)));
  }
}

function paintGround(g, scene) {
  const base = TITLE_H * HORIZON;
  g.fillStyle = scene.ground;
  g.fillRect(0, base, TITLE_W, TITLE_H - base);
  g.strokeStyle = 'rgba(247, 240, 226, 0.14)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(TITLE_W * 0.5, base);
  g.lineTo(TITLE_W * 0.16, TITLE_H);
  g.moveTo(TITLE_W * 0.5, base);
  g.lineTo(TITLE_W * 0.84, TITLE_H);
  g.stroke();
}

function paintTitle(g, scene) {
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `italic 400 ${TITLE_H * 0.2}px ${FONT_FAMILY}`;
  const x = TITLE_W / 2;
  const y = TITLE_H * 0.2;
  g.fillStyle = scene.titleCut;
  g.fillText(TITLE_TEXT, x + TITLE_H * 0.006, y + TITLE_H * 0.009);
  g.fillStyle = scene.title;
  g.fillText(TITLE_TEXT, x, y);
  g.restore();
}

/** Paints the whole screen into `canvas` for the given theme ('paper' or 'ink'). */
export function paintTitleScene(canvas, theme) {
  const scene = SCENES[theme] || SCENES.paper;
  const g = canvas.getContext('2d');
  const rand = createRandom(23);
  g.clearRect(0, 0, TITLE_W, TITLE_H);
  g.fillStyle = '#000';
  g.fillRect(0, 0, TITLE_W, TITLE_H);
  g.save();
  paintSky(g, scene);
  if (scene.stars) paintStars(g, rand, scene.stars);
  paintSun(g, scene);
  scene.layers.forEach((layer) => paintLayer(g, rand, scene, layer));
  paintGround(g, scene);
  [{ x: 0.1, lean: 0.14, size: 0.64 }, { x: 0.2, lean: -0.1, size: 0.4 }, { x: 0.91, lean: -0.16, size: 0.6 }]
    .forEach((p) => paintPalm(g, scene, { x: TITLE_W * p.x, lean: p.lean, size: TITLE_H * p.size }));
  paintTitle(g, scene);
  g.restore();
  return canvas;
}

/** The blinking prompt, on a transparent canvas. */
export function paintPrompt(canvas) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, PROMPT_W, PROMPT_H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `italic 400 ${PROMPT_H * 0.62}px ${FONT_FAMILY}`;
  g.fillStyle = 'rgba(5, 7, 26, 0.7)';
  g.fillText(PROMPT_TEXT, PROMPT_W / 2 + 4, PROMPT_H / 2 + 6);
  g.fillStyle = '#f7f0e2';
  g.fillText(PROMPT_TEXT, PROMPT_W / 2, PROMPT_H / 2);
  return canvas;
}
