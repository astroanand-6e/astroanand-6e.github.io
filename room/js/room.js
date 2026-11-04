// Boot. Chrome and the theme come up first; three.js is imported only after first paint.
import { initTheme } from '../../js/theme.js';
import { ROUTES } from './routes.js';

const NO_WEBGL_CLASS = 'no-webgl';
const root = document.documentElement;

/** HTML hrefs are no-JS defaults; routes.js is the source of truth. */
function applyRoutes() {
  document.querySelectorAll('[data-route]').forEach((link) => {
    const href = ROUTES[link.dataset.route];
    if (href) link.setAttribute('href', href);
  });
}

function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch (error) {
    return false;
  }
}

function showFallback(reason) {
  root.classList.add(NO_WEBGL_CLASS);
  const panel = document.getElementById('room-fallback');
  if (panel) panel.hidden = false;
  const message = String(reason && reason.message ? reason.message : reason);
  window.dispatchEvent(new CustomEvent('room-error', { detail: { message } }));
}

function afterFirstPaint(task) {
  requestAnimationFrame(() => requestAnimationFrame(task));
}

async function boot() {
  const canvas = document.getElementById('room');
  if (!canvas) return showFallback('missing canvas');
  if (!hasWebGL()) return showFallback('webgl unavailable');
  try {
    const app = await import('./app.js');
    await app.start({ canvas });
  } catch (error) {
    showFallback(error);
  }
  return undefined;
}

applyRoutes();
initTheme();
afterFirstPaint(boot);
