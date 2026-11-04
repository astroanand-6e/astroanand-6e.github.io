/**
 * One scrolling waveform lane on the deck display: 3-band bars, beat grid, bar numbers,
 * phrase lines, cue and loop markers, and the fixed playhead at the centre.
 */
import { BEATS_PER_BAR, PHRASE_BEATS } from '../controls.js';
import { FONTS, HOT_CUE_COLORS, SCREEN } from './palette.js';

export const SECONDS_VISIBLE = 8;
const COLUMN_PX = 2;
const BAR_PX = 1.7;
const MARGIN_PX = 5;
const MIN_BAR_PX = 0.6;
const EDGE_FADE_PX = 44;
const BEAT_TICK_PX = 5;
const PLAYED_SHADE = 'rgba(8, 9, 12, 0.5)';
const CUE_LETTERS = 'ABCDEFGH';
const FLAG = Object.freeze({ w: 12, h: 11 });

function peak(band, from, to) {
  let best = 0;
  for (let i = Math.max(0, from); i <= to && i < band.length; i += 1) if (band[i] > best) best = band[i];
  return best;
}

/** Bars per pixel column. Largest band is painted first so the smaller ones stay visible. */
function paintBars(ctx, lane, wave, view) {
  const bands = [wave.low, wave.mid, wave.high];
  const layers = [0, 1, 2].map(() => bands.map(() => new Path2D()));
  const secPerColumn = COLUMN_PX / view.pxPerSec;
  const columns = Math.ceil(lane.w / COLUMN_PX);
  const midY = lane.y + lane.h / 2;
  const maxHeight = lane.h - 2 * MARGIN_PX;
  const heights = [0, 0, 0];
  const order = [0, 1, 2];
  const swap = (i, j) => { const t = order[i]; order[i] = order[j]; order[j] = t; };
  for (let c = 0; c < columns; c += 1) {
    const t = view.position - SECONDS_VISIBLE / 2 + c * secPerColumn;
    if (t + secPerColumn < 0 || t > view.duration) continue;
    const from = Math.floor(t / wave.binSeconds);
    const to = Math.floor((t + secPerColumn) / wave.binSeconds);
    for (let b = 0; b < 3; b += 1) heights[b] = peak(bands[b], from, to) * maxHeight;
    order[0] = 0; order[1] = 1; order[2] = 2;
    if (heights[order[0]] < heights[order[1]]) swap(0, 1);
    if (heights[order[1]] < heights[order[2]]) swap(1, 2);
    if (heights[order[0]] < heights[order[1]]) swap(0, 1);
    for (let rank = 0; rank < 3; rank += 1) {
      const b = order[rank];
      if (heights[b] >= MIN_BAR_PX) layers[rank][b].rect(lane.x + c * COLUMN_PX, midY - heights[b] / 2, BAR_PX, heights[b]);
    }
  }
  for (const layer of layers) {
    layer.forEach((path, b) => {
      ctx.fillStyle = SCREEN.bands[b];
      ctx.fill(path);
    });
  }
}

/** Calls visit(beatIndex, seconds) for each beat in view. The grid origin comes from deck.beat. */
function forEachBeat(deck, position, visit) {
  const perBeat = 60 / deck.track.bpm;
  if (!(perBeat > 0)) return;
  const beat = Number.isFinite(deck.beat) ? deck.beat : position / perBeat;
  const origin = position - beat * perBeat;
  const half = SECONDS_VISIBLE / 2;
  const first = Math.ceil((position - half - origin) / perBeat);
  const last = Math.floor((position + half - origin) / perBeat);
  for (let k = first; k <= last; k += 1) {
    const t = origin + k * perBeat;
    if (t >= 0 && t <= deck.duration) visit(k, t);
  }
}

