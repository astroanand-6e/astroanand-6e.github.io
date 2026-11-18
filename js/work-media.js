/* Work section: a small live figure on every card, the filter chips and the "How I build" replay.
   Figures are inline SVG drawn here so they follow the theme tokens; motion is CSS, started when a card
   scrolls into view (.in-view) and switched off under prefers-reduced-motion (css/work.css).
   Numbers shown as data come from the project's own README (CALM). Everything else is an illustration
   and says so in its accessible label. */

const NS = 'http://www.w3.org/2000/svg';

/* CALM results, FMA-Medium (16 genres), fine-tuned accuracy, from the Music_genre_classification README. */
const CALM_RESULTS = Object.freeze([
  ['CALM', 83.9],
  ['CLAP (Microsoft)', 74.78],
  ['CLAP (LAION)', 73.32],
  ['MERT-330M', 73.26],
  ['AST', 71.72],
]);

const svg = (viewBox, body, label) =>
  `<svg viewBox="${viewBox}" xmlns="${NS}" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;

function calm() {
  const rowH = 30;
  const x0 = 132;
  const w = 228;
  const rows = CALM_RESULTS.map(([name, acc], i) => {
    const y = 10 + i * rowH;
    const bw = (acc / 100) * w;
    const hot = i === 0 ? ' is-hot' : '';
    return `<text class="wm-label${hot}" x="${x0 - 10}" y="${y + 13}" text-anchor="end">${name}</text>`
      + `<rect class="wm-track" x="${x0}" y="${y}" width="${w}" height="18" rx="2"/>`
      + `<rect class="wm-bar${hot}" x="${x0}" y="${y}" width="${bw.toFixed(1)}" height="18" rx="2" style="--i:${i}"/>`
      + `<text class="wm-value${hot}" x="${x0 + bw + 6}" y="${y + 13}">${acc.toFixed(1)}%</text>`;
  }).join('');
  const label = `Bar chart, FMA-Medium 16-genre accuracy: ${CALM_RESULTS.map(([n, a]) => `${n} ${a}%`).join(', ')}.`;
  return svg('0 0 400 160', rows, label);
}

function astro() {
  const bars = Array.from({ length: 28 }, (_, i) => {
    const h = 10 + Math.round(34 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)));
    return `<rect class="wm-wave" x="${34 + i * 12}" y="${56 - h / 2}" width="6" height="${h}" rx="3" style="--i:${i}"/>`;
  }).join('');
  const lines = '<text class="wm-line wm-native" x="200" y="128" text-anchor="middle">कल meeting है, slides भेज देना</text>'
    + '<text class="wm-line wm-roman" x="200" y="128" text-anchor="middle">kal meeting hai, slides bhej dena</text>';
  return svg('0 0 400 160', bars + lines, 'Illustration: a voice waveform becomes a Hinglish sentence, shown in Devanagari and then romanized.');
}

function coronary() {
  const tree = 'M60 140 C 110 110, 140 100, 190 82 S 280 50, 340 22 M190 82 C 210 110, 250 130, 300 140 M150 98 C 150 70, 130 40, 120 16 M262 60 C 290 78, 320 90, 360 88';
  const body = `<path class="wm-vessel" d="${tree}"/><path class="wm-mask" d="${tree}" pathLength="1"/>`
    + '<circle class="wm-prompt" cx="60" cy="140" r="5"/><circle class="wm-prompt-ring" cx="60" cy="140" r="5"/>';
  return svg('0 0 400 160', body, 'Illustration: a click on a vessel grows a segmentation mask along the coronary tree.');
}

function cdss() {
  const boxes = [['Proposer', 24], ['Skeptic', 148], ['Safety harness', 272]].map(([t, x]) =>
    `<rect class="wm-box" x="${x}" y="36" width="104" height="40" rx="3"/><text class="wm-box-t" x="${x + 52}" y="61" text-anchor="middle">${t}</text>`).join('');
  const links = '<path class="wm-link" d="M128 56 H148 M252 56 H272"/>'
    + '<path class="wm-link wm-escalate" d="M324 76 V118 H214"/>'
    + '<text class="wm-note" x="206" y="122" text-anchor="end">7.1% to a clinician</text>';
  const dots = [0, 1, 2].map((i) => `<circle class="wm-dot" cx="24" cy="56" r="4" style="--i:${i}"/>`).join('');
  return svg('0 0 400 160', dots + links + boxes, 'Diagram: a Proposer agent, a Skeptic agent and a Safety harness in sequence; 7.1% of cases are handed to a clinician.');
}

function resformer() {
  let d = 'M0 70';
  for (let k = 0; k < 6; k += 1) {
    const o = k * 70;
    d += ` L${o + 20} 70 L${o + 26} 62 L${o + 32} 70 L${o + 38} 70 L${o + 42} 30 L${o + 47} 102 L${o + 52} 70 L${o + 62} 70 L${o + 68} 60 L${o + 70} 70`;
  }
  const body = '<clipPath id="wm-ecg-clip"><rect x="20" y="20" width="200" height="100"/></clipPath>'
    + `<g clip-path="url(#wm-ecg-clip)"><path class="wm-ecg" d="${d}"/></g>`
    + '<path class="wm-link" d="M226 70 H246"/>'
    + '<rect class="wm-box" x="246" y="36" width="70" height="30" rx="3"/><text class="wm-box-t" x="281" y="56" text-anchor="middle">ResNet</text>'
    + '<rect class="wm-box" x="246" y="76" width="70" height="30" rx="3"/><text class="wm-box-t" x="281" y="96" text-anchor="middle">Encoder</text>'
    + '<path class="wm-link" d="M316 70 H334"/>'
    + '<text class="wm-out" x="340" y="68">AF</text><text class="wm-note" x="340" y="86">or normal</text>';
  return svg('0 0 400 160', body, 'Diagram: an ECG trace feeds a ResNet and a Transformer encoder that classify atrial fibrillation or normal rhythm.');
}

function betaVae() {
  const blobs = [[130, 66, 0], [205, 46, 1], [280, 84, 2], [170, 108, 3], [250, 118, 4]].map(([x, y, i]) =>
    `<ellipse class="wm-blob" cx="${x}" cy="${y}" rx="34" ry="22" style="--i:${i}"/>`).join('');
  const axes = '<path class="wm-axis" d="M70 142 H350 M70 142 V14"/>'
    + '<text class="wm-note" x="350" y="156" text-anchor="end">z₁</text><text class="wm-note" x="56" y="22">z₂</text>';
  return svg('0 0 400 160', axes + blobs, 'Illustration: digit clusters as Gaussians in a two-dimensional latent space, drawn toward the prior as beta grows.');
}

function site() {
  const scenes = ['Intro', 'Palm', 'Eyes', 'Desk', 'Hand-off'];
  const w = 64;
  const cells = scenes.map((s, i) => `<rect class="wm-box" x="${24 + i * (w + 6)}" y="40" width="${w}" height="40" rx="2"/>`
    + `<text class="wm-box-t" x="${24 + i * (w + 6) + w / 2}" y="65" text-anchor="middle">${s}</text>`).join('');
  const body = cells + '<rect class="wm-head" x="24" y="28" width="2" height="64"/>'
    + '<text class="wm-note" x="24" y="120">GSAP scroll timeline · WebGL shaders · Three.js figures</text>';
  return svg('0 0 400 160', body, 'Diagram: the five hero scenes on one scroll timeline, with a playhead moving across them.');
}

const FIGURES = Object.freeze({ calm, astro, coronary, cdss, resformer, 'beta-vae': betaVae, site });

function drawFigures(root) {
  root.querySelectorAll('[data-media]').forEach((el) => {
    const draw = FIGURES[el.dataset.media];
    if (draw) el.innerHTML = draw();
  });
}

function watchInView(root) {
  const targets = root.querySelectorAll('.work-card, .build-replay');
  if (!('IntersectionObserver' in window)) {
    targets.forEach((c) => c.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.target.classList.toggle('in-view', e.isIntersecting));
  }, { threshold: 0.3 });
  targets.forEach((c) => io.observe(c));
}

function initFilter(root) {
  const group = root.querySelector('.work-filter');
  if (!group) return;
  const cards = [...root.querySelectorAll('.work-card')];
  const status = root.querySelector('.work-filter-status');
  group.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-filter]');
    if (!btn) return;
    const kind = btn.dataset.filter;
    group.querySelectorAll('button[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    let shown = 0;
    cards.forEach((card) => {
      const match = kind === 'all' || (card.dataset.kind || '').split(' ').includes(kind);
      card.hidden = !match;
      if (match) shown += 1;
    });
    if (status) status.textContent = `Showing ${shown} of ${cards.length} projects`;
  });
}

/* "How I build": lines type in once when the replay scrolls into view; the button plays it again. */
function initReplay(root) {
  const box = root.querySelector('.build-replay');
  if (!box) return;
  const lines = [...box.querySelectorAll('.term-line')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers = [];
  const play = () => {
    timers.forEach(clearTimeout);
    timers = [];
    lines.forEach((l) => l.classList.toggle('is-on', reduced));
    if (reduced) return;
    lines.forEach((l, i) => timers.push(setTimeout(() => l.classList.add('is-on'), 250 + i * 520)));
  };
  let played = false;
  const io = new IntersectionObserver((entries) => {
    if (!played && entries.some((e) => e.isIntersecting)) { played = true; play(); }
  }, { threshold: 0.4 });
  io.observe(box);
  box.querySelector('.term-replay')?.addEventListener('click', play);
}

export function initWork() {
  const root = document.getElementById('index');
  if (!root) return;
  drawFigures(root);
  watchInView(root);
  initFilter(root);
  initReplay(root);
}

initWork();
