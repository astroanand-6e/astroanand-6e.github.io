/**
 * Unit 3, performance. Level 7 hot cues, level 8 loops.
 *
 * Pad facts (DDJ-FLX4, HOT CUE mode): an unlit pad stores a hot cue at the
 * playhead and lights up; a lit pad jumps to its cue; SHIFT + pad clears it.
 * Loop facts: 4 BEAT / EXIT starts a 4 beat loop at the playhead and exits it
 * when pressed again; 1/2X halves the loop and 2X doubles it.
 */
import { BEATS_PER_BAR, PHRASE_BEATS } from '../controls.js';
import { playerEvents, pressed } from './checks.js';
import { describeBeatOffset, fmtBeats } from './format.js';
import { beatOffset, beatsBetween, beatsToMs, phraseOffset, phrasePos, phrasePosAtSeconds } from './metrics.js';
import { PHRASE_START, phraseAt } from './scenes.js';
import { guardSkips, starsLowerIsBetter } from './scoring.js';
import { mean, maxOf } from './util.js';

/* Level 7: hot cues */
const MIN_CUE_GAP_BEATS = BEATS_PER_BAR;
const REQUIRED_JUMPS = 3;
const PAD_STARS = Object.freeze({ three: 70, two: 140 }); // mean ms a pad press lands from the beat
const PAD_IDS = Object.freeze(['d1.pad1', 'd1.pad2']);

const padSlot = (id) => PAD_IDS.indexOf(id);

/** Learner presses of pad 1 or 2 while the deck is in HOT CUE mode. */
const padPresses = (ctx) =>
  PAD_IDS.flatMap((id) => playerEvents(ctx, id)).filter(
    (event) => event.value === true && event.at.decks[0].padMode === 'hotcue',
  );

/** Presses on a pad whose hot cue already existed: these jump instead of set. */
const padJumps = (ctx) => padPresses(ctx).filter((event) => event.at.decks[0].hotCues[padSlot(event.id)] != null);

const pressErrorMs = (event) => {
  const deck = event.at.decks[0];
  return Math.abs(beatsToMs(beatOffset(deck.beat), deck.bpm));
};

const hotCues = {
  id: 'hot-cues',
  title: 'Hot cues',
  blurb: 'Mark 2 spots and jump between them on the beat.',
  steps: [
    {
      text: 'Press HOT CUE so the pads set and play hot cues.',
      targets: ['d1.mode.hotcue'],
      section: 'deck1',
      setup: (api) =>
        api.scene({ load: [true, false], at: PHRASE_START, play: [true, false], padMode: 'padfx' }),
      done: (ctx) => ctx.state.decks[0].padMode === 'hotcue' && pressed(ctx, 'd1.mode.hotcue'),
      autoAdvance: true,
      hint: 'Click the glowing HOT CUE button above the pads.',
    },
    {
      text: 'Set hot cue 1. Press pad 1 right as a beat lands. The pad lights up and the deck remembers that spot.',
      targets: ['d1.pad1'],
      section: 'deck1',
      pulse: 0,
      setup: (api) => api.ensurePlaying([true]),
      done: ({ state }) => state.decks[0].hotCues[0] != null,
      hint: 'Press pad 1 while the track plays. Watch the beat dots and press as a dot lights.',
    },
    {
      text: 'Let the track run for 2 bars, then press pad 2 on a beat to set hot cue 2.',
      targets: ['d1.pad2'],
      section: 'deck1',
      pulse: 0,
      setup: (api) => api.ensurePlaying([true]),
      done: ({ state }) => {
        const deck = state.decks[0];
        const [first, second] = deck.hotCues;
        return first != null && second != null && Math.abs(beatsBetween(deck, first, second)) >= MIN_CUE_GAP_BEATS;
      },
      hint: 'Hot cue 2 must sit at least 1 bar from hot cue 1. If it landed too close, hold SHIFT, press pad 2 to clear it, and set it again.',
    },
    {
      text: 'Jump between them on the beat. Press pad 1, then pad 2, then pad 1 again, each as a beat lands.',
      targets: ['d1.pad1', 'd1.pad2'],
      section: 'deck1',
      pulse: 0,
      setup: (api) => api.ensurePlaying([true]),
      done: (ctx) => {
        const jumps = padJumps(ctx);
        return jumps.length >= REQUIRED_JUMPS && PAD_IDS.every((id) => jumps.some((event) => event.id === id));
      },
      readout: (ctx) => `Jumps ${Math.min(padJumps(ctx).length, REQUIRED_JUMPS)} / ${REQUIRED_JUMPS}`,
      hint: 'Both pads must be lit. Press them in turn, timing each press to a beat dot.',
    },
  ],
  score: guardSkips((ctxs) => {
    const errors = ctxs.slice(1).flatMap((ctx) => padPresses(ctx).map(pressErrorMs));
    const average = mean(errors);
    const stars = starsLowerIsBetter(average, PAD_STARS);
    return {
      stars,
      lines: [
        `Your pad presses landed ${Math.round(average)} ms from the beat on average.`,
        stars === 3
          ? `The loosest was ${Math.round(maxOf(errors))} ms off.`
          : 'Press the pad right as the beat dot lights.',
      ],
    };
  }),
};

