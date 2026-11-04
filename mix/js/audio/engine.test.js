import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROLS, ENGINE_EVENTS, createBus, defaultValue, emit, emitControl, on,
} from '../controls.js';
import { createEngine } from './engine.js';
import { FakeAudioContext } from './fake-context.js';
import { createLibrary, makeBufferLike } from './library.js';
import { DEFAULT_DECK_TRACK_IDS } from './tracks.js';

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);
const library = createLibrary({ makeBuffer: makeBufferLike });

before(async () => {
  for (const id of DEFAULT_DECK_TRACK_IDS) await library.ensure(id);
});

/** An engine on a fresh bus with a fake audio context and the shared pre-rendered library. */
async function harness({ withContext = true } = {}) {
  const bus = createBus();
  const events = [];
  on(bus, 'engine', (event) => events.push(event));
  const context = withContext ? new FakeAudioContext() : null;
  const engine = createEngine({ bus, context, library });
  await engine.ready;
  return {
    bus, engine, events, context,
    press: (id) => { emitControl(bus, id, true, 'pointer'); emitControl(bus, id, false, 'pointer'); },
    set: (id, value) => emitControl(bus, id, value, 'pointer'),
    eventsOf: (type) => events.filter((e) => e.type === type),
    state: () => engine.getState(),
  };
}

test('ready resolves with Paper Tiger on deck 1 and Ink Signal on deck 2, both paused at zero', async () => {
  const { engine, eventsOf } = await harness();
  const state = engine.getState();
  assert.equal(state.ready, true);
  assert.equal(state.decks[0].track.id, 'paper-tiger');
  assert.equal(state.decks[1].track.id, 'ink-signal');
  state.decks.forEach((deck) => {
    assert.equal(deck.playing, false);
    assert.equal(deck.position, 0);
  });
  assert.equal(eventsOf('ready').length, 1);
  assert.equal(eventsOf('loaded').length, 2);
  engine.dispose();
});

test('default mixer state follows the contract defaults', async () => {
  const { engine } = await harness();
  const mixer = engine.getState().mixer;
  assert.deepEqual(mixer.fader, [1, 0]);
  assert.equal(mixer.xfader, 0);
  assert.equal(mixer.master, 0.8);
  assert.deepEqual(mixer.trim, [0, 0]);
  assert.deepEqual(mixer.hi, [0, 0]);
  assert.deepEqual(mixer.cfx, [0, 0]);
  assert.deepEqual(mixer.fx, { on: false, level: 0.5, beats: 1, channel: '1&2' });
  assert.equal(engine.getState().phaseOffset, 0);
  engine.dispose();
});

test('getState returns the contract shape with fresh objects every call', async () => {
  const { engine } = await harness();
  const a = engine.getState();
  const b = engine.getState();
  assert.notEqual(a, b);
  assert.notEqual(a.decks[0], b.decks[0]);
  assert.notEqual(a.mixer.fader, b.mixer.fader);
  a.decks[0].hotCues[0] = 5;
  a.mixer.fader[0] = 0;
  assert.equal(engine.getState().decks[0].hotCues[0], null);
  assert.equal(engine.getState().mixer.fader[0], 1);
  const keys = Object.keys(a.decks[0]).sort();
  assert.deepEqual(keys, ['bar', 'beat', 'bpm', 'cuePoint', 'duration', 'hotCues', 'id', 'level', 'loop', 'padMode', 'phraseBeat', 'playing', 'position', 'rate', 'synced', 'tempo', 'track'].sort());
  assert.deepEqual(Object.keys(a).sort(), ['decks', 'mixer', 'phaseOffset', 'ready']);
  engine.dispose();
});

test('getTracks lists the four tracks with the contract fields', async () => {
  const { engine } = await harness();
  const tracks = engine.getTracks();
  assert.deepEqual(tracks.map((t) => [t.title, t.bpm, t.camelot, t.artist]), [
    ['Paper Tiger', 122, '8A', 'AT'],
    ['Ink Signal', 126, '8A', 'AT'],
    ['Charles River', 124, '8B', 'AT'],
    ['Night Bus', 120, '9A', 'AT'],
  ]);
  tracks.forEach((track) => {
    assert.deepEqual(Object.keys(track).sort(), ['artist', 'bpm', 'camelot', 'duration', 'id', 'key', 'title']);
    near(track.duration, (64 * 4 * 60) / track.bpm, 1e-3);
  });
  tracks[0].title = 'changed';
  assert.equal(engine.getTracks()[0].title, 'Paper Tiger');
  engine.dispose();
});

