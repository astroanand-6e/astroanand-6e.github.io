/* Command palette. Self-initialising ES module: Cmd/Ctrl+K or "/" opens it.
   Items are rebuilt from the DOM each time it opens. Test hook: window.__palette. */

const SITE_ROOT = new URL('../', import.meta.url);
const TEXT_INPUT_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const TOAST_MS = 2500;
const GROUPS = ['Sections', 'Work', 'Papers', 'Actions', 'Links'];
const PREFERS_REDUCED = '(prefers-reduced-motion: reduce)';
const SEARCH_ICON =
  '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="5.25"/><path d="M12.5 12.5 17 17"/></svg>';

const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const state = { dialog: null, input: null, list: null, status: null, toast: null, toastTimer: 0, items: [], shown: [], active: 0, returnFocus: null, skipRestore: false };

const reducedMotion = () => window.matchMedia && window.matchMedia(PREFERS_REDUCED).matches;
const siteUrl = (path) => new URL(path, SITE_ROOT).href;
const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();

/* ---------- fuzzy matching ---------- */
function fuzzy(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const indices = [];
  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at === -1) return null;
    const boundary = at === 0 || /[\s\-_:/(]/.test(t[at - 1]);
    score += 1 + (at === prev + 1 ? 5 : 0) + (boundary ? 4 : 0) - Math.min(at - from, 6) * 0.1;
    indices.push(at);
    prev = at;
    from = at + 1;
  }
  if (t.startsWith(q)) score += 10;
  else if (t.includes(q)) score += 6;
  return { score: score - t.length * 0.02, indices };
}

function highlight(text, indices) {
  const frag = document.createDocumentFragment();
  const hit = new Set(indices);
  let run = '';
  let marked = false;
  const flush = () => {
    if (!run) return;
    const node = marked ? document.createElement('mark') : document.createTextNode(run);
    if (marked) node.textContent = run;
    frag.append(node);
    run = '';
  };
  [...text].forEach((ch, i) => {
    const isHit = hit.has(i);
    if (isHit !== marked) { flush(); marked = isHit; }
    run += ch;
  });
  flush();
  return frag;
}

/* ---------- actions ---------- */
function goTo(el) {
  if (!el) return;
  const hadTabindex = el.hasAttribute('tabindex');
  if (!hadTabindex) el.setAttribute('tabindex', '-1');
  el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
  if (!hadTabindex) el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
}

function navigate(href) {
  window.location.assign(href);
}

function openExternal(href) {
  const win = window.open(href, '_blank', 'noopener');
  if (!win) navigate(href);
}

function showToast(message) {
  const { toast } = state;
  if (!toast) return;
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  state.toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    toast.textContent = '';
  }, TOAST_MS);
}

async function copyEmail(address) {
  try {
    await navigator.clipboard.writeText(address);
    showToast('Email copied');
  } catch (error) {
    showToast('Could not copy. ' + address);
  }
}

function openHelp() {
  const help = document.getElementById('help');
  if (!help) return;
  if (help.showModal) { if (!help.open) help.showModal(); } else help.setAttribute('open', '');
}

/* ---------- item collection ---------- */
function collectItems() {
  const items = [];
  const seen = new Set();
  document.querySelectorAll('section[id]').forEach((section) => {
    if (section.closest('dialog')) return;
    const heading = section.querySelector('h2, h3');
    const label = clean(heading && heading.textContent);
    if (!label || seen.has(section.id)) return;
    seen.add(section.id);
    items.push({ group: 'Sections', label, run: () => goTo(section) });
  });
  document.querySelectorAll('.work-card h3').forEach((h3) => {
    const card = h3.closest('.work-card');
    const label = clean(h3.textContent);
    if (card && label) items.push({ group: 'Work', label, run: () => goTo(card) });
  });
  items.push({ group: 'Papers', label: 'Paper implementations', hint: 'Open', run: () => navigate(siteUrl('papers/')) });

  const mail = document.querySelector('a[href^="mailto:"]');
  const address = mail ? decodeURIComponent(mail.getAttribute('href').slice(7).split('?')[0]) : '';
  if (address) items.push({ group: 'Actions', label: 'Copy email', hint: address, run: () => copyEmail(address) });
  if (document.getElementById('theme-toggle')) {
    items.push({ group: 'Actions', label: 'Switch theme', hint: 'T', run: () => document.getElementById('theme-toggle').click() });
  }
  if (document.getElementById('help')) {
    items.push({ group: 'Actions', label: 'Keyboard shortcuts', hint: '?', run: openHelp });
  }

  items.push({ group: 'Links', label: 'Blog', run: () => navigate(siteUrl('blog/')) });
  items.push({ group: 'Links', label: 'Résumé (PDF)', run: () => openExternal(siteUrl('Anand_Resume.pdf')) });
  items.push({ group: 'Links', label: 'GitHub', external: true, run: () => openExternal('https://github.com/astroanand-6e') });
  items.push({ group: 'Links', label: 'Hugging Face', external: true, run: () => openExternal('https://huggingface.co/astroanand') });
  const linkedin = document.querySelector('a[href*="linkedin.com"]');
  if (linkedin) items.push({ group: 'Links', label: 'LinkedIn', external: true, run: () => openExternal(linkedin.href) });
  return items.map((item, i) => ({ ...item, id: `palette-opt-${i}` }));
}

