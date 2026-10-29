const MAX_DPR = 2;
const LOW_DPR = 1.25;
const SLOW_FRAME_MS = 22;
const FRAME_WINDOW = 45;

/**
 * Pixel-ratio governor: DPR is capped at 2 and steps down once to 1.25 if the
 * average frame over a window runs long. onChange(dpr) applies the new ratio.
 */
export function createDprGovernor(onChange) {
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let sum = 0;
  let count = 0;
  let isLow = false;

  return {
    dpr: () => dpr,
    track(ms) {
      sum += ms;
      count += 1;
      if (count < FRAME_WINDOW) return;
      if (!isLow && dpr > LOW_DPR && sum / count > SLOW_FRAME_MS) {
        isLow = true;
        dpr = LOW_DPR;
        onChange(dpr);
      }
      sum = 0;
      count = 0;
    },
  };
}
