/**
 * Playback-position model. The audio graph only plays; *where we are* is
 * computed from the context clock with closed-form math, so getState() never
 * has to ask the audio thread anything.
 *
 * A transport is an immutable "segment": from time `t0` the deck is at `p0`
 * and moves at
 *
 *     rate(t) = base * (1 + bend * e^(-(t - t0) / tau))
 *
 * `bend` is a pitch bend (jog nudge) or a short glide after a tempo change;
 * it decays exponentially, which is exactly what AudioParam.setTargetAtTime
 * produces, so model and audio agree to the sample. Every change returns a new
 * segment; `prev` keeps the old one so queries just before a (slightly future)
 * change point still see the old motion.
 */
import { clamp, wrapIntoLoop } from './grid.js';

export const DEFAULT_TAU = 0.18;

export function createTransport({ duration, time = 0, position = 0 }) {
  return Object.freeze({
    t0: time, p0: clamp(position, 0, duration), playing: false, base: 1, bend: 0, tau: DEFAULT_TAU, loop: null, duration, prev: null,
  });
}

function pick(segment, time) {
  return time < segment.t0 && segment.prev ? pick(segment.prev, time) : segment;
}

/** Distance covered since t0 (before loop wrapping or clamping). */
function travelled(segment, time) {
  const dt = Math.max(0, time - segment.t0);
  return segment.base * (dt + segment.bend * segment.tau * (1 - Math.exp(-dt / segment.tau)));
}

export function positionAt(transport, time) {
  const s = pick(transport, time);
  if (!s.playing) return s.p0;
  const raw = s.p0 + travelled(s, time);
  return s.loop ? wrapIntoLoop(raw, s.loop) : Math.min(raw, s.duration);
}

/** Pitch-bend factor still active at `time` (0 when none or paused). */
export function bendAt(transport, time) {
  const s = pick(transport, time);
  return s.playing ? s.bend * Math.exp(-Math.max(0, time - s.t0) / s.tau) : 0;
}

export function rateAt(transport, time) {
  const s = pick(transport, time);
  return s.playing ? s.base * (1 + bendAt(s, time)) : 0;
}

/** True once a non-looping, playing segment has run into the end of the track. */
export function hasEnded(transport, time) {
  const s = pick(transport, time);
  return s.playing && !s.loop && s.p0 + travelled(s, time) >= s.duration;
}

/** Starts a fresh segment at `time` carrying the current position and bend. */
function advance(transport, time, changes) {
  const at = Math.max(time, transport.t0);
  return Object.freeze({
    ...transport,
    t0: at,
    p0: positionAt(transport, at),
    bend: bendAt(transport, at),
    prev: Object.freeze({ ...transport, prev: null }),
    ...changes,
  });
}

export const play = (transport, time) => advance(transport, time, { playing: true });
export const pause = (transport, time) => advance(transport, time, { playing: false, bend: 0 });

/** Jumps to `position` (clamped), keeping play state, rate and loop. */
export function seek(transport, time, position) {
  return advance(transport, time, { p0: clamp(position, 0, transport.duration) });
}

/** Sets the pitch bend to an absolute value that decays with `tau`. */
export const bendTo = (transport, time, bend, tau = DEFAULT_TAU) => advance(transport, time, { bend, tau });

/**
 * Moves to a new base rate without a pitch step: the instantaneous rate is
 * kept at the switch and glides to the new base over `tau`.
 */
export function glideRate(transport, time, base, tau) {
  const at = Math.max(time, transport.t0);
  const current = rateAt(transport, at) || transport.base;
  return advance(transport, at, { base, bend: current / base - 1, tau });
}

/** Engages (or with null clears) a loop; the position is pulled inside the loop. */
export function setLoop(transport, time, loop) {
  const at = Math.max(time, transport.t0);
  const p = positionAt(transport, at);
  const inside = loop ? wrapIntoLoop(Math.max(p, loop.start), loop) : p;
  return advance(transport, at, { loop, p0: inside });
}