/* Level 8: loops */
const LOOP_START_PHRASE = 16; // beats into the phrase, so the next phrase start is 16 beats away
const MAX_LOOP_ADJUSTS = 4;
const LOOP_BEAT_SLACK = 0.01;
const STARTED_ON_PHRASE_BEATS = 1;
const EXIT_THREE_BEATS = 0.5;
const EXIT_TWO_BEATS = 1;

const loopOf = (state) => state.decks[0].loop;
const loopIs = (state, beats) => {
  const loop = loopOf(state);
  return Boolean(loop) && Math.abs(loop.beats - beats) <= LOOP_BEAT_SLACK;
};

/** Puts a loop of `beats` on deck 1, starting one at the playhead if there is none. */
function ensureLoop(api, beats) {
  const read = () => api.state().decks[0].loop;
  if (!read()) api.press('d1.loop.exit');
  for (let i = 0; i < MAX_LOOP_ADJUSTS && read() && Math.abs(read().beats - beats) > LOOP_BEAT_SLACK; i += 1) {
    api.press(read().beats > beats ? 'd1.loop.half' : 'd1.loop.double');
  }
}

const loopExit = (ctx) =>
  playerEvents(ctx, 'd1.loop.exit').filter((event) => event.value === true && event.at.decks[0].loop).pop() || null;

/** Beats between an exit press and the loop restarting: positive after it, negative before it. */
function exitOffset(event) {
  const deck = event.at.decks[0];
  const toRestart = beatsBetween(deck, deck.position, deck.loop.end);
  const sinceRestart = beatsBetween(deck, deck.loop.start, deck.position);
  return sinceRestart <= toRestart ? sinceRestart : -toRestart;
}

function restartReadout({ state }) {
  const deck = state.decks[0];
  if (!deck.loop) return `Phrase restarts in ${(PHRASE_BEATS - phrasePos(deck)).toFixed(1)} beats`;
  return `Loop of ${fmtBeats(deck.loop.beats)}   Restarts in ${beatsBetween(deck, deck.position, deck.loop.end).toFixed(1)} beats`;
}

const loops = {
  id: 'loops',
  title: 'Loops',
  blurb: 'Loop 4 beats, halve it, double it, exit on the phrase.',
  steps: [
    {
      text: 'Press 4 BEAT / EXIT as the phrase restarts at beat 1. The deck loops 4 beats from the playhead.',
      targets: ['d1.loop.exit'],
      section: 'deck1',
      pulse: 0,
      setup: (api) => api.scene({ load: [true, false], at: phraseAt(LOOP_START_PHRASE), play: [true, false] }),
      done: ({ state }) => loopIs(state, 4),
      readout: restartReadout,
      hint: 'The loop starts where you press. Wait for the counter to wrap to 1 and press 4 BEAT / EXIT.',
    },
    {
      text: 'Press 1/2X. The loop shrinks to 2 beats.',
      targets: ['d1.loop.half'],
      section: 'deck1',
      setup: (api) => {
        api.ensurePlaying([true]);
        ensureLoop(api, 4);
      },
      done: ({ state }) => loopIs(state, 2),
      readout: restartReadout,
      hint: 'Click the glowing 1/2X button.',
    },
    {
      text: 'Press 2X twice. The loop grows to 4 beats, then 8.',
      targets: ['d1.loop.double'],
      section: 'deck1',
      setup: (api) => {
        api.ensurePlaying([true]);
        ensureLoop(api, 2);
      },
      done: ({ state }) => loopIs(state, 8),
      readout: restartReadout,
      hint: 'Click the glowing 2X button 2 times.',
    },
    {
      text: 'Exit the loop as it restarts. Press 4 BEAT / EXIT right as the counter wraps and the track plays on from there.',
      targets: ['d1.loop.exit'],
      section: 'deck1',
      pulse: 0,
      setup: (api) => {
        api.ensurePlaying([true]);
        ensureLoop(api, 8);
      },
      done: (ctx) => !loopOf(ctx.state) && loopExit(ctx) !== null,
      readout: restartReadout,
      hint: 'Watch the restart countdown and press 4 BEAT / EXIT as it reaches 0.',
    },
  ],
  score: guardSkips((ctxs) => {
    const loopDeck = ctxs[0].state.decks[0];
    const startOffset = phraseOffset(phrasePosAtSeconds(loopDeck, loopDeck.loop.start));
    const exitBeats = exitOffset(loopExit(ctxs[3]));
    let stars = 1;
    if (Math.abs(exitBeats) <= EXIT_TWO_BEATS) stars = 2;
    if (Math.abs(exitBeats) <= EXIT_THREE_BEATS && Math.abs(startOffset) <= STARTED_ON_PHRASE_BEATS) stars = 3;
    return {
      stars,
      lines: [
        `You exited ${describeBeatOffset(exitBeats, 'the loop restart')}.`,
        `The loop started ${describeBeatOffset(startOffset, 'the phrase start')}.`,
      ],
    };
  }),
};

export const PERFORMANCE_UNIT = Object.freeze({
  id: 'performance',
  title: 'Performance',
  blurb: 'Jump and loop on the beat.',
  lessons: Object.freeze([hotCues, loops]),
});
