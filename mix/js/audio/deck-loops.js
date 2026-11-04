/**
 * Loop controls for a deck: manual in/out, 4-beat auto loop / exit, half and
 * double. In/out points snap to the beat grid, and the loop length is snapped
 * to whole samples so the model and the loop buffer never drift apart.
 */
import {
  AUTO_LOOP_BEATS, autoLoop, beatsToSeconds, doubleLoop, halveLoop, manualLoop, quantizeBeat, secondsToBeats,
} from './grid.js';
import { snapLoopToSamples } from './loops.js';
import * as transport from './transport.js';

/** Starts looping `loop` (grid-aligned, any length); the playhead is pulled inside it. */
export function engageLoop(deck, loop) {
  const { loop: snapped } = snapLoopToSamples(loop, deck.sampleRate, deck.bpm);
  const time = deck.effectiveTime();
  deck.loop = snapped;
  deck.commit(transport.setLoop(deck.transport, time, snapped));
  if (deck.isPlaying()) deck.restartAudio(time);
  deck.emit('loop', {
    active: true, start: snapped.start, end: snapped.end, beats: snapped.beats,
  });
}

const nearestBeatSeconds = (seconds, bpm) => beatsToSeconds(quantizeBeat(secondsToBeats(seconds, bpm)), bpm);

export function loopIn(deck) {
  if (!deck.track) return;
  deck.pendingLoopIn = nearestBeatSeconds(deck.positionAt(deck.now()), deck.bpm);
}

export function loopOut(deck) {
  if (!deck.track || deck.pendingLoopIn === null) return;
  const out = deck.positionAt(deck.effectiveTime());
  engageLoop(deck, manualLoop(deck.pendingLoopIn, out, deck.bpm));
  deck.pendingLoopIn = null;
}

/** "4 BEAT / EXIT": exits an active loop, otherwise starts a 4-beat loop here. */
export function loopExit(deck) {
  if (!deck.track) return;
  if (deck.loop) {
    deck.clearLoop();
    return;
  }
  deck.pendingLoopIn = null;
  engageLoop(deck, autoLoop(deck.positionAt(deck.effectiveTime()), deck.bpm, AUTO_LOOP_BEATS));
}

export function loopHalf(deck) {
  if (!deck.loop) return;
  const next = halveLoop(deck.loop, deck.bpm);
  if (next !== deck.loop) engageLoop(deck, next);
}

export function loopDouble(deck) {
  if (!deck.loop) return;
  const next = doubleLoop(deck.loop, deck.bpm, deck.duration);
  if (next !== deck.loop) engageLoop(deck, next);
}
