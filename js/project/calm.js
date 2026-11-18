/**
 * CALM page figure: click a pipeline stage to see what it passes on.
 * Stage names, sizes and wiring are read from models/calm/finetune.py in the CALM repo.
 * The tensor picture is an illustration of shapes (T = number of audio tokens), not data.
 */
import { initProject, svgEl, htmlEl } from './common.js';

const STAGES = Object.freeze([
  { id: 'clip', lane: 'audio', name: 'Audio clip', tag: 'input', train: false,
    inShape: '5 s at 16 kHz', outShape: 'T x 128 mel frames', cols: 12, rows: 2,
    text: 'A 5 second clip is resampled to 16 kHz and turned into 128-band mel features by the feature extractor that ships with Gemma 4.' },
  { id: 'conformer', lane: 'audio', name: 'Audio Conformer', tag: 'frozen, 305M', train: false,
    inShape: 'T x 128', outShape: 'T x 1536', cols: 12, rows: 6,
    text: 'The audio tower from Gemma 4. It is never updated. It hands on one 1536-wide vector for each audio token.' },
  { id: 'audio-proj', lane: 'audio', name: 'Audio projection', tag: 'trained', train: true,
    inShape: 'T x 1536', outShape: 'T x 512', cols: 12, rows: 3,
    text: 'A linear layer and LayerNorm shrink each audio token to the 512-wide space that fusion works in.' },
  { id: 'text', lane: 'text', name: 'Track text', tag: 'input', train: false,
    inShape: 'title, artist, bio', outShape: 'one string', cols: 1, rows: 2,
    text: 'The track title, artist name and artist biography from the FMA metadata, joined into one description. Artist tags are off by default.' },
  { id: 'text-enc', lane: 'text', name: 'Text encoder', tag: 'frozen', train: false,
    inShape: 'string', outShape: '1 x 1536', cols: 1, rows: 6,
    text: 'The text backbone of Gemma 4 E2B, run once per track and cached. The result is a single 1536-wide vector.' },
  { id: 'text-proj', lane: 'text', name: 'Text projection', tag: 'trained', train: true,
    inShape: '1 x 1536', outShape: '1 x 512', cols: 1, rows: 3,
    text: 'The same linear layer and LayerNorm idea as the audio side, ending in one 512-wide text token.' },
  { id: 'cross', lane: 'fusion', name: 'Cross-attention x2', tag: 'trained, 8 heads', train: true,
    inShape: 'T x 512 and 1 x 512', outShape: 'T x 512 and 1 x 512', cols: 12, rows: 3,
    text: 'Two layers. In each, the audio tokens attend to the text token and the text token attends to the audio tokens, so each side comes out enriched by the other.' },
  { id: 'head', lane: 'fusion', name: 'Pool and classify', tag: 'trained', train: true,
    inShape: 'T x 512 and 1 x 512', outShape: '16 logits', cols: 4, rows: 2,
    text: 'The audio tokens are averaged, joined with the text token, then LayerNorm, a 256-wide layer with GELU and a final layer produce one score per genre.' },
]);

const BLOCK = 10;
const GAP = 2;

function drawBlock(group, x, label, cols, rows, hot) {
  const w = cols * BLOCK + (cols - 1) * GAP;
  const h = rows * 8 + (rows - 1) * 2;
  for (let c = 0; c < cols; c += 1) {
    group.append(svgEl('rect', {
      x: x + c * (BLOCK + GAP), y: 70 - h, width: BLOCK, height: h, rx: 2,
      fill: hot ? 'var(--sakura-text)' : 'var(--ink-2)', 'fill-opacity': hot ? 0.8 : 0.55,
    }));
  }
  const text = svgEl('text', { x, y: 108, 'text-anchor': 'start', fill: 'var(--ink-2)', 'font-size': 14, 'font-family': 'var(--font-mono)' });
  text.textContent = label;
  group.append(text);
  return w;
}

function renderShape(svg, stage) {
  svg.replaceChildren(svgEl('title', { id: 'calm-shape-t' }, document.createTextNode(`Illustration: ${stage.inShape} becomes ${stage.outShape}`)));
  const group = svgEl('g');
  const inCols = Math.min(stage.cols, 12);
  const leftW = drawBlock(group, 10, stage.inShape, stage.id === 'clip' ? 12 : inCols, 3, false);
  const arrowX = 10 + leftW + 18;
  group.append(svgEl('path', { d: `M${arrowX} 50 h26 m-7 -6 l7 6 l-7 6`, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.4 }));
  drawBlock(group, arrowX + 44, stage.outShape, stage.cols, stage.rows, stage.train);
  svg.append(group);
}

function describe(stage) {
  const frag = document.createDocumentFragment();
  const head = htmlEl('p');
  head.append(htmlEl('b', {}, stage.name), document.createTextNode(` (${stage.tag}). In ${stage.inShape}, out ${stage.outShape}.`));
  frag.append(head, htmlEl('p', {}, stage.text));
  return frag;
}

function init() {
  const fig = document.getElementById('calm-fig');
  if (!fig) return;
  const read = document.getElementById('calm-read');
  const shape = document.getElementById('calm-shape');
  const buttons = new Map();
  STAGES.forEach((stage) => {
    const button = htmlEl('button', { type: 'button', class: `node${stage.train ? ' is-train' : ''}`, 'aria-pressed': 'false' });
    button.append(document.createTextNode(stage.name), htmlEl('small', {}, stage.tag));
    fig.querySelector(`[data-lane="${stage.lane}"]`).append(button);
    buttons.set(stage.id, button);
    button.addEventListener('click', () => select(stage.id));
  });
  function select(id) {
    const stage = STAGES.find((s) => s.id === id);
    buttons.forEach((button, key) => button.setAttribute('aria-pressed', String(key === id)));
    read.replaceChildren(describe(stage));
    renderShape(shape, stage);
  }
  select('cross');
}

initProject();
init();
