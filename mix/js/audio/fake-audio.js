/**
 * Recording stand-in for a DeckAudio, used by the deck tests: a manual clock
 * and a log of every call the deck makes to the audio layer.
 */
export function createFakeAudio(startTime = 100) {
  const clock = { time: startTime };
  const calls = [];
  const record = (name) => (arg) => { calls.push({ name, arg }); };
  const audio = {
    now: () => clock.time,
    setBuffer: record('setBuffer'),
    start: record('start'),
    stop: record('stop'),
    setRate: record('setRate'),
    startRoll: record('startRoll'),
    stopRoll: record('stopRoll'),
    scrubBegin: record('scrubBegin'),
    scrubMove: record('scrubMove'),
    scrubEnd: record('scrubEnd'),
    trigger: (name, options) => { calls.push({ name: 'trigger', arg: { name, ...options } }); },
  };
  return {
    audio,
    clock,
    calls,
    advance: (seconds) => { clock.time += seconds; },
    callsNamed: (name) => calls.filter((call) => call.name === name).map((call) => call.arg),
    lastCall: (name) => [...calls].reverse().find((call) => call.name === name)?.arg,
    clear: () => { calls.length = 0; },
  };
}

/** A loaded-track record shaped like the library's, with a stub buffer. */
export function fakeTrack({ id = 't', bpm = 120, bars = 64, sampleRate = 32000 } = {}) {
  const duration = (bars * 4 * 60) / bpm;
  return {
    info: { id, title: id, artist: 'AT', bpm, key: 'A minor', camelot: '8A', duration },
    buffer: { sampleRate, length: Math.round(duration * sampleRate), duration, getChannelData: () => new Float32Array(0) },
  };
}
