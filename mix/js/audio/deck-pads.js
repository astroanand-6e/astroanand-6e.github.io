/**
 * The eight performance pads. What a pad does depends on the pad mode:
 *   hotcue    set / jump (SHIFT clears); paused jumps preview while held
 *   beatjump  -1/+1, -2/+2, -4/+4, -8/+8 beats
 *   sampler   one-shot sounds (clap, snare roll, riser, downlifter, stab)
 *   padfx     beat-repeat roll of 1/2, 1/4, 1/8, 1/16 beat while held
 * The mapping repeats on pads 5-8 where a mode has fewer than eight actions.
 */
import { PAD_COUNT } from '../controls.js';
import { beatJumpTarget, beatsToSeconds, clamp, shiftLoop, snapToBeat } from './grid.js';
import { engageLoop } from './deck-loops.js';

export const BEAT_JUMP_BEATS = Object.freeze([-1, 1, -2, 2, -4, 4, -8, 8]);
export const ROLL_BEATS = Object.freeze([1 / 2, 1 / 4, 1 / 8, 1 / 16]);
export const SAMPLER_SOUNDS = Object.freeze(['clap', 'snareRoll', 'riser', 'downlifter', 'stab']);

export const PAD_LABELS = Object.freeze({
  hotcue: Object.freeze(Array.from({ length: PAD_COUNT }, (_, i) => `Cue ${i + 1}`)),
  beatjump: Object.freeze(BEAT_JUMP_BEATS.map((b) => (b > 0 ? `+${b}` : `${b}`))),
  sampler: Object.freeze(Array.from({ length: PAD_COUNT }, (_, i) => SAMPLER_SOUNDS[i % SAMPLER_SOUNDS.length])),
  padfx: Object.freeze(Array.from({ length: PAD_COUNT }, (_, i) => `1/${1 / ROLL_BEATS[i % ROLL_BEATS.length]}`)),
});

function hotCueDown(deck, index) {
  if (deck.shift) {
    if (deck.hotCues[index] === null) return;
    deck.hotCues[index] = null;
    deck.emit('hotcue-clear', { index });
    return;
  }
  const point = deck.hotCues[index];
  if (point === null) {
    const position = snapToBeat(deck.positionAt(deck.now()), deck.bpm);
    deck.hotCues[index] = position;
    deck.emit('hotcue-set', { index, position });
    return;
  }
  if (deck.isPlaying()) deck.jumpTo(point);
  else deck.startPreview('pad', point, index);
  deck.emit('hotcue-jump', { index, position: point });
}

function hotCueUp(deck, index) {
  const { preview } = deck;
  if (preview && preview.kind === 'pad' && preview.index === index) deck.endPreview();
}

/** Jumps by `beats`; inside a loop the whole loop moves with the playhead. */
export function beatJump(deck, beats) {
  if (!deck.track) return;
  const position = deck.positionAt(deck.effectiveTime());
  const target = beatJumpTarget(position, beats, deck.bpm, deck.duration);
  if (deck.loop) shiftActiveLoop(deck, target - position);
  else deck.jumpTo(target);
  deck.emit('beatjump', { beats, position: target });
}

function shiftActiveLoop(deck, delta) {
  const length = deck.loop.end - deck.loop.start;
  const start = clamp(deck.loop.start + delta, 0, Math.max(0, deck.duration - length));
  engageLoop(deck, { ...shiftLoop(deck.loop, start - deck.loop.start, deck.bpm), beats: deck.loop.beats });
}

function samplerDown(deck, index) {
  const name = SAMPLER_SOUNDS[index % SAMPLER_SOUNDS.length];
  deck.audio.trigger(name, { time: deck.effectiveTime(), bpm: deck.bpm * deck.transport.base });
  deck.emit('sample', { name, pad: index });
}

function rollDown(deck, index) {
  if (!deck.track || !deck.isPlaying() || deck.roll || deck.scrub) return;
  const beats = ROLL_BEATS[index % ROLL_BEATS.length];
  const time = deck.effectiveTime();
  const length = beatsToSeconds(beats, deck.bpm);
  const start = Math.floor(deck.positionAt(time) / length) * length;
  deck.audio.startRoll({ time, start, length, rate: deck.rateSpec(time) });
  deck.roll = { index, beats, start };
  deck.emit('fx', { scope: 'roll', active: true, beats });
}

function rollUp(deck, index) {
  if (deck.roll && deck.roll.index === index) deck.endRoll();
}

const DOWN = {
  hotcue: hotCueDown,
  beatjump: (deck, index) => beatJump(deck, BEAT_JUMP_BEATS[index]),
  sampler: samplerDown,
  padfx: rollDown,
};

const UP = { hotcue: hotCueUp, padfx: rollUp };

export function padDown(deck, index) {
  if (!deck.track) return;
  DOWN[deck.padMode](deck, index);
}

export function padUp(deck, index) {
  const handler = UP[deck.padMode];
  if (handler) handler(deck, index);
}

/** Releases anything a pad is holding (used when the pad mode changes). */
export function releaseAllPads(deck) {
  if (deck.preview && deck.preview.kind === 'pad') deck.endPreview();
  deck.endRoll();
}
