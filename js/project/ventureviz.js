/**
 * VentureViz page figure: a draggable sample of the real graph (4 startups and the 6 investors that funded at
 * least two of them, from data/ai_startups_timeline.json in the VentureViz repo), laid out by a tiny force loop.
 * The date slider reveals links by their real dates. Nodes also move with the arrow keys.
 */
import { initProject, svgEl, htmlEl, whileInView, reducedMotion, clamp } from './common.js';

const W = 440;
const H = 300;
const START_YEAR = 2015;
const START_MONTH = 11; // Dec 2015, zero-based
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KEY_STEP = 12;

/* month index = months since Dec 2015, so 0 is 2015-12 and 108 is 2024-12 */
const m = (ym) => { const [y, mo] = ym.split('-').map(Number); return (y - START_YEAR) * 12 + (mo - 1) - START_MONTH; };
const STARTUPS = Object.freeze([['OpenAI', '2015-12'], ['Anthropic', '2021-01'], ['xAI', '2023-01'], ['Mistral AI', '2023-04']]);
const LINKS = Object.freeze([
  ['Andreessen Horowitz (a16z)', 'OpenAI', '2019-07'], ['Andreessen Horowitz (a16z)', 'xAI', '2023-07'], ['Andreessen Horowitz (a16z)', 'Mistral AI', '2024-02'],
  ['Microsoft', 'OpenAI', '2019-07'], ['Microsoft', 'Mistral AI', '2024-12'],
  ['Lightspeed Venture Partners', 'Mistral AI', '2023-06'], ['Lightspeed Venture Partners', 'Anthropic', '2023-12'],
  ['Nvidia', 'OpenAI', '2023-01'], ['Nvidia', 'Mistral AI', '2024-06'],
  ['Salesforce Ventures', 'Anthropic', '2023-12'], ['Salesforce Ventures', 'Mistral AI', '2024-06'],
  ['General Catalyst', 'Anthropic', '2023-12'], ['General Catalyst', 'Mistral AI', '2024-02'],
]);
const LABELS = Object.freeze({ 'Andreessen Horowitz (a16z)': 'a16z', 'Lightspeed Venture Partners': 'Lightspeed', 'Salesforce Ventures': 'Salesforce V.' });
const monthLabel = (index) => { const t = START_MONTH + index; return `${MONTH_NAMES[((t % 12) + 12) % 12]} ${START_YEAR + Math.floor(t / 12)}`; };

function buildGraph() {
  const nodes = new Map();
  const add = (id, type, since, i) => nodes.set(id, { id, type, since, x: W / 2 + Math.cos(i) * 90, y: H / 2 + Math.sin(i) * 70, vx: 0, vy: 0 });
  STARTUPS.forEach(([name, founded], i) => add(name, 'startup', m(founded), i));
  const links = LINKS.map(([investor, startup, date]) => ({ source: investor, target: startup, at: m(date) }));
  links.forEach((link, i) => { if (!nodes.has(link.source)) add(link.source, 'investor', link.at, i + 5); else nodes.get(link.source).since = Math.min(nodes.get(link.source).since, link.at); });
  return { nodes: [...nodes.values()], byId: nodes, links };
}

function step(graph, now) {
  const vis = graph.nodes.filter((n) => n.since <= now);
  const live = graph.links.filter((l) => l.at <= now);
  vis.forEach((a) => {
    vis.forEach((b) => {
      if (a === b) return;
      const dx = a.x - b.x; const dy = a.y - b.y; const d2 = Math.max(dx * dx + dy * dy, 80);
      const f = 6500 / d2; const d = Math.sqrt(d2);
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
    });
    a.vx += (W / 2 - a.x) * 0.006; a.vy += (H / 2 - a.y) * 0.006;
  });
  live.forEach((l) => {
    const a = graph.byId.get(l.source); const b = graph.byId.get(l.target);
    const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; const pull = (d - 120) * 0.02;
    a.vx += (dx / d) * pull; a.vy += (dy / d) * pull; b.vx -= (dx / d) * pull; b.vy -= (dy / d) * pull;
  });
  vis.forEach((n) => {
    if (n.held) { n.vx = 0; n.vy = 0; return; }
    n.vx *= 0.82; n.vy *= 0.82;
    n.x = clamp(n.x + n.vx, 36, W - 36); n.y = clamp(n.y + n.vy, 16, H - 30);
  });
  return vis.reduce((sum, n) => sum + Math.abs(n.vx) + Math.abs(n.vy), 0);
}

