/* Living portrait for the intro figure: the approved stand.webp on a PixiJS MeshPlane, gently alive.
   Hair sways (two layered sines, strongest at the tips, face rigid), the chest breathes (4.2 s), the
   coat skirt swings from the hips, and the eyes blink by showing a small eye-band patch (a Qwen
   edit of this same frame) for 110 ms. Nothing is redrawn, so the look is exactly the approved art.

   It is ambient, not scrubbed: wake() starts the ticker, release() stops it. If PixiJS fails to
   load, the plain <img> stays visible. Coordinates are stand.webp pixels (768x1024). */

import { isPaper } from '../timeline-utils.js';

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';
const W = 768;
const H = 1024;
const GRID_X = 48;
const GRID_Y = 64;
/* Head of the ChatGPT stand plate: the eyes sit at about (375, 121); FACE is the skin ellipse around them. */
const FACE = Object.freeze({ x: 376, y: 131, rx: 54, ry: 60 });
const HEM = 716;
const BREATH_S = 4.2;
const BREATH_PX = 1.6;
const BLINK_MS = 110;
const BLINK_GAP_MS = [2600, 5800];
const EYE_PATCH = Object.freeze({ x: 325, y: 94 }); /* top-left of stand-blink-eyes.webp (100x54), from chatgpt-9-blink.png */
const ALIVE_CLASS = 'hx-alive';
/* 2.5D camera: every vertex shifts by its depth (Depth Anything V2 map, near = white) against the
   focal plane, so a sideways camera move turns the figure slightly instead of sliding a flat card.
   Inputs: a slow arc across the intro's scroll, a faint handheld drift, and the pointer on desktop. */
const FOCUS_DEPTH = 0.55;
const PARALLAX_PX = Object.freeze({ x: 16, y: 7 });
const ARC = Object.freeze({ from: -0.35, to: 0.8 }); /* camera x across the intro scroll */
const INTRO_VH = 360; /* intro length in viewport heights (10 s x 36 vh, see config.js) */
/* Dust motes in the key light, at random depths: they ride the same camera parallax (near ones
   move more, and the nearest are large soft bokeh discs), so the move reads as a lens in a room. */
const MOTES = 46;
const MOTE_SEED = 7;

function loadDepth(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      resolve({ w: c.width, h: c.height, at: (x, y) => {
        const ix = Math.min(c.width - 1, Math.max(0, Math.round((x / W) * c.width)));
        const iy = Math.min(c.height - 1, Math.max(0, Math.round((y / H) * c.height)));
        return data[(iy * c.width + ix) * 4] / 255;
      } });
    };
    img.onerror = () => reject(new Error('depth map failed to load'));
    img.src = url;
  });
}

const smooth = (e0, e1, v) => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* Region weights from texture-space pixel coordinates. */
function weights(x, y) {
  const fd = ((x - FACE.x) / FACE.rx) ** 2 + ((y - FACE.y) / FACE.ry) ** 2;
  const inHairBox = x > 275 && x < 460 && y < 186;
  const hairTop = smooth(99, 36, y);
  const hairSide = smooth(0.85, 1.6, fd) * smooth(191, 131, y);
  const insideFace = fd < 1 && y > 91;
  const hair = inHairBox && !insideFace ? Math.max(hairTop, hairSide) : 0;
  const upper = smooth(620, 230, y);
  const coat = x > 240 && x < 530 ? smooth(430, HEM, y) ** 1.6 * smooth(HEM + 14, HEM, y) : 0;
  return { hair, upper, coat };
}

function moteTexture(Texture) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,244,230,1)');
  g.addColorStop(0.35, 'rgba(255,236,214,0.45)');
  g.addColorStop(1, 'rgba(255,230,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return Texture.from(c);
}

function buildMotes(Container, Sprite, Texture) {
  let seed = MOTE_SEED;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tex = moteTexture(Texture);
  const layer = new Container();
  const items = [];
  for (let i = 0; i < MOTES; i += 1) {
    const z = rnd();
    const sp = new Sprite(tex);
    sp.anchor.set(0.5);
    sp.blendMode = 'add';
    const bokeh = z > 0.9;
    const size = bokeh ? 30 + rnd() * 26 : 3 + z * 7;
    sp.width = sp.height = size;
    const alpha = bokeh ? 0.07 + rnd() * 0.05 : 0.18 + z * 0.35;
    items.push({ sp, z, x: rnd() * W, y: rnd() * H * 0.8, vx: (rnd() - 0.5) * 4, vy: -(2 + rnd() * 5), ph: rnd() * 6.28, alpha });
    layer.addChild(sp);
  }
  return {
    layer,
    paper: null,
    update(t, px, py) {
      /* Added light vanishes on paper: there the motes are faint warm dust, drawn normally. */
      const paper = isPaper();
      if (paper !== this.paper) {
        this.paper = paper;
        items.forEach((m) => {
          m.sp.blendMode = paper ? 'normal' : 'add';
          m.sp.tint = paper ? 0x9a7656 : 0xffffff;
        });
      }
      const fade = paper ? 0.55 : 1;
      items.forEach((m) => {
        const k = (m.z - FOCUS_DEPTH) * 2.2;
        const y = ((m.y + m.vy * t) % (H * 0.85) + H * 0.85) % (H * 0.85);
        m.sp.x = m.x + m.vx * t * 0.3 + Math.sin(t * 0.5 + m.ph) * 6 - k * px;
        m.sp.y = y - k * py;
        m.sp.alpha = m.alpha * fade * (0.6 + 0.4 * Math.sin(t * 0.9 + m.ph));
      });
    },
  };
}

