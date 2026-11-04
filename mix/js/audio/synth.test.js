import test from 'node:test';
import assert from 'node:assert/strict';
import { Biquad, SAMPLE_RATE, gainToDb, rmsOf } from './synth/dsp.js';
import { PHRASES, PHRASE_BARS, TOTAL_BARS, layerActive } from './synth/arrangement.js';
import { buildDuckEnvelope, kickPositions, renderSong, trackSamples } from './synth/render.js';
import { snapToScale } from './synth/layers.js';
import { softCeiling } from './synth/master.js';
import { SONGS } from './synth/songs/index.js';
import { TRACKS } from './tracks.js';

const FS = SAMPLE_RATE;
const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);
const cache = new Map();

/** Renders a song once per test run, remembering the per-phrase stem levels. */
function rendered(song) {
  if (!cache.has(song.id)) {
    const levels = [];
    const run = renderSong(song, FS, { collectLevels: true });
    let step = run.next();
    while (!step.done) {
      if (step.value.levels) levels.push(step.value.levels);
      step = run.next();
    }
    cache.set(song.id, { ...step.value, levels });
  }
  return cache.get(song.id);
}

const barSeconds = (song) => (4 * 60) / song.bpm;

function bandRmsPerBar(song, samples, lo, hi) {
  const x = Float32Array.from(samples);
  if (lo) { Biquad.highpass(lo, 0.7071, FS).processRange(x); Biquad.highpass(lo, 0.7071, FS).processRange(x); }
  if (hi) { Biquad.lowpass(hi, 0.7071, FS).processRange(x); Biquad.lowpass(hi, 0.7071, FS).processRange(x); }
  const bar = barSeconds(song) * FS;
  return Array.from({ length: TOTAL_BARS }, (_, b) => {
    const from = Math.round(b * bar) + Math.round(0.25 * bar); // skip the head of the bar: filter ring-in
    const to = Math.round((b + 1) * bar);
    return gainToDb(rmsOf(x, from, to));
  });
}

test('every song renders to the exact track length with sane levels', () => {
  for (const song of SONGS) {
    const { samples, sampleRate, stats } = rendered(song);
    assert.equal(sampleRate, FS);
    assert.equal(samples.length, trackSamples(song.bpm, FS));
    assert.ok(stats.peak > 0.6 && stats.peak <= 0.98, `${song.id} peak ${stats.peak}`);
    near(stats.rms, 0.23, 0.01);
    assert.ok(samples.every(Number.isFinite), `${song.id} has non-finite samples`);
    assert.ok(samples.byteLength < 20 * 1024 * 1024, `${song.id} is ${samples.byteLength} bytes`);
  }
});

test('track metadata matches the brief', () => {
  assert.deepEqual(TRACKS.map((t) => [t.title, t.artist, t.bpm, t.camelot, t.key]), [
    ['Paper Tiger', 'AT', 122, '8A', 'A minor'],
    ['Ink Signal', 'AT', 126, '8A', 'A minor'],
    ['Charles River', 'AT', 124, '8B', 'C major'],
    ['Night Bus', 'AT', 120, '9A', 'E minor'],
  ]);
  TRACKS.forEach((track) => near(track.duration, (TOTAL_BARS * 4 * 60) / track.bpm, 1e-3));
});

test('the arrangement is 64 bars in eight 8-bar phrases', () => {
  assert.equal(PHRASES.length * PHRASE_BARS, TOTAL_BARS);
  assert.equal(layerActive('kick', 0), true);
  assert.equal(layerActive('bass', 15), false);
  assert.equal(layerActive('bass', 16), true);
  assert.equal(layerActive('chords', 31), false);
  assert.equal(layerActive('chords', 32), true);
  assert.equal(layerActive('kick', 40), false);
  assert.equal(layerActive('kick', 48), true);
  assert.equal(layerActive('bass', 56), false);
  assert.equal(layerActive('kick', 56), true);
});

test('layers enter and leave exactly on phrase boundaries', () => {
  const silent = -120;
  for (const song of SONGS) {
    const { levels } = rendered(song);
    const bassOn = levels.map((l) => l.bass > 1e-4);
    const tonalOn = levels.map((l) => l.tonal > 1e-4);
    assert.deepEqual(bassOn, [false, false, true, true, true, false, true, false], `${song.id} bass by phrase`);
    assert.deepEqual(tonalOn, [false, false, false, false, true, true, true, false], `${song.id} tonal by phrase`);
    const dryDb = levels.map((l) => gainToDb(l.dry));
    assert.ok(dryDb[5] < dryDb[4] - 8, `${song.id} breakdown must lose the kick (${dryDb[5]} vs ${dryDb[4]})`);
    assert.ok(dryDb[0] > silent && dryDb[7] > silent);
  }
});