/* ---------- rendering ---------- */
function filterItems(query) {
  if (!query.trim()) return state.items.map((item) => ({ item, indices: [] }));
  return state.items
    .map((item) => ({ item, match: fuzzy(query.trim(), item.label) }))
    .filter((row) => row.match)
    .sort((a, b) => b.match.score - a.match.score)
    .map((row) => ({ item: row.item, indices: row.match.indices }));
}

function buildRow(item, indices, index) {
  const row = document.createElement('li');
  row.id = item.id;
  row.className = 'palette-option';
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');
  row.dataset.index = String(index);
  const label = document.createElement('span');
  label.className = 'palette-label';
  label.append(highlight(item.label, indices));
  row.append(label);
  const hint = item.hint || (item.external ? '↗' : '');
  if (hint) {
    const kbd = document.createElement('span');
    kbd.className = 'palette-hint';
    kbd.textContent = hint;
    row.append(kbd);
  }
  return row;
}

function render() {
  const query = state.input.value;
  const rows = filterItems(query);
  const searching = Boolean(query.trim());
  const ordered = searching
    ? rows
    : GROUPS.flatMap((g) => rows.filter((r) => r.item.group === g));
  state.shown = [];
  state.list.replaceChildren();
  if (!ordered.length) {
    const empty = document.createElement('li');
    empty.className = 'palette-empty';
    empty.setAttribute('role', 'presentation');
    empty.textContent = `No results for “${query.trim()}”`;
    state.list.append(empty);
  }
  let currentGroup = null;
  const groupsInOrder = searching ? [] : GROUPS;
  const emit = (row) => {
    const li = buildRow(row.item, row.indices, state.shown.length);
    state.shown.push(row.item);
    return li;
  };
  if (searching) {
    ordered.forEach((row) => {
      const li = emit(row);
      li.dataset.group = row.item.group;
      state.list.append(li);
    });
  } else {
    groupsInOrder.forEach((group) => {
      const inGroup = ordered.filter((r) => r.item.group === group);
      if (!inGroup.length) return;
      const wrap = document.createElement('li');
      wrap.setAttribute('role', 'presentation');
      const heading = document.createElement('div');
      heading.className = 'palette-group';
      heading.id = `palette-group-${group.toLowerCase()}`;
      heading.setAttribute('role', 'presentation');
      heading.textContent = group;
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'group');
      ul.setAttribute('aria-labelledby', heading.id);
      ul.className = 'palette-group-list';
      inGroup.forEach((row) => ul.append(emit(row)));
      wrap.append(heading, ul);
      state.list.append(wrap);
      currentGroup = group;
    });
  }
  void currentGroup;
  state.status.textContent = state.shown.length ? `${state.shown.length} results` : 'No results';
  setActive(0, false);
}

function setActive(index, scroll = true) {
  const count = state.shown.length;
  state.active = count ? (index + count) % count : 0;
  state.list.querySelectorAll('[role="option"]').forEach((el) => {
    const on = Number(el.dataset.index) === state.active && count > 0;
    el.setAttribute('aria-selected', String(on));
    if (on && scroll) el.scrollIntoView({ block: 'nearest' });
  });
  const current = state.shown[state.active];
  if (current) state.input.setAttribute('aria-activedescendant', current.id);
  else state.input.removeAttribute('aria-activedescendant');
}

