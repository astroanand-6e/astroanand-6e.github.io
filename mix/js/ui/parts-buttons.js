/** Buttons, LED keys and pads. Each builder returns a part: { control, spec, g, ring, apply, light }. */
import { s, append } from './svg.js';
import {
  buttonApply, controlGroup, initialPressedAttr, labelNode, makeLight, rectHit, ringCircle, ringRect, roundHit,
} from './parts-common.js';

const TEXT_SIZE = 3.4;
const RING_PAD = 3;
const PAD_TINT = 0.34;
const GLYPHS = Object.freeze({
  play: () => [
    s('path', { class: 'cap-glyph', d: 'M-5.6 -3.3L-0.8 0L-5.6 3.3Z' }),
    s('rect', { class: 'cap-glyph', x: 1.4, y: -3.3, width: 1.3, height: 6.6 }),
    s('rect', { class: 'cap-glyph', x: 4.1, y: -3.3, width: 1.3, height: 6.6 }),
  ],
  prev: () => [s('path', { class: 'cap-glyph', d: 'M1.6 -2.2L-1.6 0L1.6 2.2Z' })],
  next: () => [s('path', { class: 'cap-glyph', d: 'M-1.6 -2.2L1.6 0L-1.6 2.2Z' })],
});

function capMark(spec) {
  if (spec.glyph) return s('g', { class: 'cap-mark' }, GLYPHS[spec.glyph]());
  if (!spec.text) return null;
  return s('text', { class: 'cap-ink cap-mark', x: 0, y: 0, 'font-size': spec.textSize ?? TEXT_SIZE }, spec.text);
}

function finish(control, spec, g, ring, light) {
  return { control, spec, g, ring, apply: buttonApply(g, control), light: light ?? (() => {}) };
}

/** Round cap on a base plate. With spec.led the plate is lit around the cap. */
export function buildCapRound(control, spec) {
  const { r, cap } = spec;
  const g = controlGroup(control, spec, initialPressedAttr(control));
  append(g, roundHit(r + 0.5), s('circle', { class: 'base', r }));
  let light = null;
  if (spec.led) {
    const on = s('circle', { class: 'led-on', r: r - 0.7 });
    append(g, s('circle', { class: 'led-dim', r: r - 0.7 }), on);
    light = makeLight(g, [{ node: on, factor: 1 }]);
  }
  append(g,
    s('g', { class: 'cap-group' }, s('circle', { class: 'cap', r: cap }), s('circle', { class: 'sheen', r: cap }), capMark(spec)),
    labelNode(spec, r, r),
  );
  return finish(control, spec, g, ringCircle(r + RING_PAD), light);
}

/** Rectangular cap on a base plate (sync, load, FX select and beat keys). */
export function buildCapRect(control, spec) {
  const { w, h } = spec;
  const edge = spec.led ? 1.8 : 1.2;
  const g = controlGroup(control, spec, initialPressedAttr(control));
  append(g, rectHit(spec, w, h), s('rect', { class: 'base', x: -w / 2, y: -h / 2, width: w, height: h, rx: 2.4 }));
  let light = null;
  if (spec.led) {
    const frame = { x: -w / 2 + 0.7, y: -h / 2 + 0.7, width: w - 1.4, height: h - 1.4, rx: 1.9 };
    const on = s('rect', { class: 'led-on', ...frame });
    append(g, s('rect', { class: 'led-dim', ...frame }), on);
    light = makeLight(g, [{ node: on, factor: 1 }]);
  }
  const face = { x: -w / 2 + edge, y: -h / 2 + edge, width: w - 2 * edge, height: h - 2 * edge, rx: 1.5 };
  append(g,
    s('g', { class: 'cap-group' }, s('rect', { class: 'cap', ...face }), s('rect', { class: 'sheen', ...face }), capMark(spec)),
    labelNode(spec, w / 2, h / 2),
  );
  return finish(control, spec, g, ringRect(w + 2 * RING_PAD, h + 2 * RING_PAD), light);
}

/** A key that is a lit window: IN, OUT, FX on, smart buttons, cue keys. */
export function buildWindowRound(control, spec) {
  const { r } = spec;
  const g = controlGroup(control, spec, initialPressedAttr(control));
  const on = s('circle', { class: 'led-on', r: r - 1.2 });
  append(g,
    roundHit(r + 0.5),
    s('circle', { class: 'base', r }),
    s('circle', { class: 'led-dim', r: r - 1.2 }),
    on,
    s('circle', { class: 'gloss', r: r - 1.2 }),
    labelNode(spec, r, r),
  );
  return finish(control, spec, g, ringCircle(r + RING_PAD), makeLight(g, [{ node: on, factor: 1 }]));
}

export function buildWindowRect(control, spec) {
  const { w, h } = spec;
  const window = { x: -w / 2 + 1, y: -h / 2 + 1, width: w - 2, height: h - 2, rx: 1.6 };
  const g = controlGroup(control, spec, initialPressedAttr(control));
  const on = s('rect', { class: 'led-on', ...window });
  append(g,
    rectHit(spec, w, h),
    s('rect', { class: 'base', x: -w / 2, y: -h / 2, width: w, height: h, rx: 2.2 }),
    s('rect', { class: 'led-dim', ...window }),
    on,
    s('rect', { class: 'gloss', ...window }),
    labelNode(spec, w / 2, h / 2),
  );
  return finish(control, spec, g, ringRect(w + 2 * RING_PAD, h + 2 * RING_PAD), makeLight(g, [{ node: on, factor: 1 }]));
}

/** Performance pad: dark cap in a lit frame, tinted from underneath when lit. */
export function buildPad(control, spec) {
  const { size, cap } = spec;
  const g = controlGroup(control, spec, initialPressedAttr(control));
  const frame = { x: -size / 2 + 0.4, y: -size / 2 + 0.4, width: size - 0.8, height: size - 0.8, rx: 2 };
  const face = { x: -cap / 2, y: -cap / 2, width: cap, height: cap, rx: 1.9 };
  const on = s('rect', { class: 'led-on', ...frame });
  const tint = s('rect', { class: 'pad-tint', ...face });
  append(g,
    rectHit(spec, size, size),
    s('rect', { class: 'base', x: -size / 2, y: -size / 2, width: size, height: size, rx: 2.4 }),
    s('rect', { class: 'led-dim', ...frame }),
    on,
    s('g', { class: 'cap-group' },
      s('rect', { class: 'pad-cap', ...face }),
      tint,
      s('rect', { class: 'sheen', ...face }),
      s('text', { class: 'pad-digit', x: 0, y: 0 }, spec.digit)),
  );
  const light = makeLight(g, [{ node: on, factor: 1 }, { node: tint, factor: PAD_TINT }]);
  return finish(control, spec, g, ringRect(size + 2 * RING_PAD - 1, size + 2 * RING_PAD - 1, 3), light);
}
