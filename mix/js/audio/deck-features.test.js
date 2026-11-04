import test from 'node:test';
import assert from 'node:assert/strict';
import { createPair } from './deck-fixtures.js';
import { LOOKAHEAD_SECONDS } from './deck.js';
import { padDown, padUp, PAD_LABELS, SAMPLER_SOUNDS } from './deck-pads.js';
import { loopDouble, loopExit, loopHalf, loopIn, loopOut } from './deck-loops.js';
import { NUDGE_MAX_BEND, SCRUB_SECONDS_PER_TURN, jog } from './deck-jog.js';

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);

function playing(position = 0) {
  const pair = createPair({ bpms: [120, 126] });
  pair.decks[0].seek(position);
  pair.fake.advance(0.05);
  pair.decks[0].togglePlay();
  pair.fake.advance(0.05);
  return pair;
}

test('a hot cue pad on an empty slot sets a cue at the playhead', () => {
  const { decks, fake, eventsOf } = playing(10.01);
  padDown(decks[0], 2);
  near(decks[0].hotCues[2], 10, 0.02);
  const event = eventsOf('hotcue-set')[0];
  assert.equal(event.index, 2);
  assert.equal(event.deckId, 1);
  assert.ok(fake.clock.time > 0);
});

test('a hot cue pad on a set slot jumps there and keeps playing', () => {
  const { decks, fake, eventsOf } = playing(10);
  padDown(decks[0], 0);
  fake.advance(5);
  padDown(decks[0], 1); // sets cue 2 at ~15
  fake.advance(5);
  padDown(decks[0], 0);
  fake.advance(LOOKAHEAD_SECONDS + 0.5);
  assert.equal(decks[0].isPlaying(), true);
  near(decks[0].positionAt(fake.clock.time), decks[0].hotCues[0] + 0.5, 0.05);
  assert.equal(eventsOf('hotcue-jump').length, 1);
});

test('SHIFT plus a hot cue pad clears the cue', () => {
  const { decks, eventsOf } = playing(10);
  padDown(decks[0], 3);
  assert.notEqual(decks[0].hotCues[3], null);
  decks[0].shift = true;
  padDown(decks[0], 3);
  assert.equal(decks[0].hotCues[3], null);
  assert.equal(eventsOf('hotcue-clear').length, 1);
});

test('a hot cue pad on a paused deck previews while held and returns on release', () => {
  const { decks, fake } = createPair();
  decks[0].seek(20);
  fake.advance(0.05);
  padDown(decks[0], 0); // set at 20
  padUp(decks[0], 0);
  decks[0].seek(50);
  fake.advance(0.05);
  padDown(decks[0], 0); // jump + preview
  fake.advance(LOOKAHEAD_SECONDS + 1);
  assert.equal(decks[0].isPlaying(), true);
  assert.ok(decks[0].positionAt(fake.clock.time) > 20.5);
  padUp(decks[0], 0);
  fake.advance(0.1);
  assert.equal(decks[0].isPlaying(), false);
  near(decks[0].positionAt(fake.clock.time), decks[0].hotCues[0]);
});

test('beat jump pads move by -1/+1/-2/+2/-4/+4/-8/+8 beats', () => {
  const expected = [-1, 1, -2, 2, -4, 4, -8, 8];
  expected.forEach((beats, pad) => {
    const { decks, fake, eventsOf } = createPair();
    decks[0].padMode = 'beatjump';
    decks[0].seek(60);
    fake.advance(0.05);
    padDown(decks[0], pad);
    fake.advance(0.05);
    near(decks[0].positionAt(fake.clock.time), 60 + beats * 0.5, 1e-6);
    assert.equal(eventsOf('beatjump').at(-1).beats, beats);
  });
});

test('beat jump clamps at the start of the track', () => {
  const { decks, fake } = createPair();
  decks[0].padMode = 'beatjump';
  decks[0].seek(1);
  fake.advance(0.05);
  padDown(decks[0], 6);
  fake.advance(0.05);
  near(decks[0].positionAt(fake.clock.time), 0);
});

test('beat jump inside a loop moves the loop with the playhead', () => {
  const { decks, fake } = playing(8);
  decks[0].padMode = 'beatjump';
  loopExit(decks[0]); // 4 beat loop
  fake.advance(0.1);
  const before = decks[0].loop;
  padDown(decks[0], 7); // +8 beats = 4 s
  fake.advance(0.1);
  near(decks[0].loop.start, before.start + 4, 1e-3);
  near(decks[0].loop.end - decks[0].loop.start, before.end - before.start, 1e-3);
  assert.ok(decks[0].positionAt(fake.clock.time) >= decks[0].loop.start);
});

