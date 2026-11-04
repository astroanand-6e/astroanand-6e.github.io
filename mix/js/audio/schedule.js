/**
 * Cooperative scheduling helpers: run a long generator in short slices so a
 * multi-hundred-millisecond synthesis never freezes the page.
 */

export const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function yieldToMain(delayMs = 0) {
  if (delayMs === 0 && typeof globalThis.scheduler?.yield === 'function') return globalThis.scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Drives `generator` to completion, yielding to the event loop whenever a
 * slice has used `sliceMs`. `idleMs` adds a pause between slices (background work).
 * Resolves with the generator's return value.
 */
export async function runSliced(generator, { sliceMs = 8, idleMs = 0 } = {}) {
  let sliceStart = nowMs();
  let step = generator.next();
  while (!step.done) {
    if (nowMs() - sliceStart >= sliceMs) {
      await yieldToMain(idleMs);
      sliceStart = nowMs();
    }
    step = generator.next();
  }
  return step.value;
}
