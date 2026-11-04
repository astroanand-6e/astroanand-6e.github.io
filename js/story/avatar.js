// Hero avatar: waves hello on load and when the cursor reaches him, leans with the pointer.
const WAVE_DELAY_MS = 1100;
const WAVE_HOLD_MS = 2400;
const REWAVE_COOLDOWN_MS = 6000;

const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function createWaver(el) {
  let timer = 0;
  let lastWave = -Infinity;
  return function wave() {
    const now = performance.now();
    if (now - lastWave < REWAVE_COOLDOWN_MS) return;
    lastWave = now;
    el.classList.add('is-waving');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('is-waving'), WAVE_HOLD_MS);
  };
}

function isInside(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function trackPointer(el, hero, wave) {
  let frame = 0;
  let point = null;
  const apply = () => {
    frame = 0;
    const rect = hero.getBoundingClientRect();
    el.style.setProperty('--px', ((point.x - rect.left) / rect.width - 0.5).toFixed(3));
    el.style.setProperty('--py', ((point.y - rect.top) / rect.height - 0.5).toFixed(3));
    if (isInside(el.getBoundingClientRect(), point.x, point.y)) wave();
  };
  hero.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    point = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(apply);
  });
  hero.addEventListener('pointerleave', () => {
    el.style.setProperty('--px', '0');
    el.style.setProperty('--py', '0');
  });
}

export function initAvatar() {
  const el = document.getElementById('avatar');
  const hero = document.getElementById('top');
  if (!el || !hero) return;
  if (prefersReduced()) {
    el.classList.add('is-waving');
    return;
  }
  const wave = createWaver(el);
  setTimeout(wave, WAVE_DELAY_MS);
  trackPointer(el, hero, wave);
}
