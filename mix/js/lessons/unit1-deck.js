/**
 * Unit 1, the deck. Level 1 play and cue, level 2 tempo and sync, level 3 nudge with the jog.
 *
 * Cue facts (DDJ-FLX4, CDJ style): CUE while playing returns to the cue point and
 * pauses; CUE while paused stores a new cue point at the playhead.
 * BEAT SYNC matches the other deck's tempo and lines up the beats.
 * Jog nudge: clockwise speeds the deck up for a moment, counter-clockwise slows it.
 */
import { BEATS_PER_BAR } from '../controls.js';
import { holdSeconds, jogTurns, playerEvents, pressed, runBeats, tailByBeats, trailingRun } from './checks.js';
import { barBeatLabel, describeMsOffset, fmtBpm, fmtSeconds, signedMs } from './format.js';
import { beatAtSeconds, beatsToMs, bpmGap, nativeBpm, phaseErrorMs } from './metrics.js';
import { PHRASE_START, TEMPO_PAIR } from './scenes.js';
import { guardSkips, starsLowerIsBetter, totalSeconds } from './scoring.js';
import { faderForBpm } from './setup.js';
import { mean, maxOf } from './util.js';

/* Level 1: play and cue */
const NEW_CUE_BEAT = 16 * BEATS_PER_BAR; // bar 17, beat 1
const RUN_UP_BEAT = 14 * BEATS_PER_BAR; // bar 15: two bars of play before the target
const CUE_RETURN_TOLERANCE_S = 0.12;
const CUE_PLACE_TOLERANCE_BEATS = 0.5;
const CUE_STARS = Object.freeze({ three: 50, two: 150 }); // ms from bar 17 beat 1

const cuePlacementBeats = (state) => {
  const deck = state.decks[0];
  return beatAtSeconds(deck, deck.cuePoint) - NEW_CUE_BEAT;
};

const cuePressedWhilePlaying = (ctx) =>
  playerEvents(ctx, 'd1.cue').some((event) => event.value === true && event.at.decks[0].playing);

const cueReadout = ({ state }) => {
  const deck = state.decks[0];
  const cue = barBeatLabel(beatAtSeconds(deck, deck.cuePoint));
  return `Now ${barBeatLabel(deck.beat)}   Cue ${cue}   Target 17.1`;
};

const playAndCue = {
  id: 'play-and-cue',
  title: 'Play and cue',
  blurb: 'Start a track and set where it comes back to.',
  steps: [
    {
      text: 'Press PLAY on deck 1. The track starts.',
      targets: ['d1.play'],
      section: 'deck1',
      setup: (api) => api.scene({ load: [true, false] }),
      done: ({ state }) => state.decks[0].playing,
      autoAdvance: true,
      hint: 'Click the glowing PLAY button on deck 1.',
    },
    {
      text: 'Let it run for a few beats, then press CUE. A playing track jumps back to its cue point and stops there.',
      targets: ['d1.cue'],
      section: 'deck1',
      setup: (api) => api.ensurePlaying([true]),
      done: (ctx) => {
        const deck = ctx.state.decks[0];
        return cuePressedWhilePlaying(ctx) && !deck.playing && Math.abs(deck.position - deck.cuePoint) <= CUE_RETURN_TOLERANCE_S;
      },
      hint: 'CUE sits next to PLAY. Press it while the track is still playing.',
    },
    {
      text: 'Set a new cue point on bar 17. Let the track play, press PLAY to pause as the counter reaches 17.1, then press CUE to store that spot.',
      targets: ['d1.play', 'd1.cue'],
      section: 'deck1',
      pulse: 0,
      setup: (api) => {
        api.seekBeat(0, RUN_UP_BEAT);
        api.ensurePlaying([true]);
      },
      done: ({ state }) => Math.abs(cuePlacementBeats(state)) <= CUE_PLACE_TOLERANCE_BEATS,
      readout: cueReadout,
      hint: 'CUE stores a new spot only while the track is paused. If it jumped back instead, press PLAY, wait for the counter and try again.',
    },
  ],
  score: guardSkips((ctxs) => {
    const cueCtx = ctxs[2];
    const offsetMs = beatsToMs(cuePlacementBeats(cueCtx.state), cueCtx.state.decks[0].bpm);
    const stars = starsLowerIsBetter(Math.abs(offsetMs), CUE_STARS);
    return {
      stars,
      lines: [
        `New cue landed ${describeMsOffset(offsetMs, 'bar 17 beat 1')}.`,
        stars === 3
          ? `Done in ${fmtSeconds(totalSeconds(ctxs))}.`
          : 'Pause right as the counter flips to 17.1 to land closer.',
      ],
    };
  }),
};