function init() {
  const svg = document.getElementById('vv-svg');
  const slider = document.getElementById('vv-date');
  if (!svg || !slider) return;
  const graph = buildGraph();
  const out = document.getElementById('vv-out');
  const read = document.getElementById('vv-read');
  const lineEls = graph.links.map((l) => svg.appendChild(svgEl('line', { class: 'link' })));
  const nodeEls = new Map();
  graph.nodes.forEach((n) => {
    const g = svgEl('g', { class: `vn ${n.type}`, tabindex: 0, role: 'img' });
    g.append(svgEl('circle', { r: n.type === 'startup' ? 13 : 7 }));
    const t = svgEl('text', { y: n.type === 'startup' ? 26 : 19, 'text-anchor': 'middle' });
    t.textContent = LABELS[n.id] || n.id;
    g.append(t);
    nodeEls.set(n.id, g); svg.append(g);
    g.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault(); n.x = clamp(n.x + d[0] * KEY_STEP, 36, W - 36); n.y = clamp(n.y + d[1] * KEY_STEP, 16, H - 30); draw(); kick();
    });
    g.addEventListener('pointerdown', (e) => {
      g.setPointerCapture(e.pointerId); n.held = true;
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', release, { once: true });
    });
    const move = (e) => {
      const box = svg.getBoundingClientRect();
      n.x = clamp(((e.clientX - box.left) / box.width) * W, 20, W - 20); n.y = clamp(((e.clientY - box.top) / box.height) * H, 12, H - 30);
      draw(); kick();
    };
    const release = () => { n.held = false; g.removeEventListener('pointermove', move); kick(); };
  });

  const now = () => Number(slider.value);
  function draw() {
    const t = now();
    graph.links.forEach((l, i) => {
      const a = graph.byId.get(l.source); const b = graph.byId.get(l.target); const on = l.at <= t;
      lineEls[i].style.display = on ? '' : 'none';
      lineEls[i].setAttribute('x1', a.x.toFixed(1)); lineEls[i].setAttribute('y1', a.y.toFixed(1));
      lineEls[i].setAttribute('x2', b.x.toFixed(1)); lineEls[i].setAttribute('y2', b.y.toFixed(1));
    });
    let starts = 0; let invs = 0;
    graph.nodes.forEach((n) => {
      const el = nodeEls.get(n.id); const on = n.since <= t;
      el.style.display = on ? '' : 'none';
      el.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
      el.setAttribute('aria-label', `${n.id}, ${n.type}`);
      if (on) { if (n.type === 'startup') starts += 1; else invs += 1; }
    });
    const rounds = graph.links.filter((l) => l.at <= t).length;
    out.textContent = monthLabel(t);
    read.replaceChildren(htmlEl('p', {}, `${starts} startup${starts === 1 ? '' : 's'}, ${invs} investor${invs === 1 ? '' : 's'}, ${rounds} first-funding link${rounds === 1 ? '' : 's'} shown.`));
  }

  let frame = 0; let visible = false;
  function loop() {
    frame = 0;
    const energy = step(graph, now()); draw();
    if (visible && energy > 0.15) frame = requestAnimationFrame(loop);
  }
  function kick() { if (!reducedMotion() && visible && !frame) frame = requestAnimationFrame(loop); }
  slider.addEventListener('input', () => { if (reducedMotion()) { for (let i = 0; i < 160; i += 1) step(graph, now()); } draw(); kick(); });

  for (let i = 0; i < 260; i += 1) step(graph, now()); // settled start, also the reduced-motion end state
  draw();
  whileInView(svg, () => { visible = true; kick(); }, () => { visible = false; cancelAnimationFrame(frame); frame = 0; });
}

initProject();
init();
