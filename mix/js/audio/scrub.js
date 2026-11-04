/**
 * Granular scrub voice. While the platter is touched the track is held, and
 * overlapping windowed grains follow the hand: playing forward at the hand's
 * speed (pitch follows speed, like vinyl), or reversed copies when the hand
 * moves backwards. Windows are Hann-shaped and overlap by half, so the result
 * is click-free; a still hand is silent.
 */
const GRAIN_SECONDS = 0.07;
const HOP_SECONDS = GRAIN_SECONDS / 2;
const SCHEDULE_AHEAD_SECONDS = 0.08;
const TICK_MS = 20;
const HAND_DECAY_SECONDS = 0.06;
const MIN_SPEED = 0.03;
const MAX_SPEED = 6;
const WINDOW_POINTS = 32;
const STOP_PAD_SECONDS = 0.01;
const FIRST_GRAIN_DELAY = 0.005;

const HANN_WINDOW = Float32Array.from({ length: WINDOW_POINTS }, (_, i) => Math.sin((Math.PI * i) / (WINDOW_POINTS - 1)) ** 2);

export class Scrubber {
  constructor() {
    this.ctx = null;
    this.output = null;
    this.samples = null;
    this.buffer = null;
    this.timer = null;
    this.reset();
  }

  reset() {
    this.position = 0;
    this.velocity = 0;
    this.moveTime = 0;
    this.nextGrain = 0;
  }

  attach(ctx, output) {
    this.ctx = ctx;
    this.output = output;
  }

  setBuffer(buffer) {
    this.buffer = buffer;
    this.samples = buffer ? buffer.getChannelData(0) : null;
  }

  begin({ position }) {
    if (!this.ctx || !this.buffer) return;
    this.reset();
    this.position = position;
    this.moveTime = this.ctx.currentTime;
    this.nextGrain = this.ctx.currentTime + FIRST_GRAIN_DELAY;
    this.stopTimer();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  move({ position, velocity }) {
    if (!this.timer) return;
    this.position = position;
    this.velocity = velocity;
    this.moveTime = this.ctx.currentTime;
  }

  end() {
    this.stopTimer();
  }

  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Schedules every grain that starts within the look-ahead window. */
  tick() {
    const now = this.ctx.currentTime;
    if (this.nextGrain < now) this.nextGrain = now + FIRST_GRAIN_DELAY;
    while (this.nextGrain < now + SCHEDULE_AHEAD_SECONDS) {
      this.grainAt(this.nextGrain);
      this.nextGrain += HOP_SECONDS;
    }
  }

  /** The hand's speed and position at `time`: the last movement decays like a hand letting go. */
  handAt(time) {
    const idle = Math.max(0, time - this.moveTime);
    const decay = Math.exp(-idle / HAND_DECAY_SECONDS);
    const duration = this.buffer.duration;
    const travelled = this.velocity * HAND_DECAY_SECONDS * (1 - decay);
    return { speed: this.velocity * decay, position: Math.min(Math.max(this.position + travelled, 0), duration) };
  }

  grainAt(time) {
    const hand = this.handAt(time);
    if (Math.abs(hand.speed) < MIN_SPEED) return;
    const speed = Math.min(Math.abs(hand.speed), MAX_SPEED);
    const span = GRAIN_SECONDS * speed;
    const forward = hand.speed > 0;
    const source = this.ctx.createBufferSource();
    source.buffer = forward ? this.buffer : this.reversedSegment(hand.position - span, hand.position);
    source.playbackRate.value = speed;
    const gain = this.ctx.createGain();
    gain.gain.setValueCurveAtTime(HANN_WINDOW, time, GRAIN_SECONDS);
    source.connect(gain);
    gain.connect(this.output);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    if (forward) source.start(time, hand.position, span);
    else source.start(time, 0);
    source.stop(time + GRAIN_SECONDS + STOP_PAD_SECONDS);
  }

  /** A small buffer holding [from, to) of the track played backwards. */
  reversedSegment(from, to) {
    const rate = this.buffer.sampleRate;
    const length = Math.max(2, Math.round((to - from) * rate));
    const first = Math.round(from * rate);
    const segment = this.ctx.createBuffer(1, length, rate);
    const data = segment.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const index = first + length - 1 - i;
      data[i] = index >= 0 && index < this.samples.length ? this.samples[index] : 0;
    }
    return segment;
  }

  dispose() {
    this.stopTimer();
  }
}
