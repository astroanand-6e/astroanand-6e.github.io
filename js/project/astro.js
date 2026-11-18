/**
 * Astro page figure: a script toggle on one illustrative Hinglish sentence, and a backend picker that
 * draws measured p50/p95 latency against the 400 ms dictation budget.
 * Latency and policy figures: eval/results/codeswitch_bench_incumbent.md in the Astro repo (n = 76 clips).
 */
import { initProject, svgEl, htmlEl, buttonGroup } from './common.js';

const SENTENCES = Object.freeze({
  roman: { text: 'kal meeting hai, slides bhej dena', lang: 'hi-Latn' },
  native: { text: 'कल meeting है, slides भेज देना', lang: 'hi' },
});
const BUDGET_MS = 400;
const AXIS_MAX_MS = 1900;
const X0 = 10;
const SPAN = 420;

const BACKENDS = Object.freeze([
  { id: 'gemma', name: 'Gemma 4 E4B 4-bit', p50: 333, p95: 751, note: 'Wrote Roman Hindi on 74 of 76 clips and Devanagari on 2. Policy purity 0.974, nothing off-script, no empty outputs. Peak memory 6482 MB.' },
  { id: 'q17', name: 'Qwen3-ASR 1.7B', p50: 434, p95: 1220, note: 'Chose Devanagari on 69 of 75 utterances and mostly held it. Policy purity 0.920. Median is over the 400 ms budget.' },
  { id: 'q06', name: 'Qwen3-ASR 0.6B', p50: 241, p95: 518, note: 'Fast and light (1652 MB). Policy purity 0.875, 5.3% of output off-script.' },
  { id: 'whisper', name: 'Whisper turbo', p50: 419, p95: 1805, note: 'Policy purity 0.529 and 10.5% off-script. It has the worst slow tail of the five.' },
  { id: 'parakeet', name: 'Parakeet TDT', p50: 106, p95: 188, note: 'Fastest by far, but it wrote Latin script on 69 of 76 clips, never Devanagari, and returned nothing on 7. Its perfect orthography score is an artifact.' },
]);

const x = (ms) => X0 + (ms / AXIS_MAX_MS) * SPAN;

function label(attrs, text) {
  const node = svgEl('text', attrs);
  node.textContent = text;
  return node;
}

function drawChart(svg, backend) {
  svg.replaceChildren(svgEl('title', { id: 'astro-chart-t' }, document.createTextNode(
    `${backend.name}: median latency ${backend.p50} ms, 95th percentile ${backend.p95} ms, budget ${BUDGET_MS} ms.`)));
  svg.append(
    svgEl('rect', { x: X0, y: 10, width: SPAN, height: 18, fill: 'var(--rule)' }),
    svgEl('rect', { x: X0, y: 40, width: SPAN, height: 18, fill: 'var(--rule)' }),
    svgEl('rect', { x: X0, y: 10, width: x(backend.p50) - X0, height: 18, fill: 'var(--sakura-text)' }),
    svgEl('rect', { x: X0, y: 40, width: x(backend.p95) - X0, height: 18, fill: 'var(--ink-2)', 'fill-opacity': 0.7 }),
    svgEl('line', { x1: x(BUDGET_MS), x2: x(BUDGET_MS), y1: 4, y2: 66, stroke: 'var(--ink)', 'stroke-dasharray': '3 3' }),
    label({ x: x(BUDGET_MS) + 4, y: 78 }, `${BUDGET_MS} ms budget`),
    label({ x: Math.min(x(backend.p50) + 6, 360), y: 23, fill: 'var(--ink)' }, `p50 ${backend.p50} ms`),
    label({ x: Math.min(x(backend.p95) + 6, 360), y: 53, fill: 'var(--ink)' }, `p95 ${backend.p95} ms`),
  );
}

function init() {
  const sentence = document.getElementById('astro-sentence');
  const scriptBox = document.getElementById('astro-script');
  const picker = document.getElementById('astro-backends');
  const chart = document.getElementById('astro-chart');
  const read = document.getElementById('astro-read');
  if (!sentence || !scriptBox || !picker) return;

  buttonGroup(scriptBox, 'button', (button) => {
    const pick = SENTENCES[button.dataset.script];
    sentence.textContent = pick.text;
    sentence.setAttribute('lang', pick.lang);
  })(scriptBox.querySelector('[data-script="roman"]'));

  BACKENDS.forEach((backend) => picker.append(htmlEl('button', { type: 'button', 'data-id': backend.id, 'aria-pressed': 'false' }, backend.name)));
  buttonGroup(picker, 'button', (button) => {
    const backend = BACKENDS.find((item) => item.id === button.dataset.id);
    drawChart(chart, backend);
    read.replaceChildren(htmlEl('p', {}, backend.note));
  })(picker.querySelector('[data-id="gemma"]'));
}

initProject();
init();