test('sampler pads trigger one-shots through the audio layer', () => {
  const { decks, fake, eventsOf } = playing(0);
  decks[0].padMode = 'sampler';
  SAMPLER_SOUNDS.forEach((name, pad) => padDown(decks[0], pad));
  assert.deepEqual(fake.callsNamed('trigger').map((c) => c.name), [...SAMPLER_SOUNDS]);
  assert.equal(eventsOf('sample').length, SAMPLER_SOUNDS.length);
  padDown(decks[0], 5);
  assert.equal(fake.lastCall('trigger').name, SAMPLER_SOUNDS[0]);
});

test('pad FX rolls repeat a slice on the beat grid while the pad is held', () => {
  const { decks, fake, eventsOf } = playing(10.13);
  decks[0].padMode = 'padfx';
  padDown(decks[0], 1); // 1/4 beat = 0.125 s
  const roll = fake.lastCall('startRoll');
  near(roll.length, 0.125);
  near(roll.start % 0.125, 0, 1e-9);
  assert.ok(roll.start <= decks[0].positionAt(fake.clock.time) + 0.02);
  assert.equal(eventsOf('fx').at(-1).active, true);
  padUp(decks[0], 1);
  assert.equal(fake.callsNamed('stopRoll').length, 1);
  assert.equal(eventsOf('fx').at(-1).active, false);
});

test('pad FX does nothing on a paused deck', () => {
  const { decks, fake } = createPair();
  decks[0].padMode = 'padfx';
  padDown(decks[0], 0);
  assert.equal(fake.callsNamed('startRoll').length, 0);
});

test('pad labels describe every mode', () => {
  assert.equal(PAD_LABELS.beatjump[0], '-1');
  assert.equal(PAD_LABELS.beatjump[7], '+8');
  assert.equal(PAD_LABELS.padfx[0], '1/2');
  assert.equal(PAD_LABELS.padfx[3], '1/16');
  assert.equal(PAD_LABELS.sampler[2], 'riser');
  assert.equal(PAD_LABELS.hotcue.length, 8);
});

test('loop in then loop out creates a beat-aligned loop and the playhead wraps', () => {
  const { decks, fake, eventsOf } = playing(10.03);
  loopIn(decks[0]);
  fake.advance(1.98);
  loopOut(decks[0]);
  const loop = decks[0].loop;
  near(loop.start, 10, 1e-3);
  near(loop.end, 12, 1e-3);
  near(loop.beats, 4, 1e-3);
  const event = eventsOf('loop').at(-1);
  assert.equal(event.active, true);
  fake.advance(10);
  const position = decks[0].positionAt(fake.clock.time);
  assert.ok(position >= loop.start && position < loop.end, `position ${position} outside loop`);
});

test('the loop audio is handed the snapped loop', () => {
  const { decks, fake } = playing(10);
  loopExit(decks[0]);
  const start = fake.lastCall('start');
  assert.ok(start.loop);
  near(start.loop.end - start.loop.start, decks[0].loop.end - decks[0].loop.start, 1e-12);
});

test('4 beat / exit starts a four-beat loop, then exits it', () => {
  const { decks, fake, eventsOf } = playing(10.2);
  loopExit(decks[0]);
  near(decks[0].loop.beats, 4);
  near(decks[0].loop.start % 0.5, 0, 1e-3);
  fake.advance(3);
  loopExit(decks[0]);
  assert.equal(decks[0].loop, null);
  assert.equal(eventsOf('loop').at(-1).active, false);
  fake.advance(5);
  assert.ok(decks[0].positionAt(fake.clock.time) > 12, 'playback continues past the old loop');
});

test('loop half and double change the length from the loop start', () => {
  const { decks, fake } = playing(10);
  loopExit(decks[0]);
  const start = decks[0].loop.start;
  loopHalf(decks[0]);
  near(decks[0].loop.beats, 2, 1e-3);
  near(decks[0].loop.start, start, 1e-3);
  loopDouble(decks[0]);
  loopDouble(decks[0]);
  near(decks[0].loop.beats, 8, 1e-3);
  fake.advance(0.1);
  assert.ok(decks[0].positionAt(fake.clock.time) >= decks[0].loop.start);
});

test('loop half and double do nothing without a loop', () => {
  const { decks } = playing(10);
  loopHalf(decks[0]);
  loopDouble(decks[0]);
  assert.equal(decks[0].loop, null);
});

