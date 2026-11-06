/* One camera for the whole hero, so the five scenes read as a single continuous shot.
   - Handheld: slow layered sines (a few px, a fraction of a degree), never still, never shaky.
   - Inertia: the camera trails the scroll like a dolly on a spring. When the visitor scrolls, the
     frame lags a little and tilts into the move, then settles past rest (follow-through).
   - Depth: everything in a scene moves with the camera (`translate`/`rotate` on .hx-scene), and the
     figures move a bit more on top (they are nearer), so the backgrounds parallax behind them.
   Uses the individual `translate`/`rotate` properties, which compose with the transforms GSAP
   animates. Runs only while the hero is pinned. */

const STIFFNESS = 0.06; /* spring toward the scroll velocity */
const DAMPING = 0.84;
const LAG_PX = 0.035; /* px of camera lag per px/frame of scroll speed */
const LAG_MAX = 26;
const TILT_DEG = 0.012; /* degrees of tilt per px of lag */
const NEAR = 1.6; /* figures move this much more than their scene */
const OVERSCAN = 1.035; /* scenes are scaled up a touch so the moving frame never shows an edge */

/* Shared with the living portrait, so hair and coat drag behind camera moves (follow-through). */
export const cameraState = { lag: 0, lagV: 0 };

export function createCamera(host) {
  const scenes = [...host.querySelectorAll('[data-hx-scene]')];
  const figures = [...host.querySelectorAll('[data-hx-scene] > .hx-figure')];
  /* Only scenes with a full-bleed plate need overscan; text-led scenes keep their exact layout. */
  const bleed = new Set(scenes.filter((el) => el.querySelector('.hx-sky, .hx-burn, .hx-portal, .hx-desk-plate')));
  let raf = 0;
  let lastY = window.scrollY;
  let vel = 0;
  let lag = 0;
  let lagV = 0;

  function frame(now) {
    const t = now / 1000;
    const y = window.scrollY;
    const dy = y - lastY;
    lastY = y;
    vel += (dy - vel) * 0.25;
    const target = Math.max(-LAG_MAX, Math.min(LAG_MAX, vel * LAG_PX * 10));
    lagV = (lagV + (target - lag) * STIFFNESS) * DAMPING;
    lag += lagV;
    cameraState.lag = lag;
    cameraState.lagV = lagV;
    const hx = Math.sin(t * 0.37) * 2.2 + Math.sin(t * 0.91 + 1.7) * 0.9;
    const hy = Math.sin(t * 0.29 + 0.6) * 1.8 + Math.sin(t * 1.13) * 0.6;
    const rot = Math.sin(t * 0.21 + 2.1) * 0.08 + lag * TILT_DEG;
    const sx = hx;
    const sy = hy + lag;
    scenes.forEach((el) => {
      el.style.translate = `${sx.toFixed(2)}px ${sy.toFixed(2)}px`;
      el.style.rotate = `${rot.toFixed(3)}deg`;
      if (bleed.has(el)) el.style.scale = String(OVERSCAN);
    });
    figures.forEach((el) => {
      el.style.translate = `${(sx * (NEAR - 1)).toFixed(2)}px ${(sy * (NEAR - 1)).toFixed(2)}px`;
    });
    raf = requestAnimationFrame(frame);
  }

  return {
    start() { if (!raf) { lastY = window.scrollY; raf = requestAnimationFrame(frame); } },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
