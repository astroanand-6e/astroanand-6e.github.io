/** Does nothing, so the unit can still be drawn when the real engine fails to start. */
const idleDeck = (id) => ({
  id, track: null, playing: false, position: 0, duration: 0, bpm: 0, rate: 1, tempo: 0, synced: false, cuePoint: 0,
  hotCues: Array(8).fill(null), loop: null, padMode: 'hotcue', beat: 0, bar: 1, phraseBeat: 0, level: 0,
});

export function createIdleEngine() {
  const state = Object.freeze({
    ready: true,
    decks: [idleDeck(0), idleDeck(1)],
    mixer: { fx: { on: false, level: 0.5, beats: 1, channel: '1&2' } },
    phaseOffset: 0,
  });
  return {
    ready: Promise.resolve(),
    resume: () => Promise.resolve(),
    getState: () => state,
    getTracks: () => [],
    getSelection: () => -1,
    getWaveform: () => null,
    seek() {},
    dispose() {},
  };
}
