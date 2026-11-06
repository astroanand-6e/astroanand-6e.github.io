/* The desk monitor comes alive: a small editor is pinned onto the screen in desk.webp with a CSS
   homography (matrix3d from the screen's four corners), and the code types itself as the visitor
   scrolls. Then the beat's line plays out on screen: build it (typing), break it (a red failing
   test), see what holds (green). render(p) is a pure function of p (0..1), so scrubbing backwards
   un-types it. DOM text, not canvas, so it stays sharp at any zoom. */

/* Screen corners in desk.webp pixels (1184x896): TL, TR, BR, BL, just inside the bezel. */
export const IMG = Object.freeze({ w: 1184, h: 896 });
export const QUAD = Object.freeze([[690, 233], [1000, 235], [998, 438], [680, 431]]);
export const BOX = Object.freeze({ w: 620, h: 410 }); /* the editor's own layout size, in CSS px */

export const CODE = [
  ['k', 'class'], [' '], ['t', 'Listener'], ['p', '(nn.Module):'], ['\n'],
  ['    '], ['k', 'def'], [' '], ['f', '__init__'], ['p', '(self, audio, text):'], ['\n'],
  ['        '], ['p', 'super().__init__()'], ['\n'],
  ['        '], ['p', 'self.audio = audio.'], ['f', 'freeze'], ['p', '()'], ['\n'],
  ['        '], ['p', 'self.text = text.'], ['f', 'freeze'], ['p', '()'], ['\n'],
  ['        '], ['p', 'self.bridge = nn.'], ['f', 'Linear'], ['p', '('], ['n', '1024'], ['p', ', '], ['n', '2560'], ['p', ')'], ['\n'],
  ['\n'],
  ['    '], ['k', 'def'], [' '], ['f', 'forward'], ['p', '(self, wav, prompt):'], ['\n'],
  ['        '], ['c', '# hear it, then say it'], ['\n'],
  ['        '], ['p', 'a = self.bridge(self.audio(wav))'], ['\n'],
  ['        '], ['k', 'return'], [' '], ['p', 'self.text(prompt, prefix=a)'], ['\n'],
];
const TYPE_END = 0.62; /* fraction of the scene's code segment spent typing */
const FAIL_AT = 0.7;
const PASS_AT = 0.86;

/* Map the unit square to a quad: the 3x3 projective matrix, as CSS matrix3d. */
export function homography(w, h, q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const k = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3, f = y0;
  /* pre-scale from the box (w,h) to the unit square */
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(',')})`;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function createCodeScreen(plate) {
  const img = plate.querySelector('img');
  const screen = el('div', 'hx-code');
  screen.setAttribute('aria-hidden', 'true');
  screen.style.width = `${BOX.w}px`;
  screen.style.height = `${BOX.h}px`;
  const tabs = el('div', 'hx-code-tabs');
  tabs.append(el('span', 'on', 'listener.py'), el('span', '', 'train.py'), el('span', '', 'eval.ipynb'));
  const body = el('div', 'hx-code-body');
  const gutter = el('div', 'hx-code-gutter');
  const pre = el('pre', 'hx-code-pre');
  body.append(gutter, pre);
  const term = el('div', 'hx-code-term');
  const termLine = el('span', '', '');
  term.append(el('span', 'dim', '$ pytest -q  '), termLine);
  screen.append(tabs, body, term);
  plate.append(screen);

  /* One span per character group, so typing is a count of visible characters. */
  const chars = [];
  let lines = 1;
  CODE.forEach(([kind, text]) => {
    const t = text ?? kind; /* one-element entries are raw whitespace */
    const span = el('span', `tk-${text != null ? kind : 'p'}`);
    pre.append(span);
    for (const ch of t) chars.push({ span, ch });
    if (t === '\n') lines += 1;
  });
  gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  const caret = el('span', 'hx-code-caret');

  function place() {
    /* The img's layout box (transforms excluded) inside the plate, then the drawn image inside
       it: object-fit cover with object-position on phones, a plain fill on desktop. */
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

  let shown = -1;
  let state = '';
  function render(p) {
    const n = Math.round(chars.length * Math.min(1, p / TYPE_END));
    if (n !== shown) {
      const texts = new Map();
      chars.forEach(({ span }) => texts.set(span, ''));
      for (let i = 0; i < n; i += 1) texts.set(chars[i].span, texts.get(chars[i].span) + chars[i].ch);
      texts.forEach((t, span) => { span.textContent = t; });
      const last = n > 0 ? chars[n - 1].span : pre.firstChild;
      last.after(caret);
      shown = n;
    }
    const next = p >= PASS_AT ? 'pass' : p >= FAIL_AT ? 'fail' : p >= TYPE_END ? 'run' : '';
    if (next !== state) {
      state = next;
      screen.dataset.state = state;
      termLine.textContent = { '': '', run: 'running 12 tests…', fail: '1 failed: shapes (1024) != (2560)', pass: '12 passed' }[state];
    }
  }
  render(0);
  return { render, place };
}
