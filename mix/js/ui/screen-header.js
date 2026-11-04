/** Deck info strip on the display: title, BPM, key, tempo, sync, times. */
import { TEMPO_RANGE } from '../controls.js';
import { roundedRect } from './canvas-util.js';
import { FONTS, SCREEN } from './palette.js';
import { formatClock } from './svg.js';

const MINUS = '−';
const CHIP_PAD_X = 6;
const CHIP_HEIGHT = 17;
const ITEM_GAP = 12;
const BADGE_R = 9;
const TITLE_X = 46;
const COMPACT_STATS_BASELINE = 46;
const COLORS_BY_MODE = Object.freeze({ A: 62, B: 72 });

function textItem(ctx, text, font, color) {
  ctx.font = font;
  const width = ctx.measureText(text).width;
  return { width, draw(x, y) { ctx.font = font; ctx.fillStyle = color; ctx.fillText(text, x, y); } };
}

function chipItem(ctx, text, { fill, ink, stroke }) {
  const font = `600 10px ${FONTS.mono}`;
  ctx.font = font;
  const width = ctx.measureText(text).width + 2 * CHIP_PAD_X;
  return {
    width,
    draw(x, y) {
      ctx.beginPath();
      roundedRect(ctx, x, y - 12.5, width, CHIP_HEIGHT, 4);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.font = font;
      ctx.fillStyle = ink;
      ctx.fillText(text, x + CHIP_PAD_X, y);
    },
  };
}

function bpmItem(ctx, text, color) {
  const big = `italic 400 24px ${FONTS.display}`;
  const small = `500 9px ${FONTS.mono}`;
  ctx.font = big;
  const bigWidth = ctx.measureText(text).width;
  ctx.font = small;
  const width = bigWidth + 4 + ctx.measureText('BPM').width;
  return {
    width,
    draw(x, y) {
      ctx.font = big; ctx.fillStyle = color; ctx.fillText(text, x, y + 1);
      ctx.font = small; ctx.fillStyle = SCREEN.dim; ctx.fillText('BPM', x + bigWidth + 4, y);
    },
  };
}

function camelotChip(ctx, camelot) {
  const match = /^(\d{1,2})([AB])$/i.exec(camelot ?? '');
  if (!match) return null;
  const lightness = COLORS_BY_MODE[match[2].toUpperCase()];
  return chipItem(ctx, camelot.toUpperCase(), { fill: `hsl(${(Number(match[1]) - 1) * 30} 70% ${lightness}%)`, ink: '#101114' });
}

function fitText(ctx, text, maxWidth) {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
}

function statItems(ctx, deck, compact) {
  const track = deck.track;
  const tempo = (deck.tempo ?? 0) * TEMPO_RANGE * 100;
  const tempoText = `${tempo < 0 ? MINUS : tempo > 0 ? '+' : ''}${Math.abs(tempo).toFixed(1)}%`;
  const places = compact ? 0 : 1;
  const elapsed = formatClock(deck.position, places);
  const remaining = `${MINUS}${formatClock(Math.max(0, deck.duration - deck.position), places)}`;
  const sync = deck.synced
    ? chipItem(ctx, 'SYNC', { fill: SCREEN.sakura, ink: '#101114' })
    : chipItem(ctx, 'SYNC', { stroke: SCREEN.faint, ink: SCREEN.faint });
  return {
    bpm: bpmItem(ctx, Number.isFinite(deck.bpm) ? deck.bpm.toFixed(1) : '-', SCREEN.ink),
    tempo: textItem(ctx, tempoText, `500 12px ${FONTS.mono}`, SCREEN.dim),
    key: [camelotChip(ctx, track.camelot), track.key && !compact ? textItem(ctx, track.key, `400 11px ${FONTS.mono}`, SCREEN.dim) : null].filter(Boolean),
    sync,
    time: textItem(ctx, `${elapsed}  ${remaining}`, `500 11.5px ${FONTS.mono}`, SCREEN.ink),
  };
}

function drawRow(items, x, y, direction) {
  let cursor = x;
  for (const item of items) {
    if (direction < 0) cursor -= item.width;
    item.draw(cursor, y);
    cursor += direction > 0 ? item.width + ITEM_GAP : -ITEM_GAP;
  }
}

function drawBadge(ctx, rect, index, deck, centerY) {
  ctx.strokeStyle = SCREEN.dim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(rect.x + BADGE_R + 1, centerY, BADGE_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `600 11px ${FONTS.mono}`;
  ctx.fillStyle = SCREEN.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), rect.x + BADGE_R + 1, centerY + 0.5);
  ctx.textAlign = 'left';
  const gx = rect.x + 2 * BADGE_R + 12;
  ctx.fillStyle = deck.playing ? SCREEN.green : SCREEN.faint;
  if (deck.playing) {
    ctx.beginPath();
    ctx.moveTo(gx, centerY - 5); ctx.lineTo(gx + 8, centerY); ctx.lineTo(gx, centerY + 5);
    ctx.fill();
  } else {
    ctx.fillRect(gx, centerY - 5, 3, 10);
    ctx.fillRect(gx + 5, centerY - 5, 3, 10);
  }
}

function drawTitle(ctx, rect, deck, baseline, maxWidth) {
  ctx.textBaseline = 'alphabetic';
  if (!deck.track) {
    ctx.font = `400 13px ${FONTS.text}`;
    ctx.fillStyle = SCREEN.faint;
    ctx.fillText('No track loaded', rect.x + TITLE_X, baseline);
    return;
  }
  ctx.font = `600 13px ${FONTS.text}`;
  const title = fitText(ctx, deck.track.title, maxWidth);
  ctx.fillStyle = SCREEN.ink;
  ctx.fillText(title, rect.x + TITLE_X, baseline);
  const used = ctx.measureText(title).width;
  ctx.font = `400 12px ${FONTS.text}`;
  ctx.fillStyle = SCREEN.dim;
  ctx.fillText(fitText(ctx, deck.track.artist ?? '', maxWidth - used - 14), rect.x + TITLE_X + used + 10, baseline);
}

/** Draws the strip for one deck. compact stacks the stats on a second row. */
export function drawHeader(ctx, rect, index, deck, compact) {
  const rowY = compact ? rect.y + 16 : rect.y + rect.h / 2;
  const right = rect.x + rect.w;
  const titleRoom = right - rect.x - TITLE_X;
  drawBadge(ctx, rect, index, deck, rowY);
  if (!deck.track) {
    drawTitle(ctx, rect, deck, rowY + 4.5, titleRoom);
  } else if (compact) {
    const stats = statItems(ctx, deck, true);
    drawTitle(ctx, rect, deck, rowY + 4.5, titleRoom);
    drawRow([stats.bpm, stats.tempo, ...stats.key, stats.sync, stats.time], rect.x + 2, rect.y + COMPACT_STATS_BASELINE, 1);
  } else {
    const stats = statItems(ctx, deck, false);
    const cluster = [stats.time, stats.sync, stats.tempo, stats.bpm, ...[...stats.key].reverse()];
    const clusterWidth = cluster.reduce((sum, item) => sum + item.width + ITEM_GAP, 0);
    drawTitle(ctx, rect, deck, rowY + 4.5, titleRoom - clusterWidth - 8);
    drawRow(cluster, right, rowY + 6, -1);
  }
}
