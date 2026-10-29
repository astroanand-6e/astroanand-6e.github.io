const STICK_DEADZONE = 0.18;
const BUTTON_BREAK = 0;
const BUTTON_DPAD_UP = 12;
const BUTTON_DPAD_DOWN = 13;
const SCROLL_FRACTION = 0.85;

/**
 * Gamepad easter egg. Left stick turns the model, button 0 toggles break,
 * D-pad up/down scrolls one chapter. Call poll(dt) every frame; it returns
 * the stick's horizontal axis in [-1, 1] (0 when no pad is connected).
 */
export function createGamepadInput({ isReducedMotion }) {
  const pressed = new Set();

  function edge(pad, index) {
    const button = pad.buttons[index];
    const isDown = Boolean(button && button.pressed);
    const wasDown = pressed.has(index);
    if (isDown) pressed.add(index);
    else pressed.delete(index);
    return isDown && !wasDown;
  }

  function scrollChapter(direction) {
    window.scrollBy({
      top: direction * window.innerHeight * SCROLL_FRACTION,
      behavior: isReducedMotion() ? 'auto' : 'smooth',
    });
  }

  function poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find(Boolean);
    if (!pad) return 0;
    if (edge(pad, BUTTON_BREAK)) {
      window.dispatchEvent(new CustomEvent('break', { detail: { source: 'gamepad' } }));
    }
    if (edge(pad, BUTTON_DPAD_UP)) scrollChapter(-1);
    if (edge(pad, BUTTON_DPAD_DOWN)) scrollChapter(1);
    const x = pad.axes[0] || 0;
    return Math.abs(x) < STICK_DEADZONE ? 0 : x;
  }

  return { poll };
}
