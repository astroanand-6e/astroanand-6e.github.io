/**
 * Development data for fake-engine.js: six made-up tracks and a beat-shaped waveform for
 * each. Only loaded with ?fake. Nothing here ships to visitors.
 */
const BIN_SECONDS = 0.02;
const BEATS_PER_BAR = 4;
const BARS_PER_PHRASE = 8;
// Per eight-bar phrase: how much bass, mids and highs each section carries.
const SECTIONS = Object.freeze([
  { low: 0.12, mid: 0.45, high: 0.5 },
  { low: 1, mid: 0.78, high: 0.7 },
  { low: 0.2, mid: 0.92, high: 0.38 },
  { low: 1, mid: 0.85, high: 0.82 },
]);

export const FAKE_TRACKS = Object.freeze([
  { id: 'fake-1', title: 'Night Bus to Anywhere', artist: 'Fake Signals', bpm: 124, key: 'A minor', camelot: '8A', duration: 192 },
  { id: 'fake-2', title: 'Paper Lanterns', artist: 'Fake Signals', bpm: 122, key: 'C major', camelot: '8B', duration: 204 },
  { id: 'fake-3', title: 'Low Tide Loop', artist: 'Test Pressing', bpm: 126, key: 'E minor', camelot: '9A', duration: 216 },
  { id: 'fake-4', title: 'Glass Hall', artist: 'Test Pressing', bpm: 120, key: 'D minor', camelot: '7A', duration: 188 },
  { id: 'fake-5', title: 'Sakura Line', artist: 'Dummy Data', bpm: 128, key: 'G major', camelot: '9B', duration: 210 },
  { id: 'fake-6', title: 'After Hours Demo', artist: 'Dummy Data', bpm: 123, key: 'F minor', camelot: '4A', duration: 180 },
]);

function noise(i, seed) {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** { binSeconds, low, mid, high }: kick on the beat, claps on 2 and 4, hats on the offbeat. */
export function makeWaveform(track, seed = 1) {
  const count = Math.ceil(track.duration / BIN_SECONDS);
  const low = new Float32Array(count);
  const mid = new Float32Array(count);
  const high = new Float32Array(count);
  const perBeat = 60 / track.bpm;
  for (let i = 0; i < count; i += 1) {
    const beats = (i * BIN_SECONDS) / perBeat;
    const phase = beats % 1;
    const bar = beats / BEATS_PER_BAR;
    const section = SECTIONS[Math.floor(bar / BARS_PER_PHRASE) % SECTIONS.length];
    const kick = Math.exp(-phase * 8);
    const clap = Math.floor(beats) % 2 === 1 ? Math.exp(-phase * 13) : 0;
    const hat = Math.exp(-((phase * 2) % 1) * 16);
    const grain = noise(i, seed);
    low[i] = Math.min(1, section.low * (0.18 + 0.82 * kick) * (0.92 + 0.08 * grain));
    mid[i] = Math.min(1, section.mid * (0.22 + 0.5 * clap + 0.25 * kick) * (0.85 + 0.15 * grain));
    high[i] = Math.min(1, section.high * (0.12 + 0.55 * hat + 0.2 * clap) * (0.8 + 0.2 * grain));
  }
  return { binSeconds: BIN_SECONDS, low, mid, high };
}
