/**
 * One virtual deck: transport, CUE, tempo, sync, load and the state snapshot.
 * Pads, loops and the jog wheel live in sibling modules that act on a deck.
 *
 * The deck decides *what should happen* and records it in an immutable
 * transport model (transport.js); `audio` (a DeckAudio, or a fake in tests)
 * makes it audible. Every change is scheduled LOOKAHEAD_SECONDS ahead so the
 * model and the audio thread switch at exactly the same instant.
 */
import { PAD_COUNT } from '../controls.js';
import {
  alignedPosition, barOf, clamp, isInsideLoop, phraseBeatOf, secondsToBeats, snapToBeat, syncedRate, tempoToRate,
} from './grid.js';
import { endScrub, idleScrubCheck } from './deck-jog.js';
import * as transport from './transport.js';

export const LOOKAHEAD_SECONDS = 0.01;
export const TEMPO_GLIDE_SECONDS = 0.03;
export const ALIGN_HORIZON_SECONDS = TEMPO_GLIDE_SECONDS * 6;
const AT_CUE_EPSILON = 0.012;
const END_EPSILON = 0.02;
const TEMPO_EPSILON = 1e-6;

export class Deck {
  /**
   * @param {{ index: 0|1, audio: object, emit: (event: object) => void, peer: () => Deck }} options
   */
  constructor({ index, audio, emit, peer }) {
    this.index = index;
    this.id = index + 1;
    this.audio = audio;
    this.emitEngine = emit;
    this.peer = peer;
    this.reset(null);
    this.padMode = 'hotcue';
    this.shift = false;
    this.tempo = 0;
  }

  /** Clears everything that belongs to a loaded track. */
  reset(track) {
    this.track = track;
    this.transport = transport.createTransport({ duration: track ? track.info.duration : 0, time: this.audio ? this.audio.now() : 0 });
    this.cuePoint = 0;
    this.hotCues = Array(PAD_COUNT).fill(null);
    this.loop = null;
    this.pendingLoopIn = null;
    this.synced = false;
    this.syncRate = 1;
    this.preview = null;
    this.roll = null;
    this.scrub = null;
    this.lastJog = null;
  }

  emit(type, extra = {}) {
    this.emitEngine({ type, deck: this.index, deckId: this.id, ...extra });
  }

  now() {
    return this.audio.now();
  }

  /** The instant a change made right now takes effect. */
  effectiveTime() {
    return this.now() + LOOKAHEAD_SECONDS;
  }

  get bpm() {
    return this.track ? this.track.info.bpm : 0;
  }

  get duration() {
    return this.track ? this.track.info.duration : 0;
  }

  get sampleRate() {
    return this.track ? this.track.buffer.sampleRate : 0;
  }

  get baseRate() {
    return this.synced ? this.syncRate : tempoToRate(this.tempo);
  }

  isPlaying() {
    return this.transport.playing;
  }

  positionAt(time) {
    return transport.positionAt(this.transport, time);
  }

  /** Rate description the audio layer needs to continue seamlessly at `time`. */
  rateSpec(time) {
    return { base: this.transport.base, bend: transport.bendAt(this.transport, time), tau: this.transport.tau };
  }

  /** (Re)starts audible playback from the model state at `time`, cross-fading from any current voice. */
  restartAudio(time) {
    this.endRoll();
    this.audio.start({
      time, position: this.positionAt(time), rate: this.rateSpec(time), loop: this.loop,
    });
  }

  commit(next) {
    this.transport = next;
  }

  canLoad() {
    return !this.isPlaying() && !this.scrub && !this.preview;
  }

  /** Loads a rendered track ({ info, buffer }) into this paused deck. */
  load(track) {
    const wasSynced = this.synced;
    this.endRoll();
    this.audio.stop(this.effectiveTime());
    this.reset(track);
    this.audio.setBuffer(track.buffer);
    this.applyBaseRate();
    this.emit('loaded', { track: { ...track.info } });
    if (wasSynced) this.emit('sync', { synced: false, bpm: this.bpm * this.baseRate });
  }

  togglePlay() {
    if (!this.track) return;
    if (this.scrub) endScrub(this);
    if (this.preview) {
      this.preview = { ...this.preview, latched: true };
      this.emit('play', { position: this.positionAt(this.now()) });
      return;
    }
    if (this.isPlaying()) this.pause('button');
    else this.play();
  }

