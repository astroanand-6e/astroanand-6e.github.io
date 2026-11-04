/** Step text templating and control names for the target chips. */
import { CONTROL_BY_ID } from '../controls.js';
import { fmtBpm } from './format.js';
import { phaseErrorMs } from './metrics.js';

const TOKENS = {
  bpm1: (state) => fmtBpm(state.decks[0].bpm),
  bpm2: (state) => fmtBpm(state.decks[1].bpm),
  phaseMs: (state) => String(Math.round(phaseErrorMs(state))),
};

/** Replaces {bpm1}, {bpm2} and {phaseMs} with live numbers; unknown tokens stay as written. */
export function fillText(text, state) {
  return text.replace(/\{(\w+)\}/g, (match, key) => (TOKENS[key] ? TOKENS[key](state) : match));
}

/** A step's text may be a template string or a function of the state. */
export function resolveText(text, state) {
  return typeof text === 'function' ? text(state) : fillText(text, state);
}

const DECK_CONTROL = /^d([12])\./;
const CHANNEL_CONTROL = /^m\.[a-z]+([12])$/;

/** "Deck 1 Cue", "Ch 2 Low", "Crossfader": the name shown on a target chip. */
export function targetLabel(id) {
  const control = CONTROL_BY_ID.get(id);
  if (!control) return id;
  const deck = DECK_CONTROL.exec(id);
  if (deck) return `Deck ${deck[1]} ${control.label}`;
  const channel = CHANNEL_CONTROL.exec(id);
  if (channel && !/\d/.test(control.label)) return `Ch ${channel[1]} ${control.label}`;
  return control.label;
}
