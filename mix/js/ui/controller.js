/**
 * mountController(host, { bus, engine }): the virtual 2-deck controller.
 * Input goes out as control events; every control event, from any source, moves the
 * visuals (control-view.js). LEDs and the platters come from engine.getState() each
 * frame (render.js). Lessons ring controls with 'highlight' and zoom with 'focus'.
 */
import { on } from '../controls.js';
import { attachControlKeys } from './control-keys.js';
import { createControlView } from './control-view.js';
import { attachInteraction } from './interaction.js';
import { attachKeymap } from './keymap.js';
import { controlsMissingFromLayout } from './layout.js';
import { createLoop } from './loop.js';
import { createRenderer } from './render.js';
import { attachRings } from './rings.js';
import { buildUnit } from './unit.js';
import { createViewport } from './viewport.js';

const SECTION_LABELS = Object.freeze([['deck1', 'Deck 1'], ['mixer', 'Mixer'], ['deck2', 'Deck 2']]);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildFrame(host, svg) {
  const sectionSwitch = el('div', 'deck-switch');
  sectionSwitch.setAttribute('role', 'group');
  sectionSwitch.setAttribute('aria-label', 'Controller section');
  for (const [section, label] of SECTION_LABELS) {
    const button = el('button', '', label);
    button.type = 'button';
    button.dataset.section = section;
    sectionSwitch.append(button);
  }
  const keys = el('button', 'keys-btn', 'Keys ');
  keys.type = 'button';
  keys.setAttribute('aria-haspopup', 'dialog');
  keys.append(el('kbd', '', '?'));
  const toolbar = el('div', 'deck-toolbar');
  toolbar.append(sectionSwitch, keys);
  const frame = el('div', 'deck-frame');
  frame.append(el('div', 'deck-shadow'), svg);
  host.replaceChildren(toolbar, frame);
  return { frame, sectionSwitch, keys };
}

export function mountController(host, { bus, engine }) {
  const missing = controlsMissingFromLayout();
  if (missing.length) console.warn(`mix: controls without a place on the unit: ${missing.join(', ')}`);

  const { svg, parts, rings, body, meters, readout } = buildUnit();
  const { frame, sectionSwitch, keys } = buildFrame(host, svg);
  const view = createControlView({ parts, readout });
  const { getValue } = view;
  const viewport = createViewport({ svg, frame, switchEl: sectionSwitch });
  const ringing = attachRings({ svg, parts, rings, viewport });
  const pointer = attachInteraction({ svg, bus, parts, getValue });
  const controlKeys = attachControlKeys({ svg, bus, parts, getValue });
  const keymap = attachKeymap({ host, bus, getValue });
  const renderer = createRenderer({ engine, parts, meters, body, getValue });
  viewport.focusSection('deck1', { animate: false });

  const releaseAll = () => {
    pointer.releaseAll();
    controlKeys.releaseAll();
    keymap.releaseAll();
  };
  const onHidden = () => {
    if (document.hidden) releaseAll();
  };
  const unsubscribe = [
    on(bus, 'control', view.onControl),
    on(bus, 'highlight', ({ ids }) => ringing.setHighlight(ids)),
    on(bus, 'focus', ({ section }) => viewport.focusSection(section)),
  ];
  svg.addEventListener('contextmenu', (event) => event.preventDefault());
  keys.addEventListener('click', () => keymap.toggle());
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', onHidden);

  const loop = createLoop((now, dt) => {
    view.tick(dt);
    renderer.frame(now, dt);
  }, frame);

  return {
    focusSection: viewport.focusSection,
    dispose() {
      loop.stop();
      unsubscribe.forEach((off) => off());
      keymap.dispose();
      viewport.dispose();
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onHidden);
      host.replaceChildren();
    },
  };
}
