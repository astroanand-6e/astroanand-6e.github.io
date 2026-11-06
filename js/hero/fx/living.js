/* Living portrait for the intro figure: the approved stand.webp on a PixiJS MeshPlane, gently alive.
   Hair sways (two layered sines, strongest at the tips, face rigid), the chest breathes (4.2 s), the
   coat skirt swings from the hips, and the eyes blink by showing a small eye-band patch (a Qwen
   edit of this same frame) for 110 ms. Nothing is redrawn, so the look is exactly the approved art.

   It is ambient, not scrubbed: wake() starts the ticker, release() stops it. If PixiJS fails to
   load, the plain <img> stays visible. Coordinates are stand.webp pixels (768x1024). */

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';
const W = 768;
const H = 1024;
const GRID_X = 48;
const GRID_Y = 64;
const FACE = Object.freeze({ x: 370, y: 150, rx: 54, ry: 60 });
const HEM = 716;
const BREATH_S = 4.2;
const BREATH_PX = 1.6;
const BLINK_MS = 110;
const BLINK_GAP_MS = [2600, 5800];
const EYE_PATCH = Object.freeze({ x: 322, y: 114 });
const ALIVE_CLASS = 'hx-alive';

const smooth = (e0, e1, v) => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* Region weights from texture-space pixel coordinates. */
function weights(x, y) {
  const fd = ((x - FACE.x) / FACE.rx) ** 2 + ((y - FACE.y) / FACE.ry) ** 2;
  const inHairBox = x > 270 && x < 455 && y < 205;
  const hairTop = smooth(118, 55, y);
  const hairSide = smooth(0.85, 1.6, fd) * smooth(210, 150, y);
  const insideFace = fd < 1 && y > 110;
  const hair = inHairBox && !insideFace ? Math.max(hairTop, hairSide) : 0;
  const upper = smooth(620, 230, y);
  const coat = x > 240 && x < 530 ? smooth(430, HEM, y) ** 1.6 * smooth(HEM + 14, HEM, y) : 0;
  return { hair, upper, coat };
}

export function createLiving(figure, img, imagePath) {
  let app = null;
  let ready = null;
  let awake = false;

  async function build() {
    const PIXI = await import(PIXI_URL);
    const { Application, Assets, Container, MeshPlane, Sprite } = PIXI;
    const instance = new Application();
    await instance.init({
      resizeTo: figure, backgroundAlpha: 0, antialias: true, autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1), autoStart: false,
    });
    const canvas = instance.canvas;
    canvas.className = 'hx-living';
    canvas.setAttribute('aria-hidden', 'true');
    const [base, eyes] = await Promise.all([
      Assets.load(`${imagePath}stand.webp`), Assets.load(`${imagePath}stand-blink-eyes.webp`),
    ]);
    const plane = new MeshPlane({ texture: base, verticesX: GRID_X, verticesY: GRID_Y });
    plane.autoResize = false;
    const lids = new Sprite(eyes);
    lids.position.set(EYE_PATCH.x, EYE_PATCH.y);
    lids.visible = false;
    const body = new Container();
    body.addChild(plane, lids);
    instance.stage.addChild(body);

    const { buffer } = plane.geometry.getAttribute('aPosition');
    const rest = new Float32Array(buffer.data);
    const n = rest.length / 2;
    const wHair = new Float32Array(n);
    const wUpper = new Float32Array(n);
    const wCoat = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const w = weights(rest[i * 2], rest[i * 2 + 1]);
      wHair[i] = w.hair;
      wUpper[i] = w.upper;
      wCoat[i] = w.coat;
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
      const d = buffer.data;
      for (let i = 0; i < n; i += 1) {
        const x = rest[i * 2];
        const y = rest[i * 2 + 1];
        const h = wHair[i];
        d[i * 2] = x + h * (Math.sin(t * 1.1 + y * 0.03) * 2.4 + Math.sin(t * 2.6 + x * 0.06) * 0.9)
          + wCoat[i] * Math.sin(t * 0.85 + y * 0.012) * 3.2;
        d[i * 2 + 1] = y + h * Math.sin(t * 1.7 + x * 0.045) * 1.3 - wUpper[i] * breath;
      }
      buffer.update();
      lids.y = EYE_PATCH.y - lidUpper * breath;
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
