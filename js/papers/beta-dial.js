/**
 * The beta dial: an illustration of L = E[log p(x|z)] - beta * KL(q(z|x) || p(z)).
 * The geometry below is a made-up rule that shows the direction of the effect.
 * It is not computed from the trained model.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const CLUSTERS = 8;
const BASE_RADIUS = 3.1; // where cluster means sit when beta is 0
const MAX_BETA = 4;
const BAND_LOW = 0.3;
const BAND_HIGH = 1.5;

/** Posterior width: small at beta 0, approaches the prior width of 1. */
export function posteriorSigma(beta) {
  return 0.14 + 0.86 * (beta / (beta + 0.6));
}

/** Distance of cluster means from the origin: collapses toward the prior mean. */
export function meanRadius(beta) {
  return BASE_RADIUS / (1 + 0.9 * beta);
}

function describe(beta) {
  if (beta < BAND_LOW) return 'Almost no pull toward the prior. Posteriors are narrow and far apart, which favours sharp reconstructions but leaves gaps between digits.';
  if (beta <= BAND_HIGH) return 'A balance. Posteriors overlap and stay close to the prior, so the latent space is smoother to move through.';
  return 'Strong pull toward the prior. Posteriors overlap heavily, the space is smooth, and reconstructions get blurrier.';
}

function buildCircles(group) {
  return Array.from({ length: CLUSTERS }, (_, i) => {
    const el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('class', 'post');
    el.style.setProperty('--k', String(i));
    group.append(el);
    return { el, angle: (i / CLUSTERS) * Math.PI * 2 + Math.PI / 8 };
  });
}

export function initBetaDial() {
  const range = document.getElementById('beta-range');
  const group = document.getElementById('posteriors');
  if (!range || !group) return;
  const out = document.getElementById('beta-out');
  const read = document.getElementById('beta-read');
  const wRecon = document.getElementById('w-recon');
  const wKl = document.getElementById('w-kl');
  const wKlNum = document.getElementById('w-kl-n');
  const circles = buildCircles(group);

  const render = () => {
    const beta = Number(range.value);
    const r = meanRadius(beta);
    const sigma = posteriorSigma(beta);
    circles.forEach(({ el, angle }) => {
      el.setAttribute('cx', (Math.cos(angle) * r).toFixed(3));
      el.setAttribute('cy', (Math.sin(angle) * r).toFixed(3));
      el.setAttribute('r', (2 * sigma).toFixed(3));
    });
    const share = Math.max(1, beta);
    wRecon.style.setProperty('--w', String(1 / share));
    wKl.style.setProperty('--w', String(beta / share));
    wKlNum.textContent = beta.toFixed(1);
    out.textContent = beta.toFixed(1);
    range.setAttribute('aria-valuetext', `beta ${beta.toFixed(1)}`);
    read.textContent = describe(beta);
  };

  range.addEventListener('input', render);
  render();
}
