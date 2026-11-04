/** Knobs, faders, the browse encoder, the FX channel switch and the level meters. */
import { formatValue } from './format.js';
import {
  HIT_MIN, controlGroup, labelNode, rectHit, ringCircle, ringRect, roundHit, smoother,
} from './parts-common.js';
import { METERS } from './layout.js';
import { lerp, polar, s, append } from './svg.js';

const KNOB_SWEEP_DEG = 135;
const KNOB_RING_GAP = 3.2;
const ENCODER_STEP_DEG = 15;
const ENCODER_NOTCHES = 24;
const SWITCH_CAP = Object.freeze({ w: 9, h: 6.4 });

const unit = (control, value) => (value - control.min) / (control.max - control.min);

function sliderAria(control, extra = {}) {
  return { 'aria-valuemin': control.min, 'aria-valuemax': control.max, 'aria-valuenow': control.value, ...extra };
}

function setSliderValue(g, control, value) {
  g.setAttribute('aria-valuenow', String(value));
  g.setAttribute('aria-valuetext', formatValue(control, value));
}

function knobTicks(skirt) {
  return s('g', { class: 'scale' }, [-KNOB_SWEEP_DEG, 0, KNOB_SWEEP_DEG].map((deg) => {
    const [x0, y0] = polar(skirt + 1.4, deg);
    const [x1, y1] = polar(skirt + (deg === 0 ? 3.8 : 3), deg);
    return s('line', { class: deg === 0 ? 'tick tick-mid' : 'tick', x1: x0, y1: y0, x2: x1, y2: y1 });
  }));
}

export function buildKnob(control, spec) {
  const { r } = spec;
  const skirt = r * 1.14;
  const g = controlGroup(control, spec, sliderAria(control, { 'aria-valuetext': formatValue(control, control.value) }));
  const rotor = s('g', { class: 'rotor' }, s('line', { class: 'knob-mark', x1: 0, y1: -r * 0.3, x2: 0, y2: -r * 0.9 }));
  append(g,
    roundHit(skirt + 1.5), knobTicks(skirt),
    s('circle', { class: 'skirt', r: skirt }),
    s('circle', { class: 'knob-cap', r }),
    s('circle', { class: 'sheen', r }),
    rotor,
    labelNode(spec, skirt, skirt),
  );
  const motion = smoother((value) => {
    rotor.setAttribute('transform', `rotate(${lerp(-KNOB_SWEEP_DEG, KNOB_SWEEP_DEG, unit(control, value))})`);
  });
  const apply = (value, animate) => {
    setSliderValue(g, control, value);
    return motion.set(value, animate);
  };
  return { control, spec, g, ring: ringCircle(skirt + KNOB_RING_GAP), apply, tick: motion.tick, light: () => {} };
}

function faderGeometry(spec) {
  const vertical = spec.axis === 'v';
  const { length, capW, capH, travel } = spec;
  const reach = Math.max(Math.abs(travel[0]), Math.abs(travel[1]));
  const extent = Math.max(length, 2 * reach + (vertical ? capH : capW));
  return {
    vertical,
    slot: vertical ? { x: -2.25, y: -length / 2, width: 4.5, height: length } : { x: -length / 2, y: -2.25, width: length, height: 4.5 },
    hit: vertical ? [Math.max(capW + 2, HIT_MIN), extent + 4] : [extent + 2, Math.max(capH + 4, HIT_MIN)],
  };
}

function faderTicks(spec, vertical) {
  const count = spec.ticks ?? 0;
  const [t0, t1] = spec.travel;
  const ticks = Array.from({ length: count }, (_, i) => {
    const mid = spec.detent && i === (count - 1) / 2;
    const major = i === 0 || i === count - 1 || mid;
    const pos = lerp(t0, t1, i / (count - 1));
    const [from, to] = [3.2, mid ? 7.6 : major ? 6.2 : 5];
    const cls = mid ? 'tick tick-mid' : 'tick';
    return [-1, 1].map((side) => (vertical
      ? s('line', { class: cls, x1: side * from, y1: pos, x2: side * to, y2: pos })
      : s('line', { class: cls, x1: pos, y1: side * from, x2: pos, y2: side * to })));
  });
  return s('g', { class: 'scale' }, ticks.flat());
}

export function buildFader(control, spec) {
  const { vertical, slot, hit } = faderGeometry(spec);
  const { capW, capH, travel } = spec;
  const aria = sliderAria(control, { 'aria-orientation': vertical ? 'vertical' : 'horizontal', 'aria-valuetext': formatValue(control, control.value) });
  const g = controlGroup(control, spec, aria);
  const face = { x: -capW / 2, y: -capH / 2, width: capW, height: capH, rx: 1.7 };
  const line = vertical
    ? { x: -capW / 2 + 2, y: -0.45, width: capW - 4, height: 0.9 }
    : { x: -0.45, y: -capH / 2 + 2, width: 0.9, height: capH - 4 };
  const cap = s('g', { class: 'fader-cap' },
    s('rect', { class: 'cap', ...face }), s('rect', { class: 'sheen', ...face }), s('rect', { class: 'cap-line', ...line }));
  append(g,
    s('rect', { class: 'hit', x: -hit[0] / 2, y: -hit[1] / 2, width: hit[0], height: hit[1] }),
    faderTicks(spec, vertical),
    s('rect', { class: 'slot', ...slot, rx: 2.25 }),
    cap,
    labelNode(spec, vertical ? capW / 2 : spec.length / 2, vertical ? spec.length / 2 : capH / 2),
  );
  const motion = smoother((value) => {
    const pos = lerp(travel[0], travel[1], unit(control, value));
    cap.setAttribute('transform', vertical ? `translate(0 ${pos})` : `translate(${pos} 0)`);
  });
  const apply = (value, animate) => {
    setSliderValue(g, control, value);
    return motion.set(value, animate);
  };
  const ring = ringRect(vertical ? capW + 4 : hit[0] - 2, vertical ? hit[1] - 2 : capH + 4, 3);
  return { control, spec, g, ring, apply, tick: motion.tick, light: () => {} };
}

