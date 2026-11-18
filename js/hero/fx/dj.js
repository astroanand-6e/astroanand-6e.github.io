/* The music beat: him on the decks (ChatGPT frame dj.webp, 1184x888), alive on a 124 BPM clock.
   One PixiJS MeshPlane carries the art; vertices move by painted weights:
   - head + headphone hand: a nod on every beat (quick drop, slow rise; the "pop" of a DJ nod),
     pivoting at the neck so the head rotates a little rather than sliding
   - right hand: a small back-and-forth scratch on the jog wheel, on eighth notes
   - shoulders: half of the nod, a beat late (overlapping action)
   - 2.5D camera: the depth map (Depth Anything V2) against a slow handheld drift
   On top, additive club lights pulse with the beat (teal on the downbeat, red on the offbeat), a
   beam sweeps through the haze, and the jog wheel's rim glows. Ambient (wall clock), not scrubbed:
   wake() starts it, release() stops it. Dark plate in both themes; it is a club. */
import { clamp01 } from '../timeline-utils.js';

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';
const W = 1184;
const H = 888;
const BPM = 124;
const HEAD = Object.freeze({ x: 600, y: 150, r: 150 });
const NECK = Object.freeze({ x: 635, y: 300 });
const EAR_HAND = Object.freeze({ x: 760, y: 215, r: 85 }); /* his right hand on the headphone cup */
const HAND = Object.freeze({ x: 295, y: 705, r: 95 }); /* left hand on the left jog wheel */
const HANDS_SPAN = Object.freeze([200, 820]); /* x of his left hand on the jog wheel .. his right hand at the ear */
const HANDS_MARGIN = 30;
const MIN_SLICE = 740; /* plate px of height a landscape frame shows at least */
const FOCUS_Y = 452; /* plate y that stays at the middle of a landscape frame */
const SHOULDERS = Object.freeze({ y0: 300, y1: 560 });
const LIGHTS = Object.freeze([
  { x: 205, y: 245, color: 0x19e6d2, size: 520, beat: 0 }, /* teal haze under the left spotlight */
  { x: 965, y: 150, color: 0xff2a1f, size: 480, beat: 0.5 }, /* red haze under the right spotlight */
  { x: 912, y: 846, color: 0x19e6d2, size: 260, beat: 0.25 }, /* the cyan pads on the right deck */
]);
const JOG = Object.freeze({ x: 283, y: 782, rx: 139, ry: 22 }); /* lit rim of the left platter */
/* The painted spotlights' sources, at the top corners of the plate: the sweeping beams start here. */
const BEAM_SOURCES = Object.freeze([{ x: 123, y: 0 }, { x: 1120, y: 0 }]);
const NOD_PX = 0; /* no bouncing (Anand) */
const NOD_DEG = 0;
const SCRATCH_PX = 5;
const DEPTH_PX = 0;
const FOCUS = 0.5;

const gauss = (dx, dy, r) => Math.exp(-(dx * dx + dy * dy) / (2 * r * r));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/* Nod shape over one beat (0..1): fast drop right after the beat, slow ease back up. */
function nod(phase) {
  return phase < 0.18 ? Math.sin((phase / 0.18) * Math.PI * 0.5) : Math.cos(((phase - 0.18) / 0.82) * Math.PI * 0.5) ** 2;
}

function loadDepth(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      resolve((x, y) => {
        const ix = Math.min(c.width - 1, Math.max(0, Math.round((x / W) * c.width)));
        const iy = Math.min(c.height - 1, Math.max(0, Math.round((y / H) * c.height)));
        return data[(iy * c.width + ix) * 4] / 255;
      });
    };
    img.onerror = () => resolve(() => FOCUS);
    img.src = url;
  });
}

function glowTexture(Texture, soft = 0.55) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(soft * 0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}

function beamTexture(Texture) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 512);
  const fade = ctx.createLinearGradient(0, 0, 0, 512);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 64, 512);
  return Texture.from(c);
}