test('the audible energy steps land on the bar lines of the phrase changes', () => {
  for (const song of SONGS) {
    const { samples } = rendered(song);
    const sub = bandRmsPerBar(song, samples, 30, 90);
    const mids = bandRmsPerBar(song, samples, 300, 3000);
    // bar indexes are 0-based: 16 = bar 17 (bass joins), 32 = bar 33 (chords), 40 = bar 41 (kick out), 48 = bar 49 (drop), 56 = bar 57 (outro)
    assert.ok(sub[40] < sub[39] - 12, `${song.id} sub band must collapse at bar 41`);
    assert.ok(sub[48] > sub[47] + 12, `${song.id} sub band must return at bar 49`);
    assert.ok(mids[32] > mids[31] + 4, `${song.id} mids must rise at bar 33 (${mids[31]} -> ${mids[32]})`);
    assert.ok(mids[56] < mids[55] - 4, `${song.id} mids must fall at bar 57`);
    const stable = (from, to) => Math.max(...mids.slice(from, to)) - Math.min(...mids.slice(from, to));
    assert.ok(stable(33, 39) < 5, `${song.id} mids drift inside the full phrase`);
  }
});

test('every song has a clearly different bass: voice, rhythm density and timbre', () => {
  const signature = SONGS.map((song) => {
    const bars = song.bass.patterns.B;
    const notes = bars.reduce((sum, bar) => sum + bar.length, 0) / bars.length;
    return `${song.bass.voice}/${song.bass.params.shape ?? 'sine'}/${Math.round(notes)}`;
  });
  assert.equal(new Set(signature).size, SONGS.length, signature.join(' '));
  const durations = SONGS.map((song) => song.bass.patterns.B[0].reduce((sum, e) => sum + e[2], 0) / song.bass.patterns.B[0].length);
  assert.ok(Math.max(...durations) / Math.min(...durations) > 1.5);
});

test('all tonal material stays inside the song key', () => {
  const pitchClass = (midi) => ((midi % 12) + 12) % 12;
  for (const song of SONGS) {
    for (const entry of song.harmony) {
      assert.ok(song.scale.includes(pitchClass(entry.root)), `${song.id} root ${entry.root}`);
      entry.chord.forEach((note) => assert.ok(song.scale.includes(pitchClass(note)), `${song.id} chord note ${note}`));
    }
    song.lead.motif.forEach(([, , midi]) => assert.ok(song.scale.includes(pitchClass(midi)), `${song.id} lead note ${midi}`));
    for (const bars of Object.values(song.bass.patterns)) {
      bars.flat().forEach(([, semitones]) => {
        song.harmony.forEach((entry) => {
          const snapped = snapToScale(entry.root + semitones, song.scale);
          assert.ok(song.scale.includes(pitchClass(snapped)));
          assert.ok(entry.root + semitones - snapped <= 2, 'snapping only nudges by a semitone or two');
        });
      });
    }
  }
});

test('songs sit in compatible keys for harmonic mixing (8A, 8A, 8B, 9A)', () => {
  const camelot = SONGS.map((s) => s.camelot);
  assert.deepEqual(camelot, ['8A', '8A', '8B', '9A']);
});

test('kick positions cover every beat except the breakdown', () => {
  for (const song of SONGS) {
    const kicks = kickPositions(song, FS);
    assert.equal(kicks.length, 7 * PHRASE_BARS * 4);
    const beat = (60 / song.bpm) * FS;
    const breakdownStart = 40 * 4 * beat;
    const breakdownEnd = 48 * 4 * beat;
    assert.ok(kicks.every((k) => k < breakdownStart - beat / 2 || k > breakdownEnd - beat / 2));
    kicks.slice(0, 40).forEach((k, i) => near(k, Math.round(i * beat), 1.01));
  }
});

test('the duck envelope dips at each kick and recovers', () => {
  const env = buildDuckEnvelope(FS, [1000, 17000], 0.7, 0.1, FS);
  const tau = 0.1 * FS;
  near(env[1000], 0.3, 0.02);
  near(env[1000 + tau], 1 - 0.7 * Math.exp(-1), 0.02);
  assert.ok(env[1000 + 3 * tau] > 0.9);
  near(env[500], 1, 1e-6);
  near(env[10000 + tau * 0], env[10000], 0);
  assert.ok(env[17000] < 0.35);
  assert.ok(env.every((v) => v >= 0.29 && v <= 1));
});

test('the master soft ceiling is transparent below the knee and bounded above', () => {
  near(softCeiling(0.5), 0.5);
  near(softCeiling(-0.5), -0.5);
  assert.ok(softCeiling(5) <= 0.97 + 1e-9);
  assert.ok(softCeiling(-5) >= -0.97 - 1e-9);
  let last = -1;
  for (let x = 0; x < 3; x += 0.01) {
    const y = softCeiling(x);
    assert.ok(y >= last);
    last = y;
  }
});

test('renders are deterministic', () => {
  const song = SONGS[3];
  const first = rendered(song).samples;
  const run = renderSong(song, FS);
  let step = run.next();
  while (!step.done) step = run.next();
  const second = step.value.samples;
  assert.equal(second.length, first.length);
  let identical = true;
  for (let i = 0; i < first.length; i += 997) if (first[i] !== second[i]) { identical = false; break; }
  assert.ok(identical, 'two renders of the same song must match sample for sample');
});

test('hat and clap energy exist in the high band so the drums are crisp', () => {
  for (const song of SONGS) {
    const { samples } = rendered(song);
    const high = bandRmsPerBar(song, samples, 4000, 0);
    assert.ok(high[10] > -50, `${song.id} bar 11 high band ${high[10]} dB`);
  }
});
