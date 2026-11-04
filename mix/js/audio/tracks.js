/**
 * Track library metadata. The musical recipes live in synth/songs; this file
 * derives the public track descriptors (what getTracks() returns).
 */
import { SAMPLE_RATE } from './synth/dsp.js';
import { SONGS } from './synth/songs/index.js';
import { trackSamples } from './synth/render.js';

export const TRACK_SAMPLE_RATE = SAMPLE_RATE;
/** Tracks loaded on deck 1 and deck 2 when the engine starts (rendered first). */
export const DEFAULT_DECK_TRACK_IDS = Object.freeze(['paper-tiger', 'ink-signal']);

function describe(song) {
  return Object.freeze({
    id: song.id,
    title: song.title,
    artist: song.artist,
    bpm: song.bpm,
    key: song.key,
    camelot: song.camelot,
    duration: trackSamples(song.bpm, TRACK_SAMPLE_RATE) / TRACK_SAMPLE_RATE,
  });
}

export const TRACKS = Object.freeze(SONGS.map(describe));

/** Fresh copies, so callers can never mutate the library. */
export const listTracks = () => TRACKS.map((track) => ({ ...track }));

export function trackById(id) {
  const track = TRACKS.find((t) => t.id === id);
  if (!track) throw new Error(`Unknown track id: ${id}`);
  return track;
}