test('getWaveform returns three 0..1 bands at 100 bins per second for a rendered track', async () => {
  const { engine } = await harness();
  const wave = engine.getWaveform('paper-tiger');
  assert.equal(wave.binSeconds, 0.01);
  for (const band of [wave.low, wave.mid, wave.high]) {
    assert.ok(band instanceof Float32Array);
    assert.ok(Math.abs(band.length - 12590) <= 2);
    assert.ok(band.every((x) => x >= 0 && x <= 1));
  }
  assert.ok(wave.low.some((x) => x > 0.9), 'the kick should reach full height');
  assert.throws(() => engine.getWaveform('nope'));
  engine.dispose();
});

test('mixer controls land in the state with the documented conventions', async () => {
  const { engine, set, state } = await harness();
  set('m.trim1', 0.5);
  set('m.hi2', -1);
  set('m.mid1', 1);
  set('m.low2', -0.25);
  set('m.cfx1', -0.6);
  set('m.cfx2', 0.9);
  set('m.fader2', 0.7);
  set('m.xfader', 0.35);
  set('m.master', 0.55);
  const mixer = state().mixer;
  assert.deepEqual(mixer.trim, [0.5, 0]);
  assert.deepEqual(mixer.hi, [0, -1]);
  assert.deepEqual(mixer.mid, [1, 0]);
  assert.deepEqual(mixer.low, [0, -0.25]);
  assert.deepEqual(mixer.cfx, [-0.6, 0.9]);
  assert.deepEqual(mixer.fader, [1, 0.7]);
  assert.equal(mixer.xfader, 0.35);
  assert.equal(mixer.master, 0.55);
  engine.dispose();
});

test('values are clamped to the control range', async () => {
  const { engine, set, state } = await harness();
  set('m.fader1', 4);
  set('m.xfader', -9);
  set('m.trim2', 3);
  assert.equal(state().mixer.fader[0], 1);
  assert.equal(state().mixer.xfader, -1);
  assert.equal(state().mixer.trim[1], 1);
  engine.dispose();
});

test('beat FX controls: on/off, level, length steps and channel', async () => {
  const { engine, set, press, state, eventsOf } = await harness();
  set('m.fx.on', true);
  set('m.fx.level', 0.8);
  set('m.fx.channel', '2');
  assert.deepEqual(state().mixer.fx, { on: true, level: 0.8, beats: 1, channel: '2' });
  press('m.fx.beatup');
  assert.equal(state().mixer.fx.beats, 2);
  press('m.fx.beatup');
  assert.equal(state().mixer.fx.beats, 2);
  press('m.fx.beatdown');
  press('m.fx.beatdown');
  assert.equal(state().mixer.fx.beats, 0.75);
  press('m.fx.beatdown');
  press('m.fx.beatdown');
  press('m.fx.beatdown');
  assert.equal(state().mixer.fx.beats, 0.25);
  assert.ok(eventsOf('fx').length >= 7);
  assert.equal(eventsOf('fx')[0].scope, 'beatfx');
  engine.dispose();
});

test('invalid payloads are reported as engine errors and ignored', async () => {
  const { engine, set, state, eventsOf } = await harness();
  set('m.master', 'loud');
  set('m.fx.channel', '3');
  set('d1.jog', { touch: true });
  set('m.browse', 0.5);
  assert.equal(state().mixer.master, 0.8);
  assert.equal(state().mixer.fx.channel, '1&2');
  assert.equal(eventsOf('error').length, 4);
  assert.ok(eventsOf('error').every((e) => typeof e.message === 'string' && e.message.length > 0));
  engine.dispose();
});

test('controls with live:false do nothing', async () => {
  const { engine, bus, events } = await harness();
  const before = JSON.stringify(engine.getState());
  CONTROLS.filter((c) => !c.live).forEach((control) => {
    emitControl(bus, control.id, control.kind === 'knob' ? 0.9 : true, 'pointer');
  });
  assert.equal(JSON.stringify(engine.getState()), before);
  assert.equal(events.filter((e) => e.type === 'error').length, 0);
  engine.dispose();
});

test('every engine event type the engine emits is a documented one', async () => {
  const { engine, press, events } = await harness();
  press('d1.play');
  press('d1.cue');
  press('m.fx.beatup');
  assert.ok(events.every((e) => ENGINE_EVENTS.includes(e.type)), JSON.stringify(events.map((e) => e.type)));
  engine.dispose();
});

