/**
 * Jog wheel. Touching the platter scrubs (the track is held and the audio
 * follows the hand, forwards or backwards); turning it while playing nudges
 * the pitch up or down for as long as it moves, then it decays back.
 * A paused deck scrubs even without touch so the wheel never feels dead.
 */
import { clamp } from './grid.js';
import * as transport from './transport.js';

export const SCRUB_SECONDS_PER_TURN = 1.8;
export const NUDGE_BEND_PER_TURN_PER_SECOND = 0.1;
export const NUDGE_MAX_BEND = 0.16;
export const NUDGE_TAU = 0.15;
export const SCRUB_IDLE_SECONDS = 0.15;
const NUDGE_SMOOTHING = 0.6;
const SPEED_SMOOTHING = 0.5;
const MIN_EVENT_GAP = 0.004;
const MAX_EVENT_GAP = 0.1;
const STALE_GAP = 0.25;
const DEFAULT_GAP = 0.016;
const MAX_SCRUB_SPEED = 8;
const END_EPSILON = 0.02;

/** Smoothed wheel speed in turns per second (events arrive at uneven intervals). */
function wheelSpeed(deck, delta, now) {
  const last = deck.lastJog;
  const fresh = last !== null && now - last.time <= STALE_GAP;
  const gap = fresh ? clamp(now - last.time, MIN_EVENT_GAP, MAX_EVENT_GAP) : DEFAULT_GAP;
  const raw = delta / gap;
  const speed = fresh ? last.speed * (1 - SPEED_SMOOTHING) + raw * SPEED_SMOOTHING : raw;
  deck.lastJog = { time: now, speed };
  return speed;
}

export function beginScrub(deck, touching) {
  if (deck.preview) return;
  const time = deck.effectiveTime();
  const position = deck.positionAt(time);
  const resume = deck.isPlaying();
  deck.endRoll();
  if (resume) {
    deck.commit(transport.pause(deck.transport, time));
    deck.audio.stop(time);
  }
  deck.audio.scrubBegin({ time, position });
  deck.scrub = { touching, resume, position, lastEvent: deck.now() };
}

function moveScrub(deck, delta, now) {
  if (!deck.scrub) return;
  const speed = wheelSpeed(deck, delta, now) * SCRUB_SECONDS_PER_TURN;
  const limit = Math.max(0, deck.duration - END_EPSILON);
  const position = clamp(deck.scrub.position + delta * SCRUB_SECONDS_PER_TURN, 0, limit);
  deck.scrub = { ...deck.scrub, position, lastEvent: now };
  deck.commit(transport.seek(deck.transport, now, position)); // paused model: no lookahead needed
  deck.audio.scrubMove({ time: deck.effectiveTime(), position, velocity: clamp(speed, -MAX_SCRUB_SPEED, MAX_SCRUB_SPEED) });
}

export function endScrub(deck) {
  const { scrub } = deck;
  if (!scrub) return;
  const time = deck.effectiveTime();
  deck.scrub = null;
  deck.lastJog = null;
  deck.audio.scrubEnd(time);
  deck.dropLoopUnless(scrub.position);
  if (scrub.resume) deck.beginPlayback(scrub.position, time);
}

function nudge(deck, delta, now) {
  const target = clamp(wheelSpeed(deck, delta, now) * NUDGE_BEND_PER_TURN_PER_SECOND, -NUDGE_MAX_BEND, NUDGE_MAX_BEND);
  const time = deck.effectiveTime();
  const current = transport.bendAt(deck.transport, time);
  const bend = current + (target - current) * NUDGE_SMOOTHING;
  deck.commit(transport.bendTo(deck.transport, time, bend, NUDGE_TAU));
  deck.audio.setRate({ time, ...deck.rateSpec(time) });
}

/** Handles one jog event `{ delta, touch }` (delta in turns, + clockwise). */
export function jog(deck, { delta, touch }) {
  if (!deck.track) return;
  const now = deck.now();
  const moving = delta !== 0;
  if (touch) {
    if (!deck.scrub) beginScrub(deck, true);
    if (moving) moveScrub(deck, delta, now);
    return;
  }
  if (deck.scrub && deck.scrub.touching) {
    if (moving) moveScrub(deck, delta, now);
    endScrub(deck);
    return;
  }
  if (!moving) return;
  if (deck.isPlaying() && !deck.scrub) {
    nudge(deck, delta, now);
    return;
  }
  if (!deck.scrub) beginScrub(deck, false);
  moveScrub(deck, delta, now);
}

/** Ends an untouched (paused) scrub once the wheel has been still for a moment. */
export function idleScrubCheck(deck, time) {
  const { scrub } = deck;
  if (scrub && !scrub.touching && time - scrub.lastEvent > SCRUB_IDLE_SECONDS) endScrub(deck);
}
