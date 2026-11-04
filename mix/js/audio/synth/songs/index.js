/** The four original tracks, in library order. */
import paperTiger from './paper-tiger.js';
import inkSignal from './ink-signal.js';
import charlesRiver from './charles-river.js';
import nightBus from './night-bus.js';

export const SONGS = Object.freeze([paperTiger, inkSignal, charlesRiver, nightBus]);

export function songById(id) {
  const song = SONGS.find((s) => s.id === id);
  if (!song) throw new Error(`Unknown track id: ${id}`);
  return song;
}