/* ---------- open / close ---------- */
function runItem(item) {
  if (!item) return;
  state.skipRestore = true;
  closePalette();
  state.skipRestore = false;
  item.run();
}

function openPalette() {
  const { dialog } = state;
  if (!dialog || dialog.open) return;
  const help = document.getElementById('help');
  if (help && help.open) return;
  state.returnFocus = document.activeElement;
  state.items = collectItems();
  state.input.value = '';
  render();
  dialog.showModal();
  state.input.focus();
}

function closePalette() {
  const { dialog } = state;
  if (!dialog || !dialog.open) return;
  dialog.close();
}

function onDialogClose() {
  const target = state.returnFocus;
  state.returnFocus = null;
  if (state.skipRestore) return;
  if (target && target.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
}

function onInputKeydown(event) {
  const keys = { ArrowDown: 1, ArrowUp: -1 };
  if (event.key in keys) {
    event.preventDefault();
    setActive(state.active + keys[event.key]);
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    setActive(event.key === 'Home' ? 0 : state.shown.length - 1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    runItem(state.shown[state.active]);
  }
}

function onGlobalKeydown(event) {
  if (event.defaultPrevented || event.isComposing) return;
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key === 'k') {
    event.preventDefault();
    if (state.dialog.open) closePalette(); else openPalette();
    return;
  }
  if (key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target && target.closest && target.closest(TEXT_INPUT_SELECTOR)) return;
  if (document.querySelector('dialog[open]')) return;
  event.preventDefault();
  openPalette();
}

/* ---------- construction ---------- */
function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

function kbd(text) {
  const node = el('kbd', 'kbd');
  node.textContent = text;
  return node;
}

function build() {
  const dialog = el('dialog', 'palette', { id: 'palette', 'aria-label': 'Command palette' });
  const head = el('div', 'palette-head');
  const icon = el('span', 'palette-icon', { 'aria-hidden': 'true' });
  icon.innerHTML = SEARCH_ICON;
  const label = el('label', 'palette-sr', { for: 'palette-input' });
  label.textContent = 'Search sections, work and actions';
  const input = el('input', 'palette-input', {
    id: 'palette-input', type: 'text', role: 'combobox', autocomplete: 'off', autocapitalize: 'off',
    spellcheck: 'false', 'aria-autocomplete': 'list', 'aria-expanded': 'true', 'aria-controls': 'palette-list',
    placeholder: 'Jump to a section, project or action',
  });
  head.append(icon, label, input, kbd('esc'));
  const list = el('ul', 'palette-list', { id: 'palette-list', role: 'listbox', 'aria-label': 'Results' });
  const status = el('div', 'palette-sr', { role: 'status', 'aria-live': 'polite' });
  const foot = el('div', 'palette-foot', { 'aria-hidden': 'true' });
  const pair = (keys, text) => {
    const span = el('span', 'palette-foot-item');
    keys.forEach((k) => span.append(kbd(k)));
    span.append(document.createTextNode(' ' + text));
    return span;
  };
  foot.append(pair(['↑', '↓'], 'move'), pair(['↵'], 'select'), pair(['esc'], 'close'));
  dialog.append(head, list, status, foot);

  const toast = el('div', 'palette-toast', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  document.body.append(dialog, toast);
  Object.assign(state, { dialog, input, list, status, toast });

  input.addEventListener('input', render);
  input.addEventListener('keydown', onInputKeydown);
  dialog.addEventListener('close', onDialogClose);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) return closePalette();
    const row = event.target.closest && event.target.closest('[role="option"]');
    if (row) runItem(state.shown[Number(row.dataset.index)]);
  });
  list.addEventListener('pointermove', (event) => {
    const row = event.target.closest && event.target.closest('[role="option"]');
    if (row && Number(row.dataset.index) !== state.active) setActive(Number(row.dataset.index), false);
  });
}

function wireTriggers() {
  document.querySelectorAll('[data-palette-trigger]').forEach((node) => {
    node.addEventListener('click', openPalette);
    if (!node.hasAttribute('aria-keyshortcuts')) node.setAttribute('aria-keyshortcuts', isMac ? 'Meta+K' : 'Control+K');
  });
}

function init() {
  if (window.__palette || !document.body) return;
  build();
  wireTriggers();
  document.addEventListener('keydown', onGlobalKeydown);
  window.__palette = { open: openPalette, close: closePalette, isMac };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