export function buildEncoder(control, spec) {
  const { r } = spec;
  const g = controlGroup(control, spec);
  const notches = Array.from({ length: ENCODER_NOTCHES }, (_, i) => {
    const [x0, y0] = polar(r - 0.2, (i * 360) / ENCODER_NOTCHES);
    const [x1, y1] = polar(r - 1.7, (i * 360) / ENCODER_NOTCHES);
    return s('line', { class: 'notch', x1: x0, y1: y0, x2: x1, y2: y1 });
  });
  const rotor = s('g', { class: 'rotor encoder-rotor' }, notches, s('circle', { class: 'encoder-dot', cx: 0, cy: -r * 0.55, r: 1.2 }));
  append(g, roundHit(r + 2.5), s('circle', { class: 'skirt', r }), s('circle', { class: 'knob-cap', r: r - 2 }), s('circle', { class: 'sheen', r: r - 2 }), rotor, labelNode(spec, r, r));
  let angle = 0;
  const apply = (step) => {
    angle += step * ENCODER_STEP_DEG;
    rotor.style.transform = `rotate(${angle}deg)`;
    return false;
  };
  return { control, spec, g, ring: ringCircle(r + 3.2), apply, light: () => {} };
}

export function switchPositions(spec) {
  const count = spec.order.length;
  return spec.order.map((option, i) => ({ option, y: (i - (count - 1) / 2) * spec.reach }));
}

export function buildSwitch(control, spec) {
  const positions = switchPositions(spec);
  const g = controlGroup(control, spec, {
    'aria-valuemin': 0, 'aria-valuemax': positions.length - 1, 'aria-valuenow': 0, 'aria-orientation': 'vertical',
  });
  const cap = s('g', { class: 'fader-cap' },
    s('rect', { class: 'cap', x: -SWITCH_CAP.w / 2, y: -SWITCH_CAP.h / 2, width: SWITCH_CAP.w, height: SWITCH_CAP.h, rx: 1.4 }),
    s('rect', { class: 'sheen', x: -SWITCH_CAP.w / 2, y: -SWITCH_CAP.h / 2, width: SWITCH_CAP.w, height: SWITCH_CAP.h, rx: 1.4 }),
    s('rect', { class: 'cap-line', x: -SWITCH_CAP.w / 2 + 1.8, y: -0.4, width: SWITCH_CAP.w - 3.6, height: 0.8 }));
  append(g,
    rectHit(spec, 18, spec.length + 4),
    s('rect', { class: 'slot', x: -2.5, y: -spec.length / 2, width: 5, height: spec.length, rx: 2.5 }),
    positions.map(({ option, y }) => [
      s('line', { class: 'tick', x1: -6.2, y1: y, x2: -3.4, y2: y }),
      s('text', { class: 'silk', x: 7.4, y: y + 1.2, 'text-anchor': 'start' }, option),
    ]),
    cap,
  );
  const apply = (option) => {
    const index = Math.max(0, positions.findIndex((p) => p.option === option));
    cap.setAttribute('transform', `translate(0 ${positions[index].y})`);
    g.setAttribute('aria-valuenow', String(index));
    g.setAttribute('aria-valuetext', formatValue(control, option));
    return false;
  };
  return { control, spec, g, ring: ringRect(22, spec.length + 8, 3), apply, light: () => {} };
}

/** Two 5-segment channel meters. set(channelIndex, level 0..1) lights segments from the bottom. */
export function buildMeters() {
  const g = s('g', { class: 'meters', 'aria-hidden': 'true' });
  const count = METERS.ys.length;
  const columns = METERS.xs.map((x) => METERS.ys.map((y, i) => {
    const seg = s('rect', {
      class: i === 0 ? 'meter-seg meter-clip' : 'meter-seg',
      x: x - METERS.w / 2, y: y - METERS.h / 2, width: METERS.w, height: METERS.h, rx: 0.9,
    });
    append(g, seg);
    return seg;
  }));
  const shown = columns.map(() => -1);
  const set = (channel, level) => {
    const lit = Math.round(Math.min(1, Math.max(0, level)) * count);
    if (lit === shown[channel]) return;
    shown[channel] = lit;
    columns[channel].forEach((seg, i) => seg.classList.toggle('is-lit', count - i <= lit));
  };
  return { g, set };
}
