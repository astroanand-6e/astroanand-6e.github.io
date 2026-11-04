/**
 * A just-enough fake of the Web Audio API for Node tests of the engine: nodes
 * remember their connections and AudioParam calls, `currentTime` is set by the
 * test. It produces no sound; the real graph is checked in a browser.
 */
export class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.calls = [];
  }

  record(name, ...args) {
    this.calls.push({ name, args });
    return this;
  }

  setValueAtTime(v, t) { this.value = v; return this.record('setValueAtTime', v, t); }
  linearRampToValueAtTime(v, t) { return this.record('linearRampToValueAtTime', v, t); }
  setTargetAtTime(v, t, tau) { return this.record('setTargetAtTime', v, t, tau); }
  setValueCurveAtTime(curve, t, d) { return this.record('setValueCurveAtTime', curve, t, d); }
  cancelScheduledValues(t) { return this.record('cancelScheduledValues', t); }
}

export class FakeNode {
  constructor(ctx, kind, params = {}) {
    this.ctx = ctx;
    this.kind = kind;
    this.connections = [];
    this.started = null;
    this.stopped = null;
    for (const [name, value] of Object.entries(params)) this[name] = new FakeParam(value);
    ctx.nodes.push(this);
  }

  connect(destination) {
    this.connections.push(destination);
    return destination;
  }

  disconnect() { this.connections = []; }
  start(when, offset, duration) { this.started = { when, offset, duration }; }
  stop(when) { this.stopped = when; }
  getFloatTimeDomainData(array) { array.fill(0); }
}

export class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.nodes = [];
    this.destination = new FakeNode(this, 'destination');
  }

  node(kind, params) { return new FakeNode(this, kind, params); }
  createGain() { return this.node('gain', { gain: 1 }); }
  createBiquadFilter() { return Object.assign(this.node('biquad', { frequency: 350, Q: 1, gain: 0 }), { type: 'lowpass' }); }
  createDelay() { return this.node('delay', { delayTime: 0 }); }
  createChannelMerger() { return this.node('merger'); }
  createAnalyser() { return Object.assign(this.node('analyser'), { fftSize: 2048 }); }
  createWaveShaper() { return Object.assign(this.node('shaper'), { curve: null, oversample: 'none' }); }
  createDynamicsCompressor() {
    return this.node('compressor', {
      threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25,
    });
  }

  createBufferSource() {
    return Object.assign(this.node('source', { playbackRate: 1 }), { buffer: null, loop: false, onended: null });
  }

  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return {
      length, sampleRate, duration: length / sampleRate, numberOfChannels: channels, getChannelData: () => data, copyToChannel: (source) => data.set(source),
    };
  }

  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }

  /** Sources created so far (newest last), optionally only those that have been started. */
  sources({ started = true } = {}) {
    return this.nodes.filter((n) => n.kind === 'source' && (!started || n.started));
  }
}
