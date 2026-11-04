/**
 * Unit 4, your first mix: the bass swap.
 *
 * Both tracks play in sync with deck 2's bass cut. On a phrase start the learner
 * hands the low end over (deck 1 LOW down, deck 2 LOW up), then takes deck 1 out.
 * The swap is the midpoint between the two LOW moves, so either knob may go first.
 * Scored on four things: where the swap landed against the phrase start, how far
 * apart the two LOW moves were, how well the beats stayed together while both
 * decks were audible, and whether deck 1 was taken out.
 */
import { PHRASE_BEATS } from '../controls.js';
import { lastCrossing } from './checks.js';
import { describeBeatOffset, fmtBeats, fmtSeconds } from './format.js';
import { channel, channelGain, isOverlapping, phaseErrorMs, phraseOffset, phrasePos } from './metrics.js';
import { syncedScene } from './scenes.js';
import { guardSkips } from './scoring.js';
import { SAMPLE_INTERVAL_S } from './session.js';
import { maxOf, mean, mod } from './util.js';

const START_PHRASE = 10; // beats into the phrase: the next phrase start is 22 beats away
const FADER_UP = 0.8;
const BASS_MID = -0.5; // a LOW knob counts as cut, or back, once it passes this
const DECK_1_CUT = -0.7;
const DECK_2_BACK = -0.3;
const DECK_1_OUT_GAIN = 0.05;
const ON_PHRASE = Object.freeze({ three: 0.5, two: 1 }); // beats from the phrase start
const SWAP_GAP = Object.freeze({ three: 2, two: 4 }); // beats between the two LOW moves
const PHASE_MEAN_OK_MS = 25;

/** The two LOW moves that make the swap, or null until both have happened. */
export function findSwap(ctx) {
  const down = lastCrossing(ctx.events, 'm.low1', {
    threshold: BASS_MID,
    direction: 'down',
    startValue: channel(ctx.start.mixer, 'low', 0),
  });
  const up = lastCrossing(ctx.events, 'm.low2', {
    threshold: BASS_MID,
    direction: 'up',
    startValue: channel(ctx.start.mixer, 'low', 1),
  });
  return down && up ? { down, up } : null;
}

/** Where the swap landed (signed beats from the phrase start) and the beats between the two moves. */
export function swapTiming(swap) {
  const [early, late] = swap.down.abs <= swap.up.abs ? [swap.down, swap.up] : [swap.up, swap.down];
  const first = early.at.decks[1];
  const gap = late.at.decks[1].beat - first.beat;
  const midpoint = mod(phrasePos(first) + gap / 2, PHRASE_BEATS);
  return { landing: phraseOffset(midpoint), gap, lateBeat: late.at.decks[1].beat };
}

const swapDone = (state) => channel(state.mixer, 'low', 0) <= DECK_1_CUT && channel(state.mixer, 'low', 1) >= DECK_2_BACK;

function countdownReadout({ state }) {
  const left = PHRASE_BEATS - phrasePos(state.decks[1]);
  return `Phrase restarts in ${left.toFixed(1)} beats`;
}

const bassSwap = {
  id: 'the-bass-swap',
  title: 'The bass swap',
  blurb: 'Hand the low end from deck 1 to deck 2 on a phrase.',
  steps: [
    {
      text: 'Deck 1 is playing and deck 2 runs in sync with it, with its bass cut. Raise channel 2\'s fader. You hear deck 2\'s highs and mids over deck 1.',
      targets: ['m.fader2'],
      section: 'mixer',
      setup: (api) =>
        api.scene(syncedScene({ 'm.fader1': 1, 'm.fader2': 0, 'm.low2': -1, 'm.xfader': 0 }, START_PHRASE)),
      done: ({ state }) => channel(state.mixer, 'fader', 1) >= FADER_UP,
      autoAdvance: true,
      hint: 'Drag the channel 2 fader to the top.',
    },
    {
      text: 'Swap the bass on the phrase. As the phrase restarts at beat 1, turn deck 1\'s LOW down and deck 2\'s LOW up. Playing 2 basslines at once sounds muddy, so the low end belongs to a single deck at any moment.',
      targets: ['m.low1', 'm.low2'],
      section: 'mixer',
      pulse: 1,
      setup: (api) => {
        api.ensure({ 'm.low1': 0, 'm.low2': -1 });
        api.ensurePlaying([true, true]);
      },
      done: (ctx) => findSwap(ctx) !== null && swapDone(ctx.state),
      readout: countdownReadout,
      hint: 'Turn deck 1\'s LOW all the way down and deck 2\'s LOW back to the middle, both within 2 beats of beat 1.',
    },
    {
      text: 'Finish the mix. Pull channel 1\'s fader down, or slide the crossfader to deck 2. Deck 1 drops out and deck 2 plays on.',
      targets: ['m.fader1', 'm.xfader'],
      section: 'mixer',
      setup: (api) => api.ensurePlaying([true, true]),
      done: ({ state }) => channelGain(state.mixer, 0) <= DECK_1_OUT_GAIN,
      hint: 'Drag channel 1\'s fader to the bottom, or the crossfader all the way to deck 2.',
    },
  ],
  score: guardSkips((ctxs) => {
    const { landing, gap, lateBeat } = swapTiming(findSwap(ctxs[1]));
    const overlap = ctxs.flatMap((ctx) => ctx.samples).filter((item) => isOverlapping(item.at));
    const errors = overlap.map((item) => phaseErrorMs(item.at));
    const meanPhase = errors.length ? mean(errors) : 0;
    const worstPhase = errors.length ? maxOf(errors) : 0;
    const overlapSeconds = overlap.length * SAMPLE_INTERVAL_S;
    const outAfter = ctxs[2].state.decks[1].beat - lateBeat;

    const onPhrase = Math.abs(landing) <= ON_PHRASE.two;
    const gapOk = gap <= SWAP_GAP.two;
    const phaseOk = meanPhase <= PHASE_MEAN_OK_MS;
    let stars = 1;
    if (onPhrase && gapOk && phaseOk) stars = 2;
    if (Math.abs(landing) <= ON_PHRASE.three && gap <= SWAP_GAP.three && phaseOk) stars = 3;

    return {
      stars,
      lines: [
        `Swap landed ${describeBeatOffset(landing, 'the phrase')}.`,
        `Phase held within ${Math.ceil(worstPhase)} ms over ${fmtSeconds(overlapSeconds)} of overlap.`,
      ],
      rows: [
        { label: 'Swap against the phrase start', value: describeBeatOffset(landing, 'the phrase'), ok: onPhrase },
        { label: 'Gap between the LOW moves', value: fmtBeats(Math.max(0, gap)), ok: gapOk },
        { label: 'Phase while both played', value: `${Math.round(meanPhase)} ms on average`, ok: phaseOk },
        { label: 'Deck 1 taken out', value: `${fmtBeats(Math.max(0, outAfter))} after the swap`, ok: true },
      ],
    };
  }),
};

export const MIX_UNIT = Object.freeze({
  id: 'mix',
  title: 'Your first mix',
  blurb: 'Hand over the bass.',
  lessons: Object.freeze([bassSwap]),
});