/* Level 2: tempo and sync */
const MATCH_GAP_BPM = 0.5;
const MATCH_HOLD_S = 2;
const SYNC_GAP_BPM = 0.15;
const FORCED_GAP_RATIO = 1.03; // one track on both decks: deck 2 starts 3% fast
const FAST_MATCH_S = 60;
const TEMPO_STARS = Object.freeze({ three: 0.15, two: 0.3 }); // mean BPM gap while held

/** Deck 2's starting tempo fader: unchanged when the tracks differ enough, else 3% fast. */
const startingTempo = ({ bpm1, native2 }) =>
  Math.abs(native2 - bpm1) >= TEMPO_PAIR.minGapBpm ? 0 : faderForBpm(bpm1 * FORCED_GAP_RATIO, native2);

const tempoMatched = (state) =>
  state.decks[0].playing && state.decks[1].playing && !state.decks[1].synced && bpmGap(state) <= MATCH_GAP_BPM;

function tempoHint({ state }) {
  const gap = state.decks[0].bpm - state.decks[1].bpm;
  if (Math.abs(gap) <= MATCH_GAP_BPM) return 'Close enough. Hold the fader still for 2 seconds.';
  return gap > 0
    ? `Deck 2 is ${gap.toFixed(1)} BPM slower. Pull the tempo fader toward you.`
    : `Deck 2 is ${(-gap).toFixed(1)} BPM faster. Push the tempo fader away from you.`;
}

const tempoReadout = ({ state }) => {
  const [first, second] = state.decks;
  return `Deck 1 ${fmtBpm(first.bpm)}   Deck 2 ${fmtBpm(second.bpm)}   Gap ${bpmGap(state).toFixed(1)}`;
};

const tempoAndSync = {
  id: 'tempo-and-sync',
  title: 'Tempo and sync',
  blurb: 'Match 2 tracks by hand, then use BEAT SYNC.',
  steps: [
    {
      text: 'Deck 1 plays at {bpm1} BPM. Press PLAY on deck 2: it runs at {bpm2} BPM, so the beats drift apart.',
      targets: ['d2.play'],
      section: 'deck2',
      setup: (api) => api.scene({ pairOptions: TEMPO_PAIR, tempo2: startingTempo, at: PHRASE_START, play: [true, false] }),
      done: ({ state }) => state.decks[1].playing,
      autoAdvance: true,
      hint: 'Click the glowing PLAY button on deck 2.',
    },
    {
      text: 'Match deck 2 to deck 1 with the TEMPO fader. Pull it toward you to speed deck 2 up, push it away to slow it down. Bring the gap under 0.5 BPM and keep it there for 2 seconds.',
      targets: ['d2.tempo'],
      section: 'deck2',
      setup: (api) => api.ensurePlaying([true, true]),
      done: (ctx) => holdSeconds(ctx, tempoMatched) >= MATCH_HOLD_S,
      readout: tempoReadout,
      progress: (ctx) => Math.min(1, holdSeconds(ctx, tempoMatched) / MATCH_HOLD_S),
      hint: tempoHint,
    },
    {
      text: 'The tempo fader is back where it started. Press SYNC on deck 2. BEAT SYNC takes deck 1\'s tempo and lines the beats up.',
      targets: ['d2.sync'],
      section: 'deck2',
      setup: (api) => {
        const { decks } = api.state();
        api.ensurePlaying([true, true]);
        api.set('d2.tempo', startingTempo({ bpm1: decks[0].bpm, native2: nativeBpm(decks[1]) }));
      },
      done: (ctx) => pressed(ctx, 'd2.sync') && ctx.state.decks[1].synced && bpmGap(ctx.state) <= SYNC_GAP_BPM,
      readout: tempoReadout,
      hint: 'Click the glowing SYNC button on deck 2.',
    },
  ],
  score: guardSkips((ctxs) => {
    const matchCtx = ctxs[1];
    const run = trailingRun(matchCtx, tempoMatched);
    const meanGap = mean(run.map((item) => bpmGap(item.at)));
    const findSeconds = run.length ? run[0].t : matchCtx.elapsed;
    const earned = starsLowerIsBetter(meanGap, TEMPO_STARS);
    const stars = earned === 3 && findSeconds > FAST_MATCH_S ? 2 : earned;
    return {
      stars,
      lines: [
        `Tempo gap held at ${meanGap.toFixed(2)} BPM.`,
        `It took ${fmtSeconds(findSeconds)} to find the match${stars < 3 ? '. Aim for under 0.15 BPM in under 60 s.' : '.'}`,
      ],
    };
  }),
};