export function createLiving(figure, img, imageUrl) {
  let app = null;
  let ready = null;
  let awake = false;

  async function build() {
    const PIXI = await import(PIXI_URL);
    const { Application, Assets, Container, MeshPlane, Sprite, Texture } = PIXI;
    const instance = new Application();
    await instance.init({
      resizeTo: figure, backgroundAlpha: 0, antialias: true, autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1), autoStart: false,
    });
    const canvas = instance.canvas;
    canvas.className = 'hx-living';
    canvas.setAttribute('aria-hidden', 'true');
    const [base, eyes, depthMap] = await Promise.all([
      Assets.load(imageUrl('stand')), Assets.load(imageUrl('stand-blink-eyes')),
      loadDepth(imageUrl('stand-depth')).catch(() => null),
    ]);
    const plane = new MeshPlane({ texture: base, verticesX: GRID_X, verticesY: GRID_Y });
    plane.autoResize = false;
    const lids = new Sprite(eyes);
    lids.position.set(EYE_PATCH.x, EYE_PATCH.y);
    lids.visible = false;
    const body = new Container();
    body.addChild(plane, lids);
    instance.stage.addChild(body);
    const motes = buildMotes(Container, Sprite, Texture);
    body.addChild(motes.layer);
    const nameEl = figure.closest('.hx-scene')?.querySelector('.hx-name');

    const { buffer } = plane.geometry.getAttribute('aPosition');
    const rest = new Float32Array(buffer.data);
    const n = rest.length / 2;
    const wHair = new Float32Array(n);
    const wUpper = new Float32Array(n);
    const wCoat = new Float32Array(n);
    const depth = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const w = weights(rest[i * 2], rest[i * 2 + 1]);
      wHair[i] = w.hair;
      wUpper[i] = w.upper;
      wCoat[i] = w.coat;
      depth[i] = depthMap ? depthMap.at(rest[i * 2], rest[i * 2 + 1]) - FOCUS_DEPTH : 0;
    }
    const lidDepth = depthMap ? depthMap.at(EYE_PATCH.x + 50, EYE_PATCH.y + 27) - FOCUS_DEPTH : 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      window.addEventListener('pointermove', (e) => {
        pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
        pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });
    }
    const lidUpper = weights(EYE_PATCH.x + 50, EYE_PATCH.y + 27).upper;

    const fit = () => body.scale.set(instance.screen.width / W, instance.screen.height / H);
    instance.renderer.on('resize', fit);
    fit();

    let nextBlink = performance.now() + 1800;
    let blinkUntil = 0;
    instance.ticker.add(() => {
      const now = performance.now();
      const t = now / 1000;
      const breath = ((Math.sin((t / BREATH_S) * Math.PI * 2) + 1) / 2) * BREATH_PX;
      const scrollP = Math.min(1, Math.max(0, window.scrollY / ((INTRO_VH / 100) * window.innerHeight)));
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      const ease = scrollP * scrollP * (3 - 2 * scrollP);
      const camX = ARC.from + (ARC.to - ARC.from) * ease + Math.sin(t * 0.31) * 0.12 + Math.sin(t * 0.83) * 0.05 + pointer.x * 0.35;
      const camY = Math.sin(t * 0.23 + 1.3) * 0.1 + pointer.y * 0.25 - ease * 0.3;
      const px = camX * PARALLAX_PX.x;
      const py = camY * PARALLAX_PX.y;
      const d = buffer.data;
      for (let i = 0; i < n; i += 1) {
        const x = rest[i * 2];
        const y = rest[i * 2 + 1];
        const h = wHair[i];
        d[i * 2] = x + h * (Math.sin(t * 1.1 + y * 0.03) * 2.4 + Math.sin(t * 2.6 + x * 0.06) * 0.9)
          + wCoat[i] * Math.sin(t * 0.85 + y * 0.012) * 3.2 - depth[i] * px;
        d[i * 2 + 1] = y + h * Math.sin(t * 1.7 + x * 0.045) * 1.3 - wUpper[i] * breath - depth[i] * py; /* no scroll-driven hair motion (Anand) */
      }
      buffer.update();
      motes.update(t, px, py);
      if (nameEl) nameEl.style.translate = `${(-camX * 10).toFixed(2)}px 0`; /* the name is far behind him */
      lids.x = EYE_PATCH.x - lidDepth * px;
      lids.y = EYE_PATCH.y - lidUpper * breath - lidDepth * py;
      if (now >= nextBlink) {
        lids.visible = true;
        blinkUntil = now + BLINK_MS;
        nextBlink = now + BLINK_GAP_MS[0] + Math.random() * (BLINK_GAP_MS[1] - BLINK_GAP_MS[0]);
      } else if (blinkUntil && now >= blinkUntil) {
        lids.visible = false;
        blinkUntil = 0;
      }
    });

    img.after(canvas);
    instance.render();
    figure.classList.add(ALIVE_CLASS);
    app = instance;
  }

  return {
    wake() {
      awake = true;
      if (!ready) {
        ready = build().catch((error) => {
          console.warn(`hero: living portrait unavailable (${error.message})`);
        });
      }
      ready.then(() => { if (awake && app) app.ticker.start(); });
    },
    release() {
      awake = false;
      if (app) app.ticker.stop();
    },
  };
}
