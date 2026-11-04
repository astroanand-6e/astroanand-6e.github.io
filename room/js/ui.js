// The thin HTML layer over the canvas: the one-line hint, the back button, the page veil and the
// visually hidden buttons that mirror every interactive object.
const FADE_MS = 340;
const HINT_DELAY_MS = 500;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createUi({ reducedMotion }) {
  const hint = document.getElementById('room-hint');
  const back = document.getElementById('room-back');
  const veil = document.getElementById('room-fade');
  const buttons = [...document.querySelectorAll('.room-controls button[data-target]')];
  let hintGone = false;

  function showHint() {
    if (!hint || hintGone) return;
    const touch = window.matchMedia('(hover: none)').matches;
    hint.textContent = `Drag to look around. ${touch ? 'Tap' : 'Click'} anything that glows.`;
    hint.hidden = false;
    setTimeout(() => hint.classList.add('is-in'), HINT_DELAY_MS);
  }

  function hideHint() {
    if (!hint || hintGone) return;
    hintGone = true;
    hint.classList.remove('is-in');
    hint.classList.add('is-gone');
    setTimeout(() => { hint.hidden = true; }, FADE_MS * 2);
  }

  function showBack(isShown, onClick) {
    if (!back) return;
    back.hidden = !isShown;
    back.onclick = isShown ? onClick : null;
    if (isShown) back.focus({ preventScroll: true });
  }

  /** Covers the page in `tone` ('paper' or 'screen'). Resolves once it is opaque. */
  async function cover(tone, { instant = false } = {}) {
    if (!veil) return;
    const isInstant = instant || reducedMotion;
    veil.dataset.tone = tone;
    veil.classList.toggle('is-instant', isInstant);
    veil.classList.add('is-on');
    await wait(isInstant ? 0 : FADE_MS);
  }

  function uncover({ instant = false } = {}) {
    if (!veil) return;
    veil.classList.toggle('is-instant', instant || reducedMotion);
    veil.classList.remove('is-on');
  }

  /** Mirrors focus and activation of the hidden buttons into the 3D scene. */
  function bindButtons({ onFocus, onBlur, onActivate }) {
    buttons.forEach((button) => {
      const id = button.dataset.target;
      button.addEventListener('focus', () => onFocus(id));
      button.addEventListener('blur', () => onBlur(id));
      button.addEventListener('click', () => onActivate(id));
    });
  }

  return { showHint, hideHint, showBack, cover, uncover, bindButtons, wait };
}
