/* Hero sound: short synthesized cues fired as the scroll scrubs forward past each moment.
   Browsers only allow audio after a gesture, so it stays off until the visitor presses the
   Sound button; the choice lasts for the session. No audio files: everything is Web Audio. */
const STORAGE_KEY = 'hx.sound';
const MASTER_GAIN = 0.32;
const MAX_JUMP_S = 2.5; // a bigger jump (a link, a key press) skips the cues it passes

/* Scene-relative cue times in seconds; they line up with the tweens in js/hero/scenes. */
export const CUES = Object.freeze({
  intro: [{ at: 0.2, play: 'whoosh' }, { at: 1.3, play: 'ignite' }],
  palm: [{ at: 3.4, play: 'shimmer' }, { at: 9.2, play: 'boom' }],
  eyes: [{ at: 1.0, play: 'drone' }],
  desk: [{ at: 0.3, play: 'flutter' }],
  handoff: [{ at: 0.5, play: 'crackle' }, { at: 6.2, play: 'rise' }],
});

function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < data.length; i += 1) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  return buf;
}

function envelope(gain, t, attack, hold, release, peak) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.setValueAtTime(peak, t + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function noiseHit(ctx, out, { seconds, type, from, to, q = 1, peak, attack = 0.02, release }) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds);
  const filter = ctx.createBiquadFilter();
  filter.type = type; filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + seconds);
  const gain = ctx.createGain();
  envelope(gain, t, attack, Math.max(0, seconds - attack - release), release, peak);
  src.connect(filter).connect(gain).connect(out);
  src.start(t); src.stop(t + seconds + 0.05);
}

function tone(ctx, out, { type = 'sine', from, to, seconds, peak, attack = 0.01, release }) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
  const gain = ctx.createGain();
  envelope(gain, t, attack, Math.max(0, seconds - attack - release), release, peak);
  osc.connect(gain).connect(out);
  osc.start(t); osc.stop(t + seconds + 0.05);
}

const SOUNDS = {
  whoosh: (ctx, out) => noiseHit(ctx, out, { seconds: 1.2, type: 'lowpass', from: 2400, to: 180, peak: 0.5, attack: 0.25, release: 0.6 }),
  ignite: (ctx, out) => {
    noiseHit(ctx, out, { seconds: 0.35, type: 'highpass', from: 3000, to: 9000, peak: 0.35, release: 0.25 });
    tone(ctx, out, { type: 'triangle', from: 1320, to: 880, seconds: 0.9, peak: 0.18, release: 0.7 });
  },
  shimmer: (ctx, out) => [880, 1175, 1568].forEach((f, i) => setTimeout(() => tone(ctx, out, { from: f, to: f * 1.01, seconds: 0.8, peak: 0.08, release: 0.6 }), i * 90)),
  boom: (ctx, out) => {
    tone(ctx, out, { from: 90, to: 32, seconds: 1.6, peak: 0.7, release: 1.3 });
    noiseHit(ctx, out, { seconds: 1.4, type: 'lowpass', from: 600, to: 60, peak: 0.4, release: 1.1 });
  },
  drone: (ctx, out) => {
    tone(ctx, out, { type: 'sawtooth', from: 55, to: 55, seconds: 3.2, peak: 0.07, attack: 0.8, release: 1.8 });
    tone(ctx, out, { from: 82.4, to: 82.4, seconds: 3.2, peak: 0.12, attack: 0.8, release: 1.8 });
  },
  flutter: (ctx, out) => {
    for (let i = 0; i < 14; i += 1) {
      setTimeout(() => noiseHit(ctx, out, { seconds: 0.09, type: 'bandpass', from: 1200 + (i % 4) * 300, to: 700, q: 2, peak: 0.25, attack: 0.005, release: 0.07 }), i * 45);
    }
  },
  crackle: (ctx, out) => {
    noiseHit(ctx, out, { seconds: 2.6, type: 'lowpass', from: 900, to: 300, peak: 0.18, attack: 0.4, release: 1.2 });
    for (let i = 0; i < 18; i += 1) {
      setTimeout(() => noiseHit(ctx, out, { seconds: 0.03, type: 'highpass', from: 2500, to: 4000, peak: 0.3, attack: 0.002, release: 0.025 }), 80 + ((i * 137) % 2200));
    }
  },
  rise: (ctx, out) => tone(ctx, out, { from: 220, to: 660, seconds: 1.6, peak: 0.12, attack: 0.5, release: 0.9 }),
};

function readPref() {
  try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function writePref(isOn) {
  try { sessionStorage.setItem(STORAGE_KEY, isOn ? '1' : '0'); } catch { /* storage blocked: keep it in memory */ }
}

/* cues: [{ at (absolute timeline seconds), play }], sorted by time. */
export function createHeroSound(button, cues) {
  let ctx = null;
  let out = null;
  let isOn = false;
  let last = null;

  const ensureContext = () => {
    if (ctx) return ctx.resume();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('Web Audio unavailable');
    ctx = new AudioCtx();
    out = ctx.createGain();
    out.gain.value = MASTER_GAIN;
    out.connect(ctx.destination);
    return ctx.resume();
  };

  const show = (on) => {
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Hero sound on' : 'Hero sound off');
    button.title = on ? 'Sound on' : 'Sound off';
  };

  const setOn = async (next) => {
    isOn = next;
    show(isOn);
    writePref(isOn);
    if (!isOn) return;
    try { await ensureContext(); } catch (error) {
      console.warn('Hero sound unavailable:', error.message);
      isOn = false; show(false);
    }
  };

  button.addEventListener('click', () => setOn(!isOn));
  /* A saved "on" still needs a gesture before audio can start, so it waits for a tap. */
  show(false);
  if (readPref()) button.title = 'Sound off (tap to resume)';

  return {
    update(time) {
      const prev = last;
      last = time;
      if (!isOn || !ctx || prev === null || time <= prev || time - prev > MAX_JUMP_S) return;
      cues.filter((cue) => cue.at > prev && cue.at <= time).forEach((cue) => SOUNDS[cue.play](ctx, out));
    },
  };
}
