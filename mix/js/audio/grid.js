/**
 * Beat-grid math. Pure functions only (no Web Audio) so every rule a DJ
 * relies on is unit-tested: beats <-> seconds, quantizing, phase wrap, sync,
 * loop halving/doubling, beat jumps.
 *
 * Every track has its first beat at 0 s and a steady tempo, so a beat is just
 * `seconds * bpm / 60` in the track's own time (independent of playback rate).
 */
import { BEATS_PER_BAR, PHRASE_BEATS, TEMPO_RANGE } from '../controls.js';

export const SECONDS_PER_MINUTE = 60;
/** A cue/hot-cue set within this distance of a beat snaps onto the beat. */
export const SNAP_WINDOW_SECONDS = 0.06;
export const AUTO_LOOP_BEATS = 4;
export const MIN_LOOP_BEATS = 1 / 16;
export const MAX_LOOP_BEATS = 64;
/** Beat sync may pull a deck this far from its own tempo (twice the fader range). */
export const SYNC_RATE_LIMIT = TEMPO_RANGE * 2;

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
/** Modulo that stays positive for negative inputs. */
export const mod = (x, n) => ((x % n) + n) % n;

export const secondsPerBeat = (bpm) => SECONDS_PER_MINUTE / bpm;
export const beatsToSeconds = (beats, bpm) => (beats * SECONDS_PER_MINUTE) / bpm;
export const secondsToBeats = (seconds, bpm) => (seconds * bpm) / SECONDS_PER_MINUTE;

/** 1-based bar number for a beat count since beat 0. */
export const barOf = (beat) => Math.floor(Math.max(0, beat) / BEATS_PER_BAR) + 1;
/** Position inside the 32-beat phrase, 0 <= x < 32 (fractional). */
export const phraseBeatOf = (beat) => mod(beat, PHRASE_BEATS);
/** Fractional part of a beat count: where in the beat we are, 0 <= x < 1. */
export const beatPhase = (beat) => mod(beat, 1);

/** Wraps a phase difference (in beats) into [-0.5, 0.5). */
export const wrapPhase = (x) => mod(x + 0.5, 1) - 0.5;

/** Phase offset of deck B relative to deck A in beats, wrapped to [-0.5, 0.5). */
export const phaseOffset = (beatA, beatB) => wrapPhase(beatPhase(beatB) - beatPhase(beatA));

export const quantizeBeat = (beat, division = 1) => Math.round(beat * division) / division;

/** Snaps `seconds` to the nearest beat when within `windowSeconds`, else leaves it. */
export function snapToBeat(seconds, bpm, windowSeconds = SNAP_WINDOW_SECONDS) {
  const nearest = beatsToSeconds(quantizeBeat(secondsToBeats(seconds, bpm)), bpm);
  return Math.abs(nearest - seconds) <= windowSeconds ? nearest : seconds;
}

/** Tempo fader (-1..1, +1 = faster) to playback rate. */
export const tempoToRate = (tempo) => 1 + clamp(tempo, -1, 1) * TEMPO_RANGE;
export const rateToTempo = (rate) => clamp((rate - 1) / TEMPO_RANGE, -1, 1);

/** Rate that makes a deck of `ownBpm` play at the leader's effective tempo. */
export function syncedRate(ownBpm, leaderEffectiveBpm) {
  return clamp(leaderEffectiveBpm / ownBpm, 1 - SYNC_RATE_LIMIT, 1 + SYNC_RATE_LIMIT);
}

/**
 * Position (seconds) the follower should jump to so its beats land on the
 * leader's. Moves by at most half a beat of the follower's own grid.
 */
export function alignedPosition(own, leader) {
  const ownBeat = secondsToBeats(own.position, own.bpm);
  const leaderBeat = secondsToBeats(leader.position, leader.bpm);
  const shift = wrapPhase(beatPhase(leaderBeat) - beatPhase(ownBeat));
  return Math.max(0, own.position + beatsToSeconds(shift, own.bpm));
}

const BEAT_PRECISION = 1e6;

/** Loop value object. `beats` is the nominal length (may be fractional), free of float noise. */
export const makeLoop = (start, end, bpm) => ({
  start, end, beats: Math.round(secondsToBeats(end - start, bpm) * BEAT_PRECISION) / BEAT_PRECISION,
});

/** Auto loop of `beats` beats starting on the beat nearest to `position`. */
export function autoLoop(position, bpm, beats = AUTO_LOOP_BEATS) {
  const start = beatsToSeconds(quantizeBeat(secondsToBeats(position, bpm)), bpm);
  return makeLoop(start, start + beatsToSeconds(beats, bpm), bpm);
}

/** Manual loop between two points, each snapped to the beat grid; at least MIN_LOOP_BEATS long. */
export function manualLoop(inSeconds, outSeconds, bpm) {
  const start = beatsToSeconds(quantizeBeat(secondsToBeats(inSeconds, bpm)), bpm);
  const snappedOut = beatsToSeconds(quantizeBeat(secondsToBeats(outSeconds, bpm)), bpm);
  const minEnd = start + beatsToSeconds(MIN_LOOP_BEATS, bpm);
  return makeLoop(start, Math.max(snappedOut, minEnd), bpm);
}

export function halveLoop(loop, bpm) {
  const length = loop.end - loop.start;
  if (secondsToBeats(length, bpm) / 2 < MIN_LOOP_BEATS) return loop;
  return makeLoop(loop.start, loop.start + length / 2, bpm);
}

export function doubleLoop(loop, bpm, duration) {
  const length = loop.end - loop.start;
  const doubled = loop.start + length * 2;
  if (secondsToBeats(length * 2, bpm) > MAX_LOOP_BEATS || doubled > duration) return loop;
  return makeLoop(loop.start, doubled, bpm);
}

export const shiftLoop = (loop, deltaSeconds, bpm) => makeLoop(loop.start + deltaSeconds, loop.end + deltaSeconds, bpm);

/** Folds a running position into the loop once it passes the end. */
export function wrapIntoLoop(position, loop) {
  if (!loop || position < loop.start) return position;
  return loop.start + mod(position - loop.start, loop.end - loop.start);
}

export const isInsideLoop = (position, loop) => Boolean(loop) && position >= loop.start && position < loop.end;

export const beatJumpTarget = (position, beats, bpm, duration) => clamp(position + beatsToSeconds(beats, bpm), 0, duration);
