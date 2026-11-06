/* DRAFT (anime.js 4): the desk monitor tells "I build it, then I break it to see what holds" with
   motion, not test output. Every character is its own span; one paused anime.js timeline is
   seeked by scroll progress, so it scrubs both ways.
   - Build (0-50%): characters drop in one after another, typed, with a cyan cursor-glow on the
     line being written.
   - Break (54-72%): the code shatters out from the cursor: characters fly, spin and go red, the
     screen flickers.
   - Holds (74-100%): the pieces snap back in place (expo ease, no bounce); the lines that hold
     light up teal top to bottom; two lines that didn't hold drop out and fade. */
import { CODE, IMG, QUAD, BOX, homography } from './code-screen.js';

const ANIME_URL = 'https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.esm.min.js';
const T = 1000; /* timeline length, ms; seek(p * T) */
const BUILD = [0, 500];
const BREAK = [540, 720];
const HOLD = [740, 1000];
const DROP_LINES = new Set([2, 8]); /* super().__init__() and the comment: they don't hold */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* Deterministic pseudo-random per character, so a scrub always shatters the same way. */
function rand(i, k) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function createAnimeCodeScreen(plate) {
  const img = plate.querySelector('img');
  const screen = el('div', 'hx-code hx-code-anime');
  screen.setAttribute('aria-hidden', 'true');
  screen.style.width = `${BOX.w}px`;
  screen.style.height = `${BOX.h}px`;
  const tabs = el('div', 'hx-code-tabs');
  tabs.append(el('span', 'on', 'listener.py'), el('span', '', 'train.py'), el('span', '', 'eval.ipynb'));
  const body = el('div', 'hx-code-body');
  const gutter = el('div', 'hx-code-gutter');
  const pre = el('pre', 'hx-code-pre');
  body.append(gutter, pre);
  const flash = el('div', 'hx-code-flash');
  screen.append(tabs, body, flash);
  plate.append(screen);

  /* Lines of character spans. */
  const lines = [[]];
  let lineEl = el('div', 'hx-code-line');
  pre.append(lineEl);
  CODE.forEach(([kind, text]) => {
    const t = text ?? kind;
    const cls = `tk-${text != null ? kind : 'p'}`;
    for (const ch of t) {
      if (ch === '\n') {
        lineEl = el('div', 'hx-code-line');
        pre.append(lineEl);
        lines.push([]);
        continue;
      }
      const s = el('span', `hx-ch ${cls}`, ch);
      lineEl.append(s);
      lines[lines.length - 1].push(s);
    }
  });
  if (!lines[lines.length - 1].length) { lines.pop(); pre.lastChild.remove(); }
  const lineEls = [...pre.children];
  /* Blank lines keep their height. */
  lineEls.forEach((l) => { if (!l.childNodes.length) l.textContent = ' '; });
  gutter.textContent = lineEls.map((_, i) => i + 1).join('\n');
  const chars = lines.flat();

  function place() {
    const bw = img.offsetWidth, bh = img.offsetHeight;
    if (!bw || !bh) return;
    const cs = getComputedStyle(img);
    let sx = bw / IMG.w, sy = bh / IMG.h, ox = 0, oy = 0;
    if (cs.objectFit === 'cover') {
      const s = Math.max(bw / IMG.w, bh / IMG.h);
      sx = sy = s;
      const [px, py] = cs.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
      ox = (bw - IMG.w * s) * px;
      oy = (bh - IMG.h * s) * py;
    }
    const q = QUAD.map(([x, y]) => [img.offsetLeft + ox + x * sx, img.offsetTop + oy + y * sy]);
    screen.style.transform = homography(BOX.w, BOX.h, q);
  }
  place();
  window.addEventListener('resize', place);
  if (!img.complete) img.addEventListener('load', place, { once: true });

  let tl = null;
  let pending = 0;
  import(ANIME_URL).then(({ createTimeline, stagger }) => {
    tl = createTimeline({ autoplay: false, defaults: { ease: 'linear' } });
    const per = (BUILD[1] - BUILD[0]) / chars.length;
    /* Build: typed in order, each character drops 6px and fades in. */
    tl.add(chars, {
      opacity: [0, 1], y: [-6, 0], duration: 40, ease: 'outQuad',
      delay: stagger(per),
    }, BUILD[0]);
    /* The line being written glows; one window per line, in step with its characters. */
    let at = BUILD[0];
    lines.forEach((ln, i) => {
      const len = Math.max(1, ln.length) * per;
      tl.add(lineEls[i], { backgroundColor: ['rgba(92,225,214,0)', 'rgba(92,225,214,0.10)'], duration: 1 }, at)
        .add(lineEls[i], { backgroundColor: 'rgba(92,225,214,0)', duration: 60 }, at + len);
      at += len;
    });
    /* Break: shatter out from the end of the code (where the cursor is), red, with a flicker. */
    const dur = BREAK[1] - BREAK[0];
    tl.add(chars, {
      x: (_, i) => (rand(i, 1) - 0.5) * 520,
      y: (_, i) => (rand(i, 2) - 0.25) * 360,
      rotate: (_, i) => (rand(i, 3) - 0.5) * 540,
      color: '#ff3b30',
      opacity: (_, i) => 0.35 + rand(i, 4) * 0.65,
      duration: dur * 0.7, ease: 'outExpo',
      delay: stagger(dur * 0.3 / chars.length, { from: 'last' }),
    }, BREAK[0]);
    tl.add(flash, { opacity: [0, 0.22, 0, 0.12, 0], duration: dur * 0.6 }, BREAK[0]);
    /* Holds: snap back (no overshoot), held lines light teal top to bottom, the rest drop out. */
    const hd = HOLD[1] - HOLD[0];
    const keep = lines.filter((_, i) => !DROP_LINES.has(i)).flat();
    const drop = lines.filter((_, i) => DROP_LINES.has(i)).flat();
    tl.add(keep, {
      x: 0, y: 0, rotate: 0, opacity: 1, color: '#5ce1d6', duration: hd * 0.45, ease: 'outExpo',
      delay: stagger(hd * 0.2 / keep.length),
    }, HOLD[0]);
    tl.add(keep, { color: (t) => getComputedStyle(t).getPropertyValue('--tk').trim() || '#c9d1d9', duration: hd * 0.25 }, HOLD[0] + hd * 0.7);
    tl.add(drop, { y: 260, rotate: (_, i) => (rand(i, 5) - 0.5) * 90, opacity: 0, duration: hd * 0.5, ease: 'inQuad' }, HOLD[0]);
    tl.add(lineEls.filter((_, i) => DROP_LINES.has(i)), { height: 0, duration: hd * 0.3, ease: 'inOutQuad' }, HOLD[0] + hd * 0.45);
    tl.seek(pending * T);
  }).catch((e) => console.warn(`hero: anime.js code screen unavailable (${e.message})`));

  function render(p) {
    pending = p;
    if (tl) tl.seek(p * T);
  }
  return { render, place };
}
