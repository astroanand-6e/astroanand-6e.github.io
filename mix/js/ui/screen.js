/**
 * mountScreen(host, { bus, engine }): the deck display on a canvas. Two scrolling
 * waveform lanes with a phase meter between them, an info strip per deck and level
 * meters. Sharp on any pixel ratio, follows its container, sleeps when hidden.
 */
import { on } from '../controls.js';
import { roundedRect } from './canvas-util.js';
import { meterFraction } from './format.js';
import { createLoop } from './loop.js';
import { FONTS, SCREEN } from './palette.js';
import { drawHeader } from './screen-header.js';
import { drawLane } from './screen-wave.js';
import { clamp } from './svg.js';

const COMPACT_WIDTH = 600;
const METER_SEGMENTS = 14;
const METER_FALL_PER_SECOND = 1.6;
const METER_WIDTH = 6;
const METER_GAP = 8;
const PHASE_HEIGHT = 30;
const IN_PHASE = 0.03;
const NEAR_PHASE = 0.12;
const WAVE_RETRY_MS = 600;
const HINTS = Object.freeze(['No track. Pick one below and press Load 1.', 'No track. Pick one below and press Load 2.']);

function computeLayout(width) {
  const compact = width < COMPACT_WIDTH;
  const pad = compact ? 10 : 14;
  const headerH = compact ? 54 : 30;
  const laneH = compact ? 64 : 72;
  const laneW = width - 2 * pad - METER_WIDTH - METER_GAP;
  let y = pad;
  const next = (w, h) => {
    const box = { x: pad, y, w, h };
    y += h;
    return box;
  };
  const header1 = next(width - 2 * pad, headerH);
  const lane1 = next(laneW, laneH);
  const phase = next(laneW, PHASE_HEIGHT);
  const lane2 = next(laneW, laneH);
  const header2 = next(width - 2 * pad, headerH);
  return { compact, width, height: y + pad, headers: [header1, header2], lanes: [lane1, lane2], phase };
}

function drawMeter(ctx, lane, level) {
  const lit = Math.round(clamp(level, 0, 1) * METER_SEGMENTS);
  const x = lane.x + lane.w + METER_GAP;
  const gap = 2;
  const segment = (lane.h - gap * (METER_SEGMENTS - 1)) / METER_SEGMENTS;
  for (let i = 0; i < METER_SEGMENTS; i += 1) {
    const fromBottom = i;
    const y = lane.y + lane.h - (i + 1) * segment - i * gap;
    const hot = fromBottom >= METER_SEGMENTS - 2 ? SCREEN.red : fromBottom >= METER_SEGMENTS - 5 ? SCREEN.amber : SCREEN.green;
    ctx.fillStyle = fromBottom < lit ? hot : 'rgba(236, 231, 222, 0.08)';
    ctx.fillRect(x, y, METER_WIDTH, segment);
  }
}

function phaseLabel(offset) {
  if (Math.abs(offset) < IN_PHASE) return 'IN PHASE';
  return `DECK ${offset > 0 ? 2 : 1} AHEAD ${Math.abs(offset).toFixed(2)}`;
}

