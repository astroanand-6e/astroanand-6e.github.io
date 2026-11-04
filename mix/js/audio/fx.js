/**
 * Beat FX: a ping-pong echo whose delay time is a number of beats. The echo
 * is a send/return effect: channels feed it through their FX send, and the
 * return joins the master after the faders, so a tail keeps ringing after a
 * channel fader or the FX switch goes down (an "echo out").
 */
import { dbToGain, webAudioQ } from './mixer-math.js';

export const MAX_DELAY_SECONDS = 3;
const EDGE_HIGHPASS_HZ = 180;
const DAMP_LOWPASS_HZ = 4800;
const FILTER_Q = Math.SQRT1_2;
const FEEDBACK_BASE = 0.25;
const FEEDBACK_SPAN = 0.4;
const WET_MAKEUP_DB = 0;
export const DELAY_GLIDE_SECONDS = 0.06;
export const LEVEL_SMOOTH_SECONDS = 0.02;

function filter(ctx, type, frequency) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = webAudioQ(type, FILTER_Q);
  return node;
}

/** Wet level and feedback for the level/depth knob (0..1). */
export function echoSettings(level) {
  const v = Math.min(1, Math.max(0, level));
  return { wet: v * dbToGain(WET_MAKEUP_DB), feedback: FEEDBACK_BASE + FEEDBACK_SPAN * v };
}

export function createBeatEcho(ctx) {
  const input = ctx.createGain();
  const delayLeft = ctx.createDelay(MAX_DELAY_SECONDS);
  const delayRight = ctx.createDelay(MAX_DELAY_SECONDS);
  const dampLeft = filter(ctx, 'lowpass', DAMP_LOWPASS_HZ);
  const dampRight = filter(ctx, 'lowpass', DAMP_LOWPASS_HZ);
  const feedbackLeft = ctx.createGain();
  const feedbackRight = ctx.createGain();
  const merger = ctx.createChannelMerger(2);
  const output = ctx.createGain();

  input.connect(filter(ctx, 'highpass', EDGE_HIGHPASS_HZ)).connect(delayLeft);
  delayLeft.connect(merger, 0, 0);
  delayRight.connect(merger, 0, 1);
  delayLeft.connect(dampLeft).connect(feedbackLeft).connect(delayRight);
  delayRight.connect(dampRight).connect(feedbackRight).connect(delayLeft);
  merger.connect(output);

  function setLevel(level) {
    const { wet, feedback } = echoSettings(level);
    const now = ctx.currentTime;
    for (const param of [output.gain, feedbackLeft.gain, feedbackRight.gain]) param.cancelScheduledValues(now);
    output.gain.setTargetAtTime(wet, now, LEVEL_SMOOTH_SECONDS);
    feedbackLeft.gain.setTargetAtTime(feedback, now, LEVEL_SMOOTH_SECONDS);
    feedbackRight.gain.setTargetAtTime(feedback, now, LEVEL_SMOOTH_SECONDS);
  }

  /** Gliding the delay time bends the repeats like a tape echo instead of clicking. */
  function setDelaySeconds(seconds) {
    const now = ctx.currentTime;
    const time = Math.min(MAX_DELAY_SECONDS, Math.max(0.01, seconds));
    for (const delay of [delayLeft, delayRight]) {
      delay.delayTime.cancelScheduledValues(now);
      delay.delayTime.setTargetAtTime(time, now, DELAY_GLIDE_SECONDS);
    }
  }

  return { input, output, setLevel, setDelaySeconds };
}