/* Level 3: nudge with the jog */
const DRIFT_BPM = 0.15; // deck 2 runs this much fast, so the phase creeps
const START_OFFSET_BEATS = 0.2; // deck 2 starts this far ahead of deck 1 (keyboard nudges are gentle)
const LISTEN_S = 4;
const PHASE_OK_MS = 40;
const HOLD_BEATS = 4 * BEATS_PER_BAR;
const MIN_JOG_TURNS = 0.02;
/** Stars come from the worst error in the last 2 bars of the hold, ms: the approach is long past by then. */
const SCORE_BEATS = 2 * BEATS_PER_BAR;
const PHASE_STARS = Object.freeze({ three: 12, two: 25 });

const inPhase = (state) => state.decks[0].playing && state.decks[1].playing && phaseErrorMs(state) <= PHASE_OK_MS;
const heldBeats = (ctx) => runBeats(trailingRun(ctx, inPhase));
const signedPhaseMs = (state) => beatsToMs(state.phaseOffset, state.decks[0].bpm);

function nudgeHint({ state }) {
  if (inPhase(state)) return 'In range. Hold it there until the bar fills.';
  return state.phaseOffset > 0
    ? 'Deck 2 is ahead of deck 1. Turn the jog wheel counter-clockwise to hold it back.'
    : 'Deck 2 is behind deck 1. Turn the jog wheel clockwise to push it forward.';
}

const nudgeWithJog = {
  id: 'nudge-with-the-jog',
  title: 'Nudge with the jog',
  blurb: 'Pull a drifting deck back into phase.',
  steps: [
    {
      text: 'Both decks run at the same tempo, but deck 2 sits {phaseMs} ms off deck 1\'s beat. Listen: every beat doubles up. The phase meter shows the gap.',
      targets: ['d2.jog'],
      section: 'deck2',
      setup: (api) =>
        api.scene({
          pairOptions: TEMPO_PAIR,
          mixer: { 'm.fader2': 1 },
          tempo2: ({ bpm1, native2 }) => faderForBpm(bpm1 + DRIFT_BPM, native2),
          at: PHRASE_START,
          offset: START_OFFSET_BEATS,
          play: [true, true],
        }),
      done: ({ elapsed }) => elapsed >= LISTEN_S,
      readout: ({ state }) => `Phase ${signedMs(signedPhaseMs(state))}`,
    },
    {
      text: 'Nudge deck 2 with the jog wheel until the phase meter sits in the center. Turn clockwise to push deck 2 forward and counter-clockwise to hold it back. Keep it centered for 4 bars.',
      targets: ['d2.jog'],
      section: 'deck2',
      setup: (api) => api.ensurePlaying([true, true]),
      done: (ctx) => jogTurns(ctx, 'd2.jog') >= MIN_JOG_TURNS && heldBeats(ctx) >= HOLD_BEATS,
      readout: (ctx) => `Phase ${signedMs(signedPhaseMs(ctx.state))}   Held ${heldBeats(ctx).toFixed(1)} / ${HOLD_BEATS} beats`,
      progress: (ctx) => Math.min(1, heldBeats(ctx) / HOLD_BEATS),
      hint: nudgeHint,
    },
  ],
  score: guardSkips((ctxs) => {
    const holdCtx = ctxs[1];
    const run = trailingRun(holdCtx, inPhase);
    const worstMs = maxOf(tailByBeats(run, SCORE_BEATS).map((item) => phaseErrorMs(item.at)));
    const centeredAfter = run.length ? run[0].t : holdCtx.elapsed;
    const stars = starsLowerIsBetter(worstMs, PHASE_STARS);
    return {
      stars,
      lines: [
        `Phase held within ${Math.ceil(worstMs)} ms over the last 2 bars.`,
        `You centered it after ${fmtSeconds(centeredAfter)}${stars < 3 ? '. Small, steady nudges hold it tighter.' : '.'}`,
      ],
    };
  }),
};

export const DECK_UNIT = Object.freeze({
  id: 'deck',
  title: 'The deck',
  blurb: 'Start, cue and match tracks.',
  lessons: Object.freeze([playAndCue, tempoAndSync, nudgeWithJog]),
});
