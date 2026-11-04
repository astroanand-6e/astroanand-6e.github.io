/** Builds the whole controller SVG: chassis, every part from the layout, meters, rings, readout. */
import { CONTROL_BY_ID } from '../controls.js';
import { buildBody } from './body.js';
import { VIEW, LAYOUT_LIST } from './layout.js';
import {
  buildEncoder, buildFader, buildKnob, buildMeters, buildSwitch,
} from './parts-analog.js';
import {
  buildCapRect, buildCapRound, buildPad, buildWindowRect, buildWindowRound,
} from './parts-buttons.js';
import { buildJog } from './parts-jog.js';
import { buildReadout } from './readout.js';
import { s } from './svg.js';

const BUILDERS = Object.freeze({
  jog: buildJog,
  'cap-round': buildCapRound,
  'cap-rect': buildCapRect,
  'window-round': buildWindowRound,
  'window-rect': buildWindowRect,
  pad: buildPad,
  knob: buildKnob,
  fader: buildFader,
  encoder: buildEncoder,
  switch: buildSwitch,
});

function buildRing(part) {
  const { ring, spec } = part;
  const transform = `translate(${spec.x} ${spec.y})`;
  if (ring.shape === 'circle') return s('circle', { class: 'ring', r: ring.r, transform });
  return s('rect', { class: 'ring', x: -ring.w / 2, y: -ring.h / 2, width: ring.w, height: ring.h, rx: ring.rx, transform });
}

export function buildUnit() {
  const body = buildBody();
  const meters = buildMeters();
  const readout = buildReadout();
  const controlLayer = s('g', { class: 'controls' });
  const ringLayer = s('g', { class: 'rings', 'aria-hidden': 'true' });
  const parts = new Map();
  const rings = new Map();
  for (const spec of LAYOUT_LIST) {
    const build = BUILDERS[spec.shape];
    if (!build) {
      console.warn(`mix: no builder for shape "${spec.shape}" (${spec.id})`);
      continue;
    }
    const part = build(CONTROL_BY_ID.get(spec.id), spec);
    const ring = buildRing(part);
    parts.set(spec.id, part);
    rings.set(spec.id, ring);
    controlLayer.append(part.g);
    ringLayer.append(ring);
  }
  const svg = s('svg', {
    class: 'deck',
    viewBox: `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`,
    role: 'group',
    'aria-label': 'Virtual DJ controller',
    focusable: 'false',
  }, body.defs, body.g, meters.g, controlLayer, ringLayer, readout.g);
  return { svg, parts, rings, body, meters, readout };
}
