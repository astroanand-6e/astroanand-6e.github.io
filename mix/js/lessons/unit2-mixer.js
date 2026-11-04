/**
 * Unit 2, the mixer. Level 4 faders and crossfader, level 5 EQ, level 6 the filter.
 *
 * Value conventions (contract): EQ -1 is a full cut, 0 flat, +1 a boost; CFX 0 is
 * off, below 0 a low-pass sweep (highs roll off), above 0 a high-pass sweep
 * (bass thins out); crossfader -1 is all deck 1, +1 all deck 2, both in the middle.
 */
import { BEATS_PER_BAR, PHRASE_BEATS } from '../controls.js';
import { findExcursion, holdSeconds, lastCrossing, playerEvents, transitSeconds, valuesOf } from './checks.js';
import { describeBeatOffset, fmtBeats } from './format.js';
import { barAndBeat, barOffset, channel, phraseOffset, phrasePos } from './metrics.js';
import { PHRASE_START, phraseAt, syncedScene } from './scenes.js';
import { guardSkips, starsHigherIsBetter, starsLowerIsBetter } from './scoring.js';

const SECONDS_PER_MINUTE = 60;
const percent = (value) => Math.round(value * 100);

/* Level 4: faders and crossfader */
const BLEND_MIN = 0.35;
const BLEND_MAX = 0.85;
const DECK_1_FULL = 0.8;
const BLEND_HOLD_S = 1;
const XFADE_LOW = 0.1;
const XFADE_HIGH = 0.9;
/** Seconds the crossfader spends between 10% and 90% of its travel (the step asks for a 4 second slide). */
const FADE_STARS = Object.freeze({ three: 3, two: 1.5 });

const blendedUnder = (state) => {
  const [first, second] = [channel(state.mixer, 'fader', 0), channel(state.mixer, 'fader', 1)];
  return second >= BLEND_MIN && second <= BLEND_MAX && first >= DECK_1_FULL;
};

function crossfaderLabel(value) {
  if (Math.abs(value) < 0.05) return 'Crossfader in the middle';
  return `Crossfader ${percent(Math.abs(value))}% toward deck ${value > 0 ? 2 : 1}`;
}

const fadersAndCrossfader = {
  id: 'faders-and-crossfader',
  title: 'Faders and crossfader',
  blurb: 'Bring a second deck in under the first.',
  steps: [
    {
      text: 'Deck 1 plays at full. Raise channel 2\'s fader about halfway. Deck 2 comes in under deck 1.',
      targets: ['m.fader2'],
      section: 'mixer',
      setup: (api) => api.scene(syncedScene({ 'm.fader1': 1, 'm.fader2': 0, 'm.xfader': 0 })),
      done: (ctx) => holdSeconds(ctx, blendedUnder) >= BLEND_HOLD_S,
      readout: ({ state }) => `Channel 2 fader ${percent(channel(state.mixer, 'fader', 1))}%`,
      hint: 'Drag the channel 2 fader up from the bottom and stop around the middle, so deck 1 stays louder.',
    },
    {
      text: 'The crossfader blends both decks. Slide it from the middle toward deck 2 and deck 1 fades out. Take 4 seconds or more: a slow slide sounds smoother.',
      targets: ['m.xfader'],
      section: 'mixer',
      setup: (api) => {
        api.ensure({ 'm.xfader': 0 });
        api.ensurePlaying([true, true]);
      },
      done: ({ state }) => state.mixer.xfader >= XFADE_HIGH,
      readout: ({ state }) => crossfaderLabel(state.mixer.xfader),
      hint: 'Drag the crossfader to the deck 2 end. Slower is smoother.',
    },
    {
      text: 'Slide the crossfader back to the middle. Both decks play again.',
      targets: ['m.xfader'],
      section: 'mixer',
      setup: (api) => api.ensurePlaying([true, true]),
      done: ({ state }) => Math.abs(state.mixer.xfader) <= XFADE_LOW,
      readout: ({ state }) => crossfaderLabel(state.mixer.xfader),
      hint: 'Drag the crossfader back to the center mark.',
    },
  ],
  score: guardSkips((ctxs) => {
    const [blendCtx, fadeCtx] = ctxs;
    const seconds = transitSeconds(fadeCtx.events, 'm.xfader', { lo: XFADE_LOW, hi: XFADE_HIGH }) || 0;
    const beats = (seconds * fadeCtx.state.decks[0].bpm) / SECONDS_PER_MINUTE;
    const stars = starsHigherIsBetter(seconds, FADE_STARS);
    const level = percent(channel(blendCtx.state.mixer, 'fader', 1));
    return {
      stars,
      lines: [
        `The crossfade took ${seconds.toFixed(1)} s (${fmtBeats(beats)}).`,
        stars === 3
          ? `Deck 2 came in at ${level}% under deck 1.`
          : 'Take 4 seconds or more for a smooth blend.',
      ],
    };
  }),
};

