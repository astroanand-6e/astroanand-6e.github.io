/** The "?" overlay: a modal dialog listing the desktop keys. */

const KEY_WORD = /^(\w|\?|Shift)$/;
const ROWS = Object.freeze([
  ['Play / pause', 'Q', 'P'],
  ['Cue', 'W', 'O'],
  ['Beat sync', 'E', 'I'],
  ['Shift (hold)', 'D', 'J'],
  ['Nudge back / forward (hold)', 'A S', 'K L'],
  ['Tempo down / up', 'Z X', 'N M'],
  ['Pads 1 to 8', '1 to 8', 'Shift + 1 to 8'],
]);
const NOTES = Object.freeze([
  ['Crossfader', { text: 'Left and right arrows. Hold Shift for bigger steps.' }],
  ['Beat FX on / off', { keys: 'F' }],
  ['Show or hide this map', { keys: '?' }],
]);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "A S" becomes two key caps, "1 to 8" two key caps around a word. */
function keyCaps(text) {
  const wrap = el('span', 'keycaps');
  for (const word of text.split(' ')) wrap.append(el(KEY_WORD.test(word) ? 'kbd' : 'span', '', word));
  return wrap;
}

function cell(content) {
  const td = el('td');
  td.append(content);
  return td;
}

function buildTable() {
  const table = el('table', 'keymap-table');
  const head = el('tr');
  ['Action', 'Deck 1', 'Deck 2'].forEach((label) => head.append(el('th', '', label)));
  table.append(head);
  for (const [action, one, two] of ROWS) {
    const row = el('tr');
    row.append(el('td', '', action), cell(keyCaps(one)), cell(keyCaps(two)));
    table.append(row);
  }
  return table;
}

function buildNotes() {
  const notes = el('dl', 'keymap-notes');
  for (const [term, detail] of NOTES) {
    const dd = el('dd');
    dd.append(detail.keys ? keyCaps(detail.keys) : document.createTextNode(detail.text));
    notes.append(el('dt', '', term), dd);
  }
  return notes;
}

export function buildKeymapDialog() {
  const dialog = el('dialog', 'keymap');
  dialog.setAttribute('aria-labelledby', 'keymap-title');
  const title = el('h2', 'keymap-title', 'Keyboard map');
  title.id = 'keymap-title';
  const close = el('button', 'keymap-close', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  const head = el('div', 'keymap-head');
  head.append(title, close);
  dialog.append(head, buildTable(), buildNotes());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}