test('seeking outside an active loop drops it', () => {
  const { decks, eventsOf } = playing(10);
  loopExit(decks[0]);
  decks[0].seek(100);
  assert.equal(decks[0].loop, null);
  assert.equal(eventsOf('loop').at(-1).active, false);
});

test('seeking inside an active loop keeps it', () => {
  const { decks } = playing(10);
  loopExit(decks[0]);
  const { start, end } = decks[0].loop;
  decks[0].seek((start + end) / 2);
  assert.ok(decks[0].loop);
});

test('jog nudge speeds the deck up for a clockwise push, then decays', () => {
  const { decks, fake } = playing(10);
  const before = decks[0].positionAt(fake.clock.time);
  for (let i = 0; i < 20; i += 1) {
    fake.advance(0.016);
    jog(decks[0], { delta: 0.02, touch: false });
  }
  const rate = fake.lastCall('setRate');
  assert.ok(rate.bend > 0 && rate.bend <= NUDGE_MAX_BEND + 1e-9, `bend ${rate.bend}`);
  const elapsed = 20 * 0.016;
  const gain = decks[0].positionAt(fake.clock.time) - before - elapsed;
  assert.ok(gain > 0, 'nudging forward must move the playhead ahead of real time');
  fake.advance(3);
  near(decks[0].snapshot(fake.clock.time).rate, 1);
  const settled = decks[0].positionAt(fake.clock.time);
  fake.advance(1);
  near(decks[0].positionAt(fake.clock.time) - settled, 1, 1e-6);
});

test('a counter-clockwise nudge slows the deck down', () => {
  const { decks, fake } = playing(10);
  const before = decks[0].positionAt(fake.clock.time);
  for (let i = 0; i < 20; i += 1) {
    fake.advance(0.016);
    jog(decks[0], { delta: -0.02, touch: false });
  }
  assert.ok(decks[0].positionAt(fake.clock.time) - before - 20 * 0.016 < 0);
});

test('touching the platter scrubs the position and releasing resumes playback', () => {
  const { decks, fake } = playing(10);
  jog(decks[0], { delta: 0, touch: true });
  assert.equal(fake.callsNamed('scrubBegin').length, 1);
  assert.equal(decks[0].snapshot(fake.clock.time).playing, true);
  const start = decks[0].positionAt(fake.clock.time + LOOKAHEAD_SECONDS); // the held position
  for (let i = 0; i < 10; i += 1) {
    fake.advance(0.016);
    jog(decks[0], { delta: 0.05, touch: true });
  }
  const scrubbed = decks[0].positionAt(fake.clock.time);
  near(scrubbed - start, 10 * 0.05 * SCRUB_SECONDS_PER_TURN, 1e-6);
  const move = fake.lastCall('scrubMove');
  assert.ok(move.velocity > 0);
  jog(decks[0], { delta: 0, touch: false });
  assert.equal(fake.callsNamed('scrubEnd').length, 1);
  fake.advance(0.5);
  assert.equal(decks[0].isPlaying(), true);
  assert.ok(decks[0].positionAt(fake.clock.time) > scrubbed);
});

test('scrubbing backwards moves the playhead back and a paused deck stays paused', () => {
  const { decks, fake } = createPair();
  decks[0].seek(30);
  fake.advance(0.05);
  jog(decks[0], { delta: 0, touch: true });
  fake.advance(0.016);
  jog(decks[0], { delta: -0.1, touch: true });
  const move = fake.lastCall('scrubMove');
  assert.ok(move.velocity < 0);
  near(decks[0].positionAt(fake.clock.time), 30 - 0.1 * SCRUB_SECONDS_PER_TURN, 1e-6);
  jog(decks[0], { delta: 0, touch: false });
  fake.advance(0.5);
  assert.equal(decks[0].isPlaying(), false);
});

test('an untouched jog on a paused deck scrubs and ends when the wheel stops', () => {
  const { decks, fake } = createPair();
  decks[0].seek(30);
  fake.advance(0.05);
  jog(decks[0], { delta: 0.05, touch: false });
  assert.equal(fake.callsNamed('scrubBegin').length, 1);
  fake.advance(0.5);
  decks[0].housekeeping(fake.clock.time);
  assert.equal(fake.callsNamed('scrubEnd').length, 1);
  assert.equal(decks[0].scrub, null);
});

test('jog events on an empty deck are ignored', () => {
  const { decks, fake } = createPair();
  decks[0].track = null;
  jog(decks[0], { delta: 0.2, touch: true });
  assert.equal(fake.callsNamed('scrubBegin').length, 0);
});