function drawGrid(ctx, lane, deck, view) {
  forEachBeat(deck, view.position, (k, t) => {
    const x = Math.round(view.xAt(t)) + 0.5;
    const phrase = k % PHRASE_BEATS === 0;
    const bar = k % BEATS_PER_BAR === 0;
    ctx.strokeStyle = phrase ? SCREEN.sakura : SCREEN.grid;
    ctx.lineWidth = phrase ? 2 : 1;
    ctx.globalAlpha = phrase ? 0.85 : bar ? 1 : 0.9;
    ctx.beginPath();
    if (bar) {
      ctx.moveTo(x, lane.y);
      ctx.lineTo(x, lane.y + lane.h);
    } else {
      ctx.moveTo(x, lane.y);
      ctx.lineTo(x, lane.y + BEAT_TICK_PX);
      ctx.moveTo(x, lane.y + lane.h - BEAT_TICK_PX);
      ctx.lineTo(x, lane.y + lane.h);
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawBarNumbers(ctx, lane, deck, view) {
  ctx.font = `500 10px ${FONTS.mono}`;
  ctx.textBaseline = 'top';
  forEachBeat(deck, view.position, (k, t) => {
    if (k % BEATS_PER_BAR !== 0) return;
    ctx.fillStyle = k % PHRASE_BEATS === 0 ? SCREEN.sakura : SCREEN.dim;
    ctx.fillText(String(Math.floor(k / BEATS_PER_BAR) + 1), view.xAt(t) + 4, lane.y + 4);
  });
}

function drawLoop(ctx, lane, deck, view) {
  if (!deck.loop) return;
  const x0 = view.xAt(deck.loop.start);
  const x1 = view.xAt(deck.loop.end);
  ctx.fillStyle = 'rgba(69, 212, 131, 0.14)';
  ctx.fillRect(x0, lane.y, x1 - x0, lane.h);
  ctx.fillStyle = SCREEN.green;
  ctx.fillRect(x0 - 0.75, lane.y, 1.5, lane.h);
  ctx.fillRect(x1 - 0.75, lane.y, 1.5, lane.h);
}

function drawCues(ctx, lane, deck, view) {
  const cueX = view.xAt(deck.cuePoint ?? 0);
  ctx.fillStyle = SCREEN.led;
  ctx.fillRect(cueX - 0.75, lane.y, 1.5, lane.h);
  ctx.beginPath();
  ctx.moveTo(cueX - 5, lane.y + lane.h);
  ctx.lineTo(cueX + 5, lane.y + lane.h);
  ctx.lineTo(cueX, lane.y + lane.h - 7);
  ctx.fill();
  ctx.font = `700 8px ${FONTS.text}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  (deck.hotCues ?? []).forEach((seconds, i) => {
    if (seconds == null) return;
    const x = view.xAt(seconds);
    ctx.fillStyle = HOT_CUE_COLORS[i];
    ctx.fillRect(x - 0.75, lane.y, 1.5, lane.h);
    ctx.fillRect(x, lane.y, FLAG.w, FLAG.h);
    ctx.fillStyle = '#101114';
    ctx.fillText(CUE_LETTERS[i], x + FLAG.w / 2, lane.y + FLAG.h / 2 + 0.5);
  });
  ctx.textAlign = 'left';
}

function fadeEdges(ctx, lane) {
  for (const [x, from, to] of [[lane.x, 1, 0], [lane.x + lane.w - EDGE_FADE_PX, 0, 1]]) {
    const gradient = ctx.createLinearGradient(x, 0, x + EDGE_FADE_PX, 0);
    gradient.addColorStop(0, `rgba(8, 9, 12, ${from})`);
    gradient.addColorStop(1, `rgba(8, 9, 12, ${to})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, lane.y, EDGE_FADE_PX, lane.h);
  }
}

function drawPlayhead(ctx, lane, centerX) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(centerX - 0.75, lane.y, 1.5, lane.h);
  ctx.fillStyle = SCREEN.sakura;
  for (const [y, dir] of [[lane.y, 1], [lane.y + lane.h, -1]]) {
    ctx.beginPath();
    ctx.moveTo(centerX - 5, y);
    ctx.lineTo(centerX + 5, y);
    ctx.lineTo(centerX, y + dir * 6);
    ctx.fill();
  }
}

function drawPhraseCountdown(ctx, lane, deck) {
  const beatsLeft = Math.max(1, PHRASE_BEATS - Math.floor(deck.phraseBeat ?? 0));
  ctx.font = `500 9.5px ${FONTS.mono}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = deck.playing && beatsLeft <= BEATS_PER_BAR ? SCREEN.sakura : SCREEN.dim;
  ctx.fillText(`PHRASE IN ${beatsLeft}`, lane.x + 8, lane.y + lane.h - 8);
}

function drawHint(ctx, lane, text) {
  ctx.font = `400 13px ${FONTS.text}`;
  ctx.fillStyle = SCREEN.faint;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, lane.x + lane.w / 2, lane.y + lane.h / 2);
  ctx.textAlign = 'left';
}

/** Draws one lane. wave may be null while the engine is still rendering it. */
export function drawLane(ctx, lane, deck, wave, emptyHint) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(lane.x, lane.y, lane.w, lane.h);
  ctx.clip();
  ctx.fillStyle = SCREEN.lane;
  ctx.fillRect(lane.x, lane.y, lane.w, lane.h);
  if (!deck.track) {
    drawHint(ctx, lane, emptyHint);
    ctx.restore();
    return;
  }
  const position = Number.isFinite(deck.position) ? deck.position : 0;
  const centerX = lane.x + lane.w / 2;
  const pxPerSec = lane.w / SECONDS_VISIBLE;
  const view = { position, pxPerSec, duration: deck.duration, xAt: (t) => centerX + (t - position) * pxPerSec };
  drawGrid(ctx, lane, deck, view);
  if (wave) paintBars(ctx, lane, wave, view);
  ctx.fillStyle = PLAYED_SHADE;
  ctx.fillRect(lane.x, lane.y, centerX - lane.x, lane.h);
  drawLoop(ctx, lane, deck, view);
  drawCues(ctx, lane, deck, view);
  drawBarNumbers(ctx, lane, deck, view);
  fadeEdges(ctx, lane);
  drawPhraseCountdown(ctx, lane, deck);
  drawPlayhead(ctx, lane, centerX);
  ctx.restore();
}