  play() {
    if (!this.track || this.isPlaying()) return;
    const time = this.effectiveTime();
    let position = this.positionAt(time);
    if (position >= this.duration - END_EPSILON) position = this.cuePoint;
    position = this.phaseAlignedStart(position, time);
    this.beginPlayback(position, time);
    this.emit('play', { position });
  }

  /** Starts the transport and audio at `position` (also used by previews). */
  beginPlayback(position, time) {
    let next = transport.seek(this.transport, time, position);
    next = transport.play(next, time);
    this.commit(next);
    this.restartAudio(time);
  }

  /** A synced deck starting while its leader plays lands on the leader's beat. */
  phaseAlignedStart(position, time) {
    if (!this.synced) return position;
    const leader = this.peer().syncInfo(time);
    if (!leader.playing) return position;
    return alignedPosition({ position, bpm: this.bpm }, leader);
  }

  pause(reason = 'button') {
    if (!this.isPlaying()) return;
    const time = this.effectiveTime();
    this.commit(transport.pause(this.transport, time));
    this.endRoll();
    this.audio.stop(time);
    this.emit('pause', { position: this.positionAt(time), reason });
  }

  /** Stops at an exact position (cue return, preview release). */
  stopAt(position, time) {
    this.commit(transport.pause(transport.seek(this.transport, time, position), time));
    this.audio.stop(time);
  }

  /** CDJ-style CUE button. */
  cueDown() {
    if (!this.track || this.scrub) return;
    if (this.shift) {
      this.stopAt(0, this.effectiveTime());
      this.emit('cue', { action: 'start', position: 0 });
      return;
    }
    if (this.isPlaying() && !this.preview) this.returnToCue();
    else if (!this.isPlaying()) this.cueWhilePaused();
  }

  cueUp() {
    if (!this.preview || this.preview.kind !== 'cue') return;
    this.endPreview();
    this.emit('cue', { action: 'release', position: this.cuePoint });
  }

  returnToCue() {
    const time = this.effectiveTime();
    this.dropLoopUnless(this.cuePoint);
    this.endRoll();
    this.stopAt(this.cuePoint, time);
    this.emit('cue', { action: 'return', position: this.cuePoint });
    this.emit('pause', { position: this.cuePoint, reason: 'cue' });
  }

  cueWhilePaused() {
    const position = this.positionAt(this.now());
    if (Math.abs(position - this.cuePoint) <= AT_CUE_EPSILON) {
      this.startPreview('cue', this.cuePoint);
      this.emit('cue', { action: 'preview', position: this.cuePoint });
      return;
    }
    this.cuePoint = snapToBeat(position, this.bpm);
    this.stopAt(this.cuePoint, this.effectiveTime());
    this.emit('cue', { action: 'set', position: this.cuePoint });
  }

  /** Plays from `point` while a button is held; release returns there and pauses. */
  startPreview(kind, point, index = null) {
    this.dropLoopUnless(point);
    this.preview = { kind, point, index, latched: false };
    this.beginPlayback(point, this.effectiveTime());
  }

  endPreview() {
    const { point, latched } = this.preview;
    this.preview = null;
    if (!latched) this.stopAt(point, this.effectiveTime());
  }

  /** Moves the playhead; a loop the new position falls outside of is dropped. */
  jumpTo(position) {
    const target = clamp(position, 0, Math.max(0, this.duration - END_EPSILON));
    const time = this.effectiveTime();
    this.dropLoopUnless(target);
    this.commit(transport.seek(this.transport, time, target));
    if (this.scrub) this.scrub = { ...this.scrub, position: target };
    if (this.isPlaying()) this.restartAudio(time);
  }

  /** Clears the loop unless `position` lies inside it. */
  dropLoopUnless(position) {
    if (this.loop && !isInsideLoop(position, this.loop)) this.clearLoop({ restart: false });
  }

  clearLoop({ restart = true } = {}) {
    if (!this.loop) return;
    this.loop = null;
    const time = this.effectiveTime();
    this.commit(transport.setLoop(this.transport, time, null));
    if (restart && this.isPlaying()) this.restartAudio(time);
    this.emit('loop', { active: false, start: null, end: null, beats: null });
  }

