/**
 * CDSS page figure: one case's probability goes through the Proposer, Skeptic and Safety Harness.
 * The three functions copy the thresholds in the repo's "Mimic IV/mimic.py". The slider is a stand-in input.
 */
import { initProject, svgEl, htmlEl } from './common.js';

const T = Object.freeze({ high: 0.7, low: 0.3, boundLo: 0.4, boundHi: 0.6, entropy: 0.9, alert: 0.85, clear: 0.15 });
const EPS = 1e-6;
const DECISIONS = Object.freeze({
  hand: { label: 'Hand off to clinician', hot: true },
  alert: { label: 'AI high-risk alert', hot: false },
  clear: { label: 'AI low-risk OK', hot: false },
});

export const entropyBits = (p) => {
  const q = Math.min(1 - EPS, Math.max(EPS, p));
  return -(q * Math.log2(q) + (1 - q) * Math.log2(1 - q));
};
export const proposer = (p) => (p >= T.high ? 'High risk' : p <= T.low ? 'Low risk' : 'Intermediate');

export function skeptic(p, isOod) {
  const reasons = [];
  if (p >= T.boundLo && p <= T.boundHi) reasons.push('near the 0.5 boundary');
  if (entropyBits(p) > T.entropy) reasons.push(`entropy ${entropyBits(p).toFixed(2)} bits is above ${T.entropy}`);
  if (isOod) reasons.push('out-of-distribution');
  return reasons;
}

export function harness(p, flagged) {
  if (flagged) return 'hand';
  if (p >= T.alert) return 'alert';
  if (p <= T.clear) return 'clear';
  return 'hand';
}

function drawBar(svg, p) {
  const x = (value) => 10 + value * 420;
  svg.replaceChildren(svgEl('title', { id: 'cdss-bar-t' }, document.createTextNode('Harness decision along the probability axis for an in-distribution case. Illustration of the rules.')));
  let start = 0;
  let current = harness(0, skeptic(0, false).length > 0);
  for (let i = 1; i <= 100; i += 1) {
    const value = i / 100;
    const decision = i === 100 ? null : harness(value, skeptic(value, false).length > 0);
    if (decision !== current) {
      svg.append(svgEl('rect', { x: x(start), y: 14, width: x(value) - x(start), height: 16,
        fill: DECISIONS[current].hot ? 'var(--sakura-text)' : 'var(--ink-2)', 'fill-opacity': DECISIONS[current].hot ? 0.75 : 0.45 }));
      start = value;
      current = decision;
    }
  }
  [0, 0.15, 0.5, 0.85, 1].forEach((tick) => {
    const label = svgEl('text', { x: x(tick), y: 52, 'text-anchor': tick === 0 ? 'start' : tick === 1 ? 'end' : 'middle', fill: 'var(--ink-2)', 'font-size': 13, 'font-family': 'var(--font-mono)' });
    label.textContent = tick.toFixed(2);
    svg.append(label);
  });
  svg.append(svgEl('path', { d: `M${x(p)} 6 V38`, stroke: 'var(--ink)', 'stroke-width': 2 }), svgEl('circle', { cx: x(p), cy: 6, r: 4, fill: 'var(--ink)' }));
}

function init() {
  const range = document.getElementById('cdss-p');
  if (!range) return;
  const oodButton = document.getElementById('cdss-ood');
  const out = document.getElementById('cdss-out');
  const read = document.getElementById('cdss-read');
  const bar = document.getElementById('cdss-bar');
  const text = (id) => document.getElementById(id);

  const render = () => {
    const p = Number(range.value);
    const isOod = oodButton.getAttribute('aria-pressed') === 'true';
    const reasons = skeptic(p, isOod);
    const decision = DECISIONS[harness(p, reasons.length > 0)];
    out.textContent = p.toFixed(2);
    range.setAttribute('aria-valuetext', `probability ${p.toFixed(2)}`);
    text('o-prop').textContent = proposer(p);
    text('o-skep').textContent = reasons.length ? 'Flag' : 'No flag';
    text('o-safe').textContent = decision.label;
    text('n-safe').style.borderColor = decision.hot ? 'var(--sakura-text)' : '';
    text('n-skep').style.borderColor = reasons.length ? 'var(--sakura-text)' : '';
    drawBar(bar, p);
    read.replaceChildren(htmlEl('p', {}, reasons.length
      ? `The Skeptic flags this case: ${reasons.join('; ')}. A flag always means a person looks at it.`
      : decision.hot
        ? 'No flag, but the probability is between 0.15 and 0.85, so the harness stays conservative and hands off anyway.'
        : 'No flag and the probability is extreme enough for the harness to let the AI answer on its own.'));
  };
  range.addEventListener('input', render);
  oodButton.addEventListener('click', () => {
    oodButton.setAttribute('aria-pressed', String(oodButton.getAttribute('aria-pressed') !== 'true'));
    render();
  });
  render();
}

initProject();
init();