test('browse steps the selected row, clamps at both ends and announces it', async () => {
  const { engine, bus, set } = await harness();
  const selections = [];
  on(bus, 'select', (detail) => selections.push(detail.index));
  assert.equal(engine.getSelection(), 0);
  set('m.browse', -1);
  assert.equal(engine.getSelection(), 0);
  set('m.browse', 1);
  set('m.browse', 1);
  assert.equal(engine.getSelection(), 2);
  set('m.browse', 1);
  set('m.browse', 1);
  assert.equal(engine.getSelection(), 3);
  assert.deepEqual(selections, [1, 2, 3]);
  engine.dispose();
});

test('a select event picks a row directly and out-of-range picks are errors', async () => {
  const { engine, bus, eventsOf } = await harness();
  emit(bus, 'select', { index: 2 });
  assert.equal(engine.getSelection(), 2);
  emit(bus, 'select', { index: 9 });
  assert.equal(engine.getSelection(), 2);
  assert.equal(eventsOf('error').length, 1);
  engine.dispose();
});

test('load puts the selected track on a paused deck only', async () => {
  const { engine, bus, set, press, state, eventsOf, context } = await harness();
  emit(bus, 'select', { index: 2 });
  press('m.load2');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  assert.equal(state().decks[1].track.id, 'charles-river');
  assert.equal(state().decks[0].track.id, 'paper-tiger');
  assert.equal(eventsOf('loaded').at(-1).deck, 1);
  press('d1.play');
  context.currentTime = 1;
  emit(bus, 'select', { index: 3 });
  press('m.load1');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(state().decks[0].track.id, 'paper-tiger', 'a playing deck refuses a load');
  set('m.browse', -1);
  engine.dispose();
});

test('play, tempo and position follow the audio clock', async () => {
  const { engine, set, press, state, context } = await harness();
  set('d1.tempo', 1);
  press('d1.play');
  assert.equal(state().decks[0].playing, true);
  context.currentTime = 0.01 + 2;
  const deck = state().decks[0];
  near(deck.position, 2 * 1.08, 0.02);
  near(deck.bpm, 122 * 1.08, 1e-9);
  near(deck.beat, (deck.position * 122) / 60, 1e-9);
  assert.ok(context.sources().length >= 1, 'a source node was started');
  engine.dispose();
});

test('phaseOffset is zero until both decks play, then deck 2 minus deck 1 in beats', async () => {
  const { engine, press, state, context, bus } = await harness();
  engine.seek(1, 0.1);
  press('d1.play');
  assert.equal(state().phaseOffset, 0);
  press('d2.play');
  context.currentTime = 1;
  const s = state();
  const expected = ((s.decks[1].beat % 1) - (s.decks[0].beat % 1) + 1.5) % 1 - 0.5;
  near(s.phaseOffset, expected, 1e-9);
  assert.ok(Math.abs(s.phaseOffset) <= 0.5);
  assert.ok(bus);
  engine.dispose();
});

test('seek moves a deck, emits an event and validates its arguments', async () => {
  const { engine, state, eventsOf } = await harness();
  engine.seek(0, 64);
  near(state().decks[0].position, 64, 1e-6);
  engine.seek(1, 10);
  near(state().decks[1].position, 10, 1e-6);
  assert.equal(eventsOf('seek').length, 2);
  engine.seek(2, 10);
  engine.seek(0, Number.NaN);
  assert.equal(eventsOf('error').length, 2);
  engine.dispose();
});

test('resume creates the audio graph; nothing plays before', async () => {
  const { engine, context } = await harness();
  assert.equal(context.sources().length, 0);
  assert.equal(context.nodes.filter((n) => n.kind === 'gain').length, 0);
  await engine.resume();
  assert.ok(context.nodes.filter((n) => n.kind === 'gain').length > 10);
  assert.equal(context.sources().length, 0, 'still silent after resume');
  engine.dispose();
});

test('without Web Audio a play press is reported, not thrown', async () => {
  const { engine, press, state, eventsOf } = await harness({ withContext: false });
  press('d1.play');
  assert.equal(state().decks[0].playing, false);
  assert.equal(eventsOf('error').length, 1);
  assert.match(eventsOf('error')[0].message, /Web Audio/);
  await assert.rejects(engine.resume());
  engine.dispose();
});

test('after dispose the engine ignores the bus', async () => {
  const { engine, set, state } = await harness();
  engine.dispose();
  set('m.master', 0.1);
  assert.equal(state().mixer.master, 0.8);
});

test('default control values match the contract', () => {
  assert.equal(defaultValue('m.fader1'), 1);
  assert.equal(defaultValue('m.fader2'), 0);
});
