/**
 * requestAnimationFrame loop that sleeps while the tab is hidden or the target is off
 * screen. callback(nowMs, dtMs) with dt capped so a long pause does not jump. One frame is
 * drawn straight away so the first paint never waits for a frame callback.
 */
const MAX_DT_MS = 100;
const FIRST_DT_MS = 16;

export function createLoop(callback, target = null) {
  let frame = 0;
  let last = 0;
  let onScreen = true;
  let stopped = false;

  const step = (now) => {
    frame = requestAnimationFrame(step);
    const dt = last ? Math.min(MAX_DT_MS, now - last) : FIRST_DT_MS;
    last = now;
    callback(now, dt);
  };
  const run = () => {
    if (frame || stopped || document.hidden || !onScreen) return;
    last = 0;
    frame = requestAnimationFrame(step);
  };
  const halt = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const onVisibility = () => (document.hidden ? halt() : run());
  const observer = target && 'IntersectionObserver' in window
    ? new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) run();
      else halt();
    })
    : null;

  document.addEventListener('visibilitychange', onVisibility);
  observer?.observe(target);
  callback(performance.now(), FIRST_DT_MS);
  run();
  return {
    stop() {
      stopped = true;
      halt();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
