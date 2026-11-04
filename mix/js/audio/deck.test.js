import test from 'node:test';
import assert from 'node:assert/strict';
import { Deck, LOOKAHEAD_SECONDS } from './deck.js';
import { createPair } from './deck-fixtures.js';
import { fakeTrack } from './fake-audio.js';
import { beatPhase, secondsToBeats, wrapPhase } from './grid.js';

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);

test('a loaded deck starts paused at zero with the default hot cue and pad state', () => {
  const { decks, fake } = createPair();
  const state = decks[0].snapshot(fake.clock.time);
  assert.equal(state.playing, false);
  assert.equal(state.position, 0);
  assert.equal(state.cuePoint, 0);
  assert.deepEqual(state.hotCues, Array(8).fill(null));
  assert.equal(state.loop, null);
  assert.equal(state.padMode, 'hotcue');
  assert.equal(state.rate, 1);
  assert.equal(state.bpm, 120);
  assert.equal(state.id, 1);
  assert.equal(state.bar, 1);
  assert.equal(state.phraseBeat, 0);
});

test('snapshots are fresh objects that cannot corrupt the deck', () => {
  const { decks, fake } = createPair();
  const a = decks[0].snapshot(fake.clock.time);
  a.hotCues[0] = 99;
  a.track.title = 'hacked';
  const b = decks[0].snapshot(fake.clock.time);
  assert.notEqual(a, b);
  assert.equal(b.hotCues[0], null);
  assert.equal(b.track.title, 't1');
});

test('play starts the audio from the playhead and advances in time', () => {
  const { decks, fake, eventsOf } = createPair();
  decks[0].togglePlay();
  const start = fake.lastCall('start');
  near(start.position, 0);
  near(start.time, fake.clock.time + LOOKAHEAD_SECONDS);
  assert.equal(eventsOf('play').length, 1);
  fake.advance(LOOKAHEAD_SECONDS + 2);
  near(decks[0].positionAt(fake.clock.time), 2);
  const state = decks[0].snapshot(fake.clock.time);
  assert.equal(state.playing, true);
  near(state.beat, 4);
  assert.equal(state.bar, 2);
});

test('pause freezes the position and silences the audio', () => {
  const { decks, fake, eventsOf } = createPair();
  decks[0].togglePlay();
  fake.advance(1);
  decks[0].togglePlay();
  fake.advance(5);
  near(decks[0].positionAt(fake.clock.time), 1 - LOOKAHEAD_SECONDS + LOOKAHEAD_SECONDS, 0.02);
  assert.equal(decks[0].snapshot(fake.clock.time).playing, false);
  assert.equal(fake.callsNamed('stop').length >= 1, true);
  assert.equal(eventsOf('pause').length, 1);
});

test('CUE while paused away from the cue sets the cue point on the beat', () => {
  const { decks, fake, eventsOf } = createPair();
  decks[0].seek(10.02); // beat 20.04 at 120 BPM -> snaps to 10.0
  fake.advance(0.05);
  decks[0].cueDown();
  decks[0].cueUp();
  near(decks[0].cuePoint, 10);
  assert.equal(eventsOf('cue').at(-1).action, 'set');
});

test('CUE far from a beat keeps the exact position', () => {
  const { decks, fake } = createPair();
  decks[0].seek(10.2);
  fake.advance(0.05);
  decks[0].cueDown();
  near(decks[0].cuePoint, 10.2);
});

test('holding CUE at the cue point previews and releasing snaps back and pauses', () => {
  const { decks, fake } = createPair();
  decks[0].seek(8);
  fake.advance(0.05);
  decks[0].cueDown(); // sets the cue at 8
  decks[0].cueUp();
  fake.advance(0.1);
  decks[0].cueDown(); // at the cue: preview
  assert.equal(decks[0].isPlaying(), true);
  fake.advance(1.5);
  assert.ok(decks[0].positionAt(fake.clock.time) > 9);
  decks[0].cueUp();
  fake.advance(0.1);
  assert.equal(decks[0].isPlaying(), false);
  near(decks[0].positionAt(fake.clock.time), 8);
});