/* Level 5: EQ */
const KILL_LEVEL = -0.9;
const HALF_CUT_LEVEL = -0.5;
const FLAT_LEVEL = -0.1;
const RESTORE_STARS = Object.freeze({ three: 0.25, two: 0.5 }); // beats from the downbeat

const restoreEvent = (ctx) =>
  lastCrossing(ctx.events, 'm.low2', {
    threshold: HALF_CUT_LEVEL,
    direction: 'up',
    startValue: channel(ctx.start.mixer, 'low', 1),
  });

function trebleCutAndBack(ctx) {
  const values = valuesOf(ctx, 'm.hi2');
  const cut = values.findIndex((value) => value <= HALF_CUT_LEVEL);
  return cut >= 0 && values.slice(cut).some((value) => value >= FLAT_LEVEL) && channel(ctx.state.mixer, 'hi', 1) >= FLAT_LEVEL;
}

const eq = {
  id: 'eq',
  title: 'EQ',
  blurb: 'Cut the bass and bring it back on a downbeat.',
  steps: [
    {
      text: 'Each channel has HI, MID and LOW knobs for treble, mids and bass. Turn HI on channel 2 all the way down, then back to the middle. The hats fade out and return.',
      targets: ['m.hi2'],
      section: 'mixer',
      setup: (api) => api.scene({ mixer: { 'm.fader1': 1, 'm.fader2': 1 }, at: PHRASE_START, play: [false, true] }),
      done: trebleCutAndBack,
      hint: 'Drag the HI knob on channel 2 to the far left, then return it to the middle.',
    },
    {
      text: 'Now the bass. Turn LOW on channel 2 all the way down. The kick and bassline vanish and the track thins out.',
      targets: ['m.low2'],
      section: 'mixer',
      setup: (api) => {
        api.ensure({ 'm.hi2': 0 });
        api.ensurePlaying([false, true]);
      },
      done: ({ state }) => channel(state.mixer, 'low', 1) <= KILL_LEVEL,
      hint: 'Drag the LOW knob on channel 2 all the way to the left.',
    },
    {
      text: 'Bring the bass back on a downbeat. Turn LOW up to the middle so the kick returns on beat 1 of a bar.',
      targets: ['m.low2'],
      section: 'mixer',
      pulse: 1,
      setup: (api) => {
        api.ensure({ 'm.low2': -1 });
        api.ensurePlaying([false, true]);
      },
      done: (ctx) => channel(ctx.state.mixer, 'low', 1) >= FLAT_LEVEL && restoreEvent(ctx) !== null,
      readout: ({ state }) => {
        const { bar, beat } = barAndBeat(state.decks[1]);
        return `Bar ${bar}   Beat ${beat} of ${BEATS_PER_BAR}`;
      },
      hint: 'Watch the beat dots. Start turning on dot 4 so the knob passes the halfway mark as dot 1 lights.',
    },
  ],
  score: guardSkips((ctxs) => {
    const event = restoreEvent(ctxs[2]);
    const offset = barOffset(event.at.decks[1].beat);
    const stars = starsLowerIsBetter(Math.abs(offset), RESTORE_STARS);
    const tip = offset > 0 ? 'Start turning a little earlier.' : 'Wait a little longer before you turn.';
    return {
      stars,
      lines: [
        `The bass came back ${describeBeatOffset(offset, 'the downbeat')}.`,
        stars === 3 ? 'The kick returned right on beat 1.' : tip,
      ],
    };
  }),
};

