/**
 * mountLibrary(host, { bus, engine }): the track list. The selected row follows
 * engine.getSelection(); a click emits 'select'; Load 1 and Load 2 press m.load1 and m.load2.
 */
import { emit, emitControl, on } from '../controls.js';
import { formatClock } from './svg.js';

const REFRESH_MS = 750;
const BROWSE_IDS = Object.freeze(['m.browse', 'm.load1', 'm.load2']);
const COLUMNS = Object.freeze([
  ['#', 'num col-index'], ['Title', ''], ['Artist', 'col-artist'], ['BPM', 'num'],
  ['Key', 'col-key'], ['Time', 'num col-time'], ['Decks', 'col-decks'],
]);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cell(className, content) {
  const td = el('td', className);
  if (content instanceof Node) td.append(content);
  else td.textContent = content;
  return td;
}

function keyCell(track) {
  const wrap = el('span', 'key-cell');
  const match = /^(\d{1,2})[AB]$/i.exec(track.camelot ?? '');
  if (match) {
    const chip = el('span', 'key-chip', track.camelot.toUpperCase());
    chip.style.setProperty('--hue', String((Number(match[1]) - 1) * 30));
    wrap.append(chip);
  }
  if (track.key) wrap.append(el('span', 'key-name', track.key));
  return wrap;
}

function buildHead() {
  const head = el('div', 'library-head');
  const title = el('h2', '', 'Library');
  title.id = 'library-title';
  const actions = el('div', 'library-actions');
  for (const deck of [1, 2]) {
    const button = el('button', 'lib-btn', `Load ${deck}`);
    button.type = 'button';
    button.dataset.load = String(deck);
    actions.append(button);
  }
  head.append(title, actions);
  return { head, actions };
}

function buildTable() {
  const table = el('table', 'library-table');
  const headRow = el('tr');
  COLUMNS.forEach(([label, className]) => headRow.append(el('th', className, label)));
  const thead = el('thead');
  thead.append(headRow);
  const tbody = el('tbody');
  table.append(thead, tbody);
  return { table, thead, tbody };
}

/** One row. onPick(index) selects it; onStep(index, +1 | -1) moves selection with the arrow keys. */
function buildRow(track, index, { onPick, onStep }) {
  const row = el('tr', 'track-row');
  const pickButton = el('button', 'row-pick', track.title);
  pickButton.type = 'button';
  pickButton.addEventListener('click', () => onPick(index));
  pickButton.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step || !onStep(index, step)) return;
    event.preventDefault();
  });
  row.addEventListener('click', () => onPick(index));
  row.append(
    cell('num col-index', String(index + 1)),
    cell('', pickButton),
    cell('col-artist', track.artist ?? ''),
    cell('num', Number(track.bpm).toFixed(1)),
    cell('col-key', keyCell(track)),
    cell('num col-time', formatClock(track.duration, 0)),
    cell('col-decks', el('span', 'deck-tags')),
  );
  return row;
}

/** Shows which deck holds this track. Rewrites the tags only when they changed. */
function renderDeckTags(row, trackId, state) {
  const tags = row.querySelector('.deck-tags');
  const holders = (state?.decks ?? []).map((deck, i) => ({ i, deck })).filter(({ deck }) => deck.track?.id === trackId);
  const signature = holders.map(({ i, deck }) => `${i}${deck.playing ? 'p' : ''}`).join();
  if (tags.dataset.sig === signature) return;
  tags.dataset.sig = signature;
  tags.replaceChildren(...holders.map(({ i, deck }) => {
    const tag = el('span', deck.playing ? 'deck-tag is-playing' : 'deck-tag', String(i + 1));
    tag.title = `On deck ${i + 1}${deck.playing ? ', playing' : ''}`;
    return tag;
  }));
}

/** Scrolls the list, not the page, so the selected row is visible below the sticky header. */
function revealRow(scroller, thead, row) {
  const box = scroller.getBoundingClientRect();
  const rect = row.getBoundingClientRect();
  const top = box.top + thead.getBoundingClientRect().height;
  if (rect.top < top) scroller.scrollTop -= top - rect.top;
  else if (rect.bottom > box.bottom) scroller.scrollTop += rect.bottom - box.bottom;
}

function readEngine(engine) {
  try {
    return { tracks: engine.getTracks() ?? [], selection: engine.getSelection(), state: engine.getState() };
  } catch (error) {
    console.error('mix: library could not read the engine', error);
    return { tracks: [], selection: -1, state: null };
  }
}

function setSelected(row, selected) {
  row.classList.toggle('is-selected', selected);
  if (selected) row.setAttribute('aria-current', 'true');
  else row.removeAttribute('aria-current');
}

export function mountLibrary(host, { bus, engine }) {
  const { head, actions } = buildHead();
  const { table, thead, tbody } = buildTable();
  const scroller = el('div', 'library-scroll');
  scroller.append(table);
  host.setAttribute('aria-labelledby', 'library-title');
  host.replaceChildren(head, scroller);
  let rows = [];
  let listKey = '';
  let queued = false;

  const rowHandlers = {
    onPick: (index) => emit(bus, 'select', { index }),
    onStep(index, step) {
      if (!rows[index + step]) return false;
      emit(bus, 'select', { index: index + step });
      rows[index + step].querySelector('.row-pick').focus();
      return true;
    },
  };

  function refresh() {
    queued = false;
    const { tracks, selection, state } = readEngine(engine);
    const key = tracks.map((track) => track.id).join('|');
    if (key !== listKey) {
      listKey = key;
      rows = tracks.map((track, index) => buildRow(track, index, rowHandlers));
      tbody.replaceChildren(...rows);
    }
    rows.forEach((row, index) => {
      const selected = index === selection;
      if (row.classList.contains('is-selected') !== selected) {
        setSelected(row, selected);
        if (selected) revealRow(scroller, thead, row);
      }
      renderDeckTags(row, tracks[index].id, state);
    });
  }

  /** Engine listeners run in the same dispatch, so read after it finishes. */
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(refresh);
  }

  actions.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button[data-load]') : null;
    if (!button) return;
    const id = `m.load${button.dataset.load}`;
    const source = event.detail === 0 ? 'keyboard' : 'pointer';
    emitControl(bus, id, true, source);
    emitControl(bus, id, false, source);
  });

  const unsubscribe = [
    on(bus, 'select', schedule),
    on(bus, 'engine', schedule),
    on(bus, 'control', ({ id }) => BROWSE_IDS.includes(id) && schedule()),
  ];
  const timer = setInterval(() => {
    if (!document.hidden) refresh();
  }, REFRESH_MS);
  refresh();
  return {
    refresh,
    dispose() {
      clearInterval(timer);
      unsubscribe.forEach((off) => off());
      host.replaceChildren();
    },
  };
}