test('CUE while playing returns to the cue point and pauses', () => {
  const { decks, fake, eventsOf } = createPair();
  decks[0].seek(4);
  fake.advance(0.05);
  decks[0].cueDown();
  decks[0].cueUp();
  decks[0].togglePlay();
  fake.advance(3);
  decks[0].cueDown();
  fake.advance(0.1);
  assert.equal(decks[0].isPlaying(), false);
  near(decks[0].positionAt(fake.clock.time), 4);
  assert.equal(eventsOf('cue').some((e) => e.action === 'return'), true);
});

test('pressing PLAY while previewing latches playback past the CUE release', () => {
  const { decks, fake } = createPair();
  decks[0].cueDown();
  decks[0].togglePlay();
  decks[0].cueUp();
  fake.advance(0.5);
  assert.equal(decks[0].isPlaying(), true);
});

test('SHIFT+CUE returns to the start of the track', () => {
  const { decks, fake } = createPair();
  decks[0].seek(40);
  decks[0].shift = true;
  decks[0].cueDown();
  fake.advance(0.1);
  near(decks[0].positionAt(fake.clock.time), 0);
});

test('seek moves a paused deck, clamps, and emits an event', () => {
  const { decks, fake, eventsOf } = createPair();
  decks[1].seek(30);
  fake.advance(0.05);
  near(decks[1].positionAt(fake.clock.time), 30);
  decks[1].seek(-5);
  fake.advance(0.05);
  near(decks[1].positionAt(fake.clock.time), 0);
  decks[1].seek(1e9);
  fake.advance(0.05);
  assert.ok(decks[1].positionAt(fake.clock.time) < decks[1].duration);
  assert.equal(eventsOf('seek').length, 3);
  assert.equal(eventsOf('seek')[0].deck, 1);
  assert.equal(eventsOf('seek')[0].deckId, 2);
});

test('seek while playing restarts the audio at the new position', () => {
  const { decks, fake } = createPair();
  decks[0].togglePlay();
  fake.advance(0.5);
  fake.clear();
  decks[0].seek(60);
  const start = fake.lastCall('start');
  near(start.position, 60);
});

test('tempo fader maps to rate, effective BPM and the audio rate', () => {
  const { decks, fake } = createPair();
  decks[0].togglePlay();
  fake.advance(0.5);
  decks[0].setTempo(1);
  fake.advance(1);
  const state = decks[0].snapshot(fake.clock.time);
  near(state.rate, 1.08);
  near(state.bpm, 120 * 1.08);
  assert.equal(state.tempo, 1);
  const audioRate = fake.lastCall('setRate');
  near(audioRate.base, 1.08);
});

test('playback speed follows the tempo fader', () => {
  const { decks, fake } = createPair();
  decks[0].setTempo(-1);
  decks[0].togglePlay();
  fake.advance(LOOKAHEAD_SECONDS + 10);
  near(decks[0].positionAt(fake.clock.time), 10 * 0.92, 1e-3);
});

test('SYNC matches the leader tempo and snaps the beat phase while both play', () => {
  const { decks, fake } = createPair({ bpms: [120, 126] });
  decks[0].seek(20.123);
  decks[1].seek(31.777);
  fake.advance(0.05);
  decks[0].togglePlay();
  decks[1].togglePlay();
  fake.advance(0.5);
  decks[1].pressSync();
  fake.advance(0.2);
  const t = fake.clock.time;
  const a = decks[0].snapshot(t);
  const b = decks[1].snapshot(t);
  assert.equal(b.synced, true);
  near(b.bpm, a.bpm, 1e-6);
  const offset = wrapPhase(beatPhase(b.beat) - beatPhase(a.beat));
  near(offset, 0, 2e-3);
});