function drawPhase(ctx, rect, offset, active) {
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const span = Math.min(rect.w / 2 - 110, 280);
  ctx.fillStyle = SCREEN.faint;
  ctx.fillRect(centerX - span, centerY - 0.5, 2 * span, 1);
  for (const tick of [-0.5, -0.25, 0, 0.25, 0.5]) {
    const x = centerX + (tick / 0.5) * span;
    ctx.fillRect(x - 0.5, centerY - (tick === 0 ? 7 : 4), 1, tick === 0 ? 14 : 8);
  }
  ctx.font = `500 9.5px ${FONTS.mono}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = SCREEN.dim;
  ctx.fillText('PHASE', rect.x + 8, centerY);
  ctx.textAlign = 'right';
  ctx.fillText(active ? phaseLabel(offset) : '-', rect.x + rect.w - 8, centerY);
  ctx.textAlign = 'left';
  if (!active) return;
  const o = clamp(offset, -0.5, 0.5);
  const color = Math.abs(o) < IN_PHASE ? SCREEN.green : Math.abs(o) < NEAR_PHASE ? SCREEN.amber : SCREEN.sakura;
  ctx.fillStyle = color;
  ctx.beginPath();
  roundedRect(ctx, centerX + (o / 0.5) * span - 2, centerY - 8, 4, 16, 2);
  ctx.fill();
}

function summary(state) {
  if (!state || !state.ready) return 'Deck display. Loading tracks.';
  const parts = state.decks.map((deck, i) => {
    if (!deck.track) return `Deck ${i + 1}: empty`;
    return `Deck ${i + 1}: ${deck.track.title}, ${Number(deck.bpm).toFixed(1)} BPM, ${deck.playing ? 'playing' : 'paused'}`;
  });
  return `Deck display. ${parts.join('. ')}.`;
}

export function mountScreen(host, { bus, engine }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'screen-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Deck display. Loading tracks.');
  const live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  host.replaceChildren(canvas, live);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the deck display (no canvas 2D).');

  const waves = new Map();
  const retryAt = new Map();
  const levels = [0, 0];
  let layout = computeLayout(host.clientWidth || 960);
  let ratio = 0;
  let width = 0;
  let reported = false;

  function sizeCanvas() {
    const nextWidth = Math.max(280, host.clientWidth);
    const nextRatio = window.devicePixelRatio || 1;
    if (nextWidth === width && nextRatio === ratio) return;
    width = nextWidth;
    ratio = nextRatio;
    layout = computeLayout(width);
    canvas.style.height = `${layout.height}px`;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(layout.height * ratio);
  }

  function waveFor(deck, now) {
    const id = deck.track?.id;
    if (id === undefined || id === null) return null;
    if (waves.has(id)) return waves.get(id);
    if ((retryAt.get(id) ?? 0) > now) return null;
    retryAt.set(id, now + WAVE_RETRY_MS);
    try {
      const wave = engine.getWaveform(id);
      if (wave && wave.low && wave.binSeconds > 0) waves.set(id, wave);
      return waves.get(id) ?? null;
    } catch (error) {
      if (!reported) console.error('mix: engine.getWaveform() failed', error);
      reported = true;
      return null;
    }
  }

  function drawLoading() {
    ctx.font = `400 14px ${FONTS.text}`;
    ctx.fillStyle = SCREEN.dim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading tracks', width / 2, layout.height / 2);
    ctx.textAlign = 'left';
  }

  function draw(now, dt) {
    sizeCanvas();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = SCREEN.panel;
    ctx.fillRect(0, 0, width, layout.height);
    let state = null;
    try {
      state = engine.getState();
    } catch (error) {
      if (!reported) console.error('mix: engine.getState() failed', error);
      reported = true;
    }
    if (!state || !state.ready || !Array.isArray(state.decks)) {
      drawLoading();
      return;
    }
    state.decks.forEach((deck, i) => {
      drawLane(ctx, layout.lanes[i], deck, waveFor(deck, now), HINTS[i]);
      drawHeader(ctx, layout.headers[i], i, deck, layout.compact);
      levels[i] = Math.max(meterFraction(deck.level ?? 0), levels[i] - (METER_FALL_PER_SECOND * dt) / 1000);
      drawMeter(ctx, layout.lanes[i], levels[i]);
    });
    const loaded = state.decks.every((deck) => deck.track);
    drawPhase(ctx, layout.phase, state.phaseOffset ?? 0, loaded);
  }

  function announce(detail) {
    let state = null;
    try { state = engine.getState(); } catch (error) { return; }
    canvas.setAttribute('aria-label', summary(state));
    if (detail.type === 'loaded' && state?.decks?.[detail.deck]?.track) {
      live.textContent = `Deck ${detail.deck + 1} loaded: ${state.decks[detail.deck].track.title}`;
    }
  }

  const observer = new ResizeObserver(sizeCanvas);
  observer.observe(host);
  sizeCanvas();
  const unsubscribe = on(bus, 'engine', announce);
  const loop = createLoop(draw, canvas);
  return {
    dispose() {
      loop.stop();
      observer.disconnect();
      unsubscribe();
      host.replaceChildren();
    },
  };
}
