/** Test fixture: two decks sharing one fake clock, wired like the engine wires them. */
import { Deck, LOOKAHEAD_SECONDS } from './deck.js';
import { createFakeAudio, fakeTrack } from './fake-audio.js';

/** Two decks sharing one fake clock, like the engine wires them. */
export function createPair({ bpms = [120, 126] } = {}) {
  const events = [];
  const fake = createFakeAudio();
  const decks = [];
  const make = (index) => new Deck({
    index, audio: fake.audio, emit: (event) => events.push(event), peer: () => decks[1 - index],
  });
  decks.push(make(0), make(1));
  decks.forEach((deck, i) => deck.load(fakeTrack({ id: `t${i + 1}`, bpm: bpms[i] })));
  events.length = 0;
  fake.clear();
  return {
    decks, fake, events,
    eventsOf: (type) => events.filter((e) => e.type === type),
    /** Moves the clock so that changes scheduled by earlier calls have taken effect. */
    settle: () => fake.advance(LOOKAHEAD_SECONDS * 2),
    positionOf: (i) => decks[i].positionAt(fake.clock.time),
  };
}