test('a synced deck keeps its phase while both keep playing', () => {
  const { decks, fake } = createPair({ bpms: [120, 126] });
  decks[0].seek(5);
  decks[1].seek(9.31);
  fake.advance(0.05);
  decks[0].togglePlay();
  decks[1].togglePlay();
  fake.advance(0.2);
  decks[1].pressSync();
  fake.advance(0.3);
  for (let i = 0; i < 10; i += 1) {
    fake.advance(3.37);
    const a = decks[0].snapshot(fake.clock.time);
    const b = decks[1].snapshot(fake.clock.time);
    near(wrapPhase(beatPhase(b.beat) - beatPhase(a.beat)), 0, 2e-3);
  }
});

test('a synced deck follows the leader when its tempo fader moves', () => {
  const { decks, fake } = createPair({ bpms: [120, 126] });
  decks[1].pressSync();
  decks[0].setTempo(0.5);
  decks[1].followLeader();
  fake.advance(1);
  const a = decks[0].snapshot(fake.clock.time);
  const b = decks[1].snapshot(fake.clock.time);
  near(b.bpm, a.bpm, 1e-6);
  near(a.bpm, 120 * 1.04);
});

test('moving the follower tempo fader releases sync; SHIFT+SYNC cancels it too', () => {
  const { decks, fake, eventsOf } = createPair();
  decks[1].pressSync();
  assert.equal(decks[1].synced, true);
  decks[1].setTempo(0.2);
  assert.equal(decks[1].synced, false);
  decks[1].pressSync();
  assert.equal(decks[1].synced, true);
  decks[1].shift = true;
  decks[1].pressSync();
  assert.equal(decks[1].synced, false);
  fake.advance(1);
  near(decks[1].snapshot(fake.clock.time).rate, 1.016, 1e-9);
  assert.ok(eventsOf('sync').length >= 4);
});

test('syncing the leader hands the follower role over without a cycle', () => {
  const { decks } = createPair();
  decks[1].pressSync();
  decks[0].pressSync();
  assert.equal(decks[0].synced, true);
  assert.equal(decks[1].synced, false);
});

test('loading a track resets the deck, and is refused while playing', () => {
  const { decks, fake, eventsOf } = createPair();
  decks[0].seek(30);
  decks[0].togglePlay();
  assert.equal(decks[0].canLoad(), false);
  decks[0].togglePlay();
  assert.equal(decks[0].canLoad(), true);
  decks[0].load(fakeTrack({ id: 'next', bpm: 124 }));
  fake.advance(0.1);
  const state = decks[0].snapshot(fake.clock.time);
  assert.equal(state.track.id, 'next');
  assert.equal(state.position, 0);
  assert.equal(state.bpm, 124);
  assert.equal(eventsOf('loaded').length, 1);
});

test('a deck without a track ignores transport controls', () => {
  const { decks, fake } = createPair();
  const empty = new Deck({ index: 0, audio: fake.audio, emit: () => {}, peer: () => decks[1] });
  empty.togglePlay();
  empty.cueDown();
  empty.seek(5);
  empty.pressSync();
  const state = empty.snapshot(fake.clock.time);
  assert.equal(state.track, null);
  assert.equal(state.playing, false);
  assert.equal(state.duration, 0);
});

test('the deck pauses itself at the end of the track', () => {
  const { decks, fake, eventsOf } = createPair();
  decks[0].seek(decks[0].duration - 1);
  decks[0].togglePlay();
  fake.advance(3);
  decks[0].housekeeping(fake.clock.time);
  assert.equal(decks[0].isPlaying(), false);
  near(decks[0].positionAt(fake.clock.time), decks[0].duration, 1e-6);
  assert.equal(eventsOf('pause').at(-1).reason, 'end');
});

test('beat counters follow the track grid, not the playback rate', () => {
  const { decks, fake } = createPair();
  decks[0].setTempo(1);
  decks[0].seek(10);
  fake.advance(0.05);
  const state = decks[0].snapshot(fake.clock.time);
  near(state.beat, secondsToBeats(10, 120));
  near(state.phraseBeat, 20);
});