export function createDJ(host, imageUrl) {
  let app = null;
  let ready = null;
  let awake = false;

  async function build() {
    const { Application, Assets, Container, MeshPlane, Sprite, Texture, Graphics } = await import(PIXI_URL);
    const instance = new Application();
    await instance.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1), autoStart: false });
    const canvas = instance.canvas;
    canvas.className = 'hx-dj-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const [tex, depthAt] = await Promise.all([Assets.load(imageUrl('dj')), loadDepth(imageUrl('dj-depth'))]);
    const plane = new MeshPlane({ texture: tex, verticesX: 48, verticesY: 36 });
    plane.autoResize = false;
    const world = new Container();
    const lights = new Container();
    world.addChild(plane, lights);
    instance.stage.addChild(world);

    const glow = glowTexture(Texture);
    const lamps = LIGHTS.map((l) => {
      const s = new Sprite(glow);
      s.anchor.set(0.5);
      s.position.set(l.x, l.y);
      s.width = s.height = l.size;
      s.tint = l.color;
      s.blendMode = 'add';
      lights.addChild(s);
      return { s, l };
    });
    const beams = [0, 1].map((i) => {
      const b = new Sprite(beamTexture(Texture));
      b.anchor.set(0.5, 0);
      b.position.set(BEAM_SOURCES[i].x, BEAM_SOURCES[i].y);
      b.width = 150;
      b.height = 700;
      b.tint = i ? 0xff3b30 : 0x19e6d2;
      b.blendMode = 'add';
      lights.addChild(b);
      return b;
    });
    const rim = new Graphics();
    rim.blendMode = 'add';
    lights.addChild(rim);

    const { buffer } = plane.geometry.getAttribute('aPosition');
    const rest = new Float32Array(buffer.data);
    const n = rest.length / 2;
    const wHead = new Float32Array(n);
    const wHand = new Float32Array(n);
    const wBody = new Float32Array(n);
    const depth = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const x = rest[i * 2];
      const y = rest[i * 2 + 1];
      const deck = smooth(745, 725, y); /* the controller and table never move */
      wHead[i] = Math.max(gauss(x - HEAD.x, y - HEAD.y, HEAD.r * 0.62), gauss(x - EAR_HAND.x, y - EAR_HAND.y, EAR_HAND.r * 0.6)) * deck;
      wHand[i] = gauss(x - HAND.x, y - HAND.y, HAND.r * 0.55) * smooth(768, 738, y);
      wBody[i] = smooth(SHOULDERS.y1, SHOULDERS.y0, y) * smooth(150, 300, y) * (x > 250 && x < 1000 ? 1 : 0) * deck;
      depth[i] = depthAt(x, y) - FOCUS;
    }

    const fit = () => {
      const sw = instance.screen.width;
      const sh = instance.screen.height;
      if (sw / sh >= 1) {
        /* Cover, but never zoom past MIN_SLICE plate-px of height: on 16:9 that leaves a strip of black at
           each side, which the plate's edges melt into (mask below) so the controller stays in frame. */
        const s = Math.min(Math.max(sw / W, sh / H), sh / MIN_SLICE);
        world.scale.set(s);
        /* A 16:10 or 16:9 screen shows only 75-85% of this 4:3 plate's height, so choose the slice: it is
           centred on FOCUS_Y (his face through to his fingertips on the platter, y 100-780), so a wide
           screen trims the hair crown and the controller's lower edge rather than his face or hands.
           handoff.js then holds this stage at `scale: 1.05` about the frame centre, which only trims a
           little more from each end of that slice. Clamped so the plate always covers the frame. */
        const top = Math.min(Math.max(0, FOCUS_Y - sh / s / 2), Math.max(0, H - sh / s));
        const left = (sw - W * s) / 2;
        world.position.set(left, -top * s);
        const edge = left > 1 ? `linear-gradient(to right, transparent ${left}px, #000 ${left + 90}px, #000 ${left + W * s - 90}px, transparent ${left + W * s}px)` : '';
        canvas.style.maskImage = canvas.style.webkitMaskImage = edge;
      } else {
        /* Portrait: frame both hands, the left one on the jog wheel and the right one on the
           headphones (HANDS_SPAN), with his head and the decks inside the top 3/4 of the frame. The
           scale is the smaller of "decks fill 74% of the height" and "both hands fit the width". */
        const s = Math.min((sh * 0.74) / H, sw / (HANDS_SPAN[1] - HANDS_SPAN[0] + 2 * HANDS_MARGIN));
        world.scale.set(s);
        const mid = (HANDS_SPAN[0] + HANDS_SPAN[1]) / 2;
        const x = Math.min(0, Math.max(sw - W * s, sw / 2 - mid * s));
        world.position.set(x, 0);
        /* The controller is cut off at the plate's bottom edge: melt it into the black below. */
        const fade = `linear-gradient(#000 ${Math.max(0, H * s - 70)}px, transparent ${H * s}px)`;
        canvas.style.maskImage = canvas.style.webkitMaskImage = fade;
      }
    };
    instance.renderer.on('resize', fit);
    fit();

    const t0 = performance.now();
    instance.ticker.add(() => {
      const t = (performance.now() - t0) / 1000;
      const beats = t * (BPM / 60);
      const phase = beats % 1;
      const late = (beats - 0.12) % 1;
      const n1 = nod(phase);
      const n2 = nod((late + 1) % 1);
      const scratch = Math.sin(beats * Math.PI * 2 * 2) * (phase < 0.5 ? 1 : 0.4);
      const camX = Math.sin(t * 0.33) * 0.6 + Math.sin(t * 0.91 + 1.2) * 0.2;
      const camY = Math.sin(t * 0.27 + 0.4) * 0.4;
      const rot = (NOD_DEG * Math.PI) / 180 * n1;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      const d = buffer.data;
      for (let i = 0; i < n; i += 1) {
        const x = rest[i * 2];
        const y = rest[i * 2 + 1];
        /* head: rotate about the neck, then drop */
        const hx = NECK.x + (x - NECK.x) * cr - (y - NECK.y) * sr;
        const hy = NECK.y + (x - NECK.x) * sr + (y - NECK.y) * cr + NOD_PX * n1;
        const wh = wHead[i];
        let px = x + (hx - x) * wh;
        let py = y + (hy - y) * wh + wBody[i] * (1 - wh) * NOD_PX * 0.35 * n2;
        px += wHand[i] * scratch * SCRATCH_PX;
        py += wHand[i] * Math.abs(scratch) * 1.2;
        px -= depth[i] * camX * DEPTH_PX;
        py -= depth[i] * camY * DEPTH_PX * 0.5;
        d[i * 2] = px;
        d[i * 2 + 1] = py;
      }
      buffer.update();
      lamps.forEach(({ s, l }) => {
        const p = (beats + l.beat) % 1;
        s.alpha = 0.18 + 0.42 * Math.exp(-p * 6);
      });
      beams.forEach((b, i) => {
        b.rotation = (i ? 1 : -1) * (0.5 + Math.sin(t * 0.6 + i * 2) * 0.1); /* lies along the painted beams */
        b.alpha = 0.06 + 0.07 * Math.exp(-(((beats + i * 0.5) % 1) * 5));
      });
      rim.clear();
      rim.ellipse(JOG.x, JOG.y, JOG.rx, JOG.ry).stroke({ width: 3, color: 0x19e6d2, alpha: 0.25 + 0.5 * Math.exp(-phase * 7) });
    });

    host.append(canvas);
    instance.render();
    host.classList.add('hx-dj-alive');
    app = instance;
  }

  return {
    wake() {
      awake = true;
      if (!ready) ready = build().catch((e) => console.warn(`hero: DJ scene unavailable (${e.message})`));
      ready.then(() => { if (awake && app) app.ticker.start(); });
    },
    release() {
      awake = false;
      if (app) app.ticker.stop();
    },
  };
}
