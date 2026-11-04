/** Pieces every controller part shares: the group, the pointer target, printed labels, LEDs. */
import { s } from './svg.js';

export const HIT_MIN = 22.5;
const LABEL_GAP = 2.4;
const LABEL_LINE = 3.5;
const CAP_HEIGHT = 2.4;

const ROLES = Object.freeze({
  button: 'button', toggle: 'switch', knob: 'slider', fader: 'slider', switch: 'slider', encoder: 'spinbutton', jog: 'group',
});

/** Screen reader name: "Deck 1 Cue", "Channel 2 Hi", "Crossfader". */
export function accessibleName(control) {
  const deck = /^d(\d)\./.exec(control.id);
  if (deck) return `Deck ${deck[1]} ${control.label}`;
  const channel = /^m\.(trim|hi|mid|low|cfx)(\d)$/.exec(control.id);
  return channel ? `Channel ${channel[2]} ${control.label}` : control.label;
}

/** The part whose control group contains an event target, or null. */
export function partOf(parts, target) {
  const group = target instanceof Element ? target.closest('.ctl') : null;
  return group ? parts.get(group.dataset.id) ?? null : null;
}

export function controlGroup(control, spec, extra = {}) {
  const live = control.live !== false;
  return s('g', {
    class: `ctl ${control.kind}${live ? '' : ' is-inert'}`,
    'data-id': control.id,
    'data-kind': control.kind,
    transform: `translate(${spec.x} ${spec.y})`,
    role: ROLES[control.kind],
    tabindex: live ? '0' : undefined,
    'aria-label': accessibleName(control),
    'aria-disabled': live ? undefined : 'true',
    ...extra,
  });
}

/** Transparent pointer target, never smaller than a comfortable touch size. */
export function roundHit(r) {
  return s('circle', { class: 'hit', r: Math.max(r, HIT_MIN / 2) });
}

export function rectHit(spec, w, h) {
  const [hw, hh] = spec.hit ?? [Math.max(w + 3, HIT_MIN), Math.max(h + 3, HIT_MIN)];
  return s('rect', { class: 'hit', x: -hw / 2, y: -hh / 2, width: hw, height: hh });
}

function labelAnchor(at) {
  if (at === 'left') return 'end';
  return at === 'right' ? 'start' : 'middle';
}

function labelPosition(at, index, count, halfW, halfH) {
  const fromCentre = (index - (count - 1) / 2) * LABEL_LINE;
  if (at === 'left') return [-(halfW + LABEL_GAP), fromCentre + CAP_HEIGHT / 2];
  if (at === 'right') return [halfW + LABEL_GAP, fromCentre + CAP_HEIGHT / 2];
  if (at === 'below') return [0, halfH + LABEL_GAP + CAP_HEIGHT + index * LABEL_LINE];
  return [0, -(halfH + LABEL_GAP) - (count - 1 - index) * LABEL_LINE];
}

/** Printed label beside a control. spec.label is a string or an array of lines. */
export function labelNode(spec, halfW, halfH) {
  if (!spec.label) return null;
  const lines = [].concat(spec.label);
  const at = spec.labelAt ?? 'above';
  return s('g', { class: 'silk-group' }, lines.map((line, index) => {
    const [x, y] = labelPosition(at, index, lines.length, halfW, halfH);
    return s('text', { class: 'silk', x, y, 'text-anchor': labelAnchor(at) }, line);
  }));
}

export function ringCircle(r) {
  return { shape: 'circle', r };
}

export function ringRect(w, h, rx = 2.5) {
  return { shape: 'rect', w, h, rx };
}

/**
 * LED handle: light(level, color) sets the opacity of the lit layers and the
 * per-control --c color. targets is a list of { node, factor }. Writes only on change.
 */
export function makeLight(g, targets) {
  let lastLevel = null;
  let lastColor = null;
  const light = (level, color = null) => {
    if (level !== lastLevel) {
      lastLevel = level;
      for (const { node, factor } of targets) node.style.opacity = String(level * factor);
    }
    if (color === lastColor) return;
    lastColor = color;
    if (color) g.style.setProperty('--c', color);
    else g.style.removeProperty('--c');
  };
  light(0);
  return light;
}

/** apply() for buttons and toggles: pressed class on buttons, latched state and aria-checked on toggles. */
export function buttonApply(g, control) {
  const toggle = control.kind === 'toggle';
  return (value) => {
    const on = Boolean(value);
    g.classList.toggle(toggle ? 'is-on' : 'is-down', on);
    if (toggle) g.setAttribute('aria-checked', String(on));
    return false;
  };
}

export function initialPressedAttr(control) {
  return control.kind === 'toggle' ? { 'aria-checked': 'false' } : {};
}

/**
 * Eases a displayed number toward its target. set() returns true while the part still
 * needs tick() calls; tick() returns true until it arrives.
 */
export function smoother(render, rate = 16) {
  let shown = null;
  let target = null;
  return {
    set(value, animate) {
      target = value;
      if (!animate || shown === null) {
        shown = value;
        render(shown);
        return false;
      }
      return shown !== target;
    },
    tick(dtMs) {
      if (shown === null || shown === target) return false;
      const next = shown + (target - shown) * (1 - Math.exp((-rate * dtMs) / 1000));
      shown = Math.abs(target - next) < 0.0008 ? target : next;
      render(shown);
      return shown !== target;
    },
  };
}