  /** Public seek used by lessons and the engine API. */
  seek(seconds) {
    if (!this.track) return;
    this.jumpTo(seconds);
    this.emit('seek', { position: this.positionAt(this.effectiveTime()) });
  }

  setTempo(value) {
    if (Math.abs(value - this.tempo) < TEMPO_EPSILON) return;
    this.tempo = value;
    if (this.synced) this.releaseSync();
    this.applyBaseRate();
  }

  /** Pushes the current base rate (tempo fader or sync) into the model and audio. */
  applyBaseRate() {
    if (!this.track) return;
    const time = this.effectiveTime();
    const base = this.baseRate;
    if (Math.abs(base - this.transport.base) < TEMPO_EPSILON) return;
    this.commit(transport.glideRate(this.transport, time, base, TEMPO_GLIDE_SECONDS));
    if (this.isPlaying()) this.audio.setRate({ time, ...this.rateSpec(time) });
  }

  /** What a follower needs to know about this deck. */
  syncInfo(time) {
    return {
      playing: this.isPlaying(), position: this.positionAt(time), bpm: this.bpm, effectiveBpm: this.bpm * this.transport.base,
    };
  }

  /** SYNC press: match the leader's tempo and (if both play) snap the beat phase. */
  pressSync() {
    if (!this.track || !this.peer().track) return;
    if (this.shift) {
      this.releaseSync();
      return;
    }
    const leader = this.peer();
    if (leader.synced) leader.releaseSync();
    this.synced = true;
    const time = this.effectiveTime();
    this.syncRate = syncedRate(this.bpm, leader.syncInfo(time).effectiveBpm);
    this.applyBaseRate();
    if (this.isPlaying() && leader.isPlaying()) this.alignBeatsTo(leader, time);
    this.emit('sync', { synced: true, bpm: this.bpm * this.baseRate });
  }

  /**
   * Jumps so this deck's beats land on the leader's. Phases are compared a
   * moment ahead, once the tempo glide has settled, so the lock holds exactly.
   */
  alignBeatsTo(leader, time) {
    const future = time + ALIGN_HORIZON_SECONDS;
    const own = { position: this.positionAt(future), bpm: this.bpm };
    const target = alignedPosition(own, { position: leader.positionAt(future), bpm: leader.bpm });
    this.jumpTo(this.positionAt(time) + (target - own.position));
  }

  releaseSync() {
    if (!this.synced) return;
    this.synced = false;
    this.applyBaseRate();
    this.emit('sync', { synced: false, bpm: this.bpm * this.baseRate });
  }

  /** Called whenever the other deck's tempo (or track) may have changed. */
  followLeader() {
    if (!this.synced || !this.track || !this.peer().track) return;
    this.syncRate = syncedRate(this.bpm, this.peer().syncInfo(this.now()).effectiveBpm);
    this.applyBaseRate();
  }

  /** Periodic upkeep: auto-pause at the end of the track. */
  housekeeping(time) {
    if (this.isPlaying() && transport.hasEnded(this.transport, time)) this.pause('end');
    idleScrubCheck(this, time);
  }

  endRoll() {
    if (!this.roll) return;
    this.audio.stopRoll(this.effectiveTime());
    this.emit('fx', { scope: 'roll', active: false, beats: this.roll.beats });
    this.roll = null;
  }

  /** The DeckState object the contract defines (fresh on every call, `level` filled in by the engine). */
  snapshot(time) {
    const track = this.track;
    const position = track ? this.positionAt(time) : 0;
    const beat = track ? secondsToBeats(position, track.info.bpm) : 0;
    const rate = track ? this.transport.base : 1;
    return {
      id: this.id,
      track: track ? { ...track.info } : null,
      playing: this.isPlaying() || Boolean(this.scrub && this.scrub.resume),
      position,
      duration: this.duration,
      bpm: this.bpm * rate,
      rate,
      tempo: this.tempo,
      synced: this.synced,
      cuePoint: this.cuePoint,
      hotCues: [...this.hotCues],
      loop: this.loop ? { start: this.loop.start, end: this.loop.end, beats: this.loop.beats } : null,
      padMode: this.padMode,
      beat,
      bar: barOf(beat),
      phraseBeat: phraseBeatOf(beat),
      level: 0,
    };
  }
}