/* Level 6: the filter */
const FILTER_INNER = 0.1;
const FILTER_PEAK = 0.6;
const WARM_UP_LEVEL = -0.5;
const SWEEP_WINDOW = Object.freeze({ min: 12, max: 20 }); // beats, about 4 bars
const SWEEP_BEATS = 4 * BEATS_PER_BAR;
const LAND_THREE_BEATS = 0.5;
const LAND_TWO_BEATS = 1;
const SWEEP_START_PHRASE = 6; // beats into the phrase, so the halfway mark is 10 beats away

const filterOff = (state) => Math.abs(channel(state.mixer, 'cfx', 0)) <= FILTER_INNER;

function warmedUp(ctx) {
  const values = valuesOf(ctx, 'm.cfx1');
  const low = values.findIndex((value) => value <= WARM_UP_LEVEL);
  return low >= 0 && values.slice(low).some((value) => Math.abs(value) <= FILTER_INNER) && filterOff(ctx.state);
}

/** The event where the knob last left the middle, while it is still away from it. */
function sweepStart(ctx) {
  let start = null;
  for (const event of playerEvents(ctx, 'm.cfx1')) {
    if (Math.abs(event.value) <= FILTER_INNER) start = null;
    else if (start === null) start = event;
  }
  return start;
}

function sweepReadout(ctx) {
  const deck = ctx.state.decks[0];
  const start = sweepStart(ctx);
  const sweep = start ? deck.beat - start.at.decks[0].beat : 0;
  return `Phrase beat ${Math.floor(phrasePos(deck)) + 1} / ${PHRASE_BEATS}   Sweep ${sweep.toFixed(1)} beats`;
}

const filter = {
  id: 'the-filter',
  title: 'The filter',
  blurb: 'Sweep CFX over 4 bars and land on the phrase.',
  steps: [
    {
      text: 'The CFX knob is a filter. Turn it left on channel 1 and the highs roll off, so the track sounds muffled. Bring it back to the middle to switch the filter off.',
      targets: ['m.cfx1'],
      section: 'mixer',
      setup: (api) => api.scene({ load: [true, false], at: phraseAt(SWEEP_START_PHRASE), play: [true, false] }),
      done: warmedUp,
      hint: 'Drag the CFX knob on channel 1 to the left, then return it to the middle.',
    },
    {
      text: 'Now a 4 bar build. Start turning CFX to the right when the phrase counter reads 17. The bass thins out as you go. Snap the knob back to the middle as the counter wraps to 1.',
      targets: ['m.cfx1'],
      section: 'mixer',
      pulse: 0,
      setup: (api) => {
        api.ensure({ 'm.cfx1': 0 });
        api.place(0, phraseAt(SWEEP_START_PHRASE));
        api.ensurePlaying([true]);
      },
      done: (ctx) => findExcursion(ctx.events, 'm.cfx1', { inner: FILTER_INNER, peak: FILTER_PEAK }) !== null,
      readout: sweepReadout,
      hint: 'Make a single long, steady turn that ends at the far right as the phrase runs out, then let go at beat 1.',
    },
  ],
  score: guardSkips((ctxs) => {
    const { leave, back } = findExcursion(ctxs[1].events, 'm.cfx1', { inner: FILTER_INNER, peak: FILTER_PEAK });
    const landing = phraseOffset(phrasePos(back.at.decks[0]));
    const length = back.at.decks[0].beat - leave.at.decks[0].beat;
    const longEnough = length >= SWEEP_WINDOW.min && length <= SWEEP_WINDOW.max;
    let stars = 1;
    if (Math.abs(landing) <= LAND_TWO_BEATS) stars = 2;
    if (Math.abs(landing) <= LAND_THREE_BEATS && longEnough) stars = 3;
    return {
      stars,
      lines: [
        `The filter came back ${describeBeatOffset(landing, 'the phrase start')}.`,
        `The filter stayed on for ${fmtBeats(length)}. Aim for about ${SWEEP_BEATS}.`,
      ],
    };
  }),
};

export const MIXER_UNIT = Object.freeze({
  id: 'mixer',
  title: 'The mixer',
  blurb: 'Blend, cut and sweep.',
  lessons: Object.freeze([fadersAndCrossfader, eq, filter]),
});
