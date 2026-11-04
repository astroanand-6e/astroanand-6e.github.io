/** Starting positions shared by several levels. See setup.js for how a scene is built. */

/** Phrase start, at least 64 beats into the track so the music is in full swing. */
export const PHRASE_START = Object.freeze({ phrase: 0, minBeat: 64 });

/** A phrase position (beats into the 32 beat phrase), at least 64 beats into the track. */
export const phraseAt = (phrase) => ({ phrase, minBeat: PHRASE_START.minBeat });

/** Pairs for the tempo levels: a clear BPM gap the tempo fader can still close. */
export const TEMPO_PAIR = Object.freeze({ minGapBpm: 2, wantGapBpm: 4 });

/**
 * Pairs for every other level: the same gap, so one pair serves the whole course
 * (and, in the shipped library, is the pair the engine starts with: no re-render).
 */
export const DEFAULT_PAIR = Object.freeze({ wantGapBpm: TEMPO_PAIR.wantGapBpm });

/** Both decks playing in phase, deck 1 first, deck 2 locked on with BEAT SYNC. */
export const syncedScene = (mixer = {}, phrase = 0) => ({
  mixer,
  at: phraseAt(phrase),
  play: [true, true],
  sync: true,
});
