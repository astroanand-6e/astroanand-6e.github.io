import * as THREE from 'three';
import { CriticalSpring } from './motion.js';
import { STATIONS } from './stations.js';
import { NARROW_SLOT_PX } from './slots.js';

const POINT_COUNT = 5600;
const POINT_SIZE = { paper: 3.4, ink: 4.8 };
const AMPLITUDE = 1.1;
const MODE_FADE_SECONDS = 0.9;
const HEAD_SMOOTH_SECONDS = 0.7;
const THREAD_LIFT = 0.06;
const PULSE_COUNT = 3;
const PULSE_SPEED = 0.055;
const MIN_SCALE = 0.75;
const MAX_SCALE = 1.5;
const BASE_PPU = 34;
const OUTSIDE_SLOT_GLOW = 0.14;
const SLOT_SOFT_EDGE = 0.12;
const LEFT_RAMP_PX = 80;
const THREAD_RENDER_ORDER = 1;
// The thread never enters geometry: it leaves the desk plinth's front-right
// corner and passes each station along its front edge, entering and leaving
// beside the footprint (all footprints sit within STATION_REACH of their
// origin), so it reads as one signal flowing front-of-stage.
const DESK_EXIT = [[2.2, 4.9], [6.4, 5.2]];
const STATION_FRONT_Z = 3.4;
const STATION_REACH_X = 4.0;
const COLORS = {
  paper: { thread: 0xc00000, pulse: 0xe10600 },
  ink: { thread: 0xe10600, pulse: 0xff6b5e },
};

// Waveform ids: 0 drift, 1 ECG, 2 grain, 3 pulses, 4 audio sine, 5 speech.
const MODE = { DRIFT: 0, ECG: 1, GRAIN: 2, PULSES: 3, AUDIO: 4, SPEECH: 5 };
const INDEX_FALLBACK = [MODE.DRIFT, MODE.ECG, MODE.GRAIN, MODE.PULSES, MODE.AUDIO, MODE.AUDIO];
const ID_RULES = [
  [/heart|ecg|cardi/, MODE.ECG],
  [/vision|c-arm|xray|image|grain/, MODE.GRAIN],
  [/care|conveyor|card|pipeline/, MODE.PULSES],
  [/voice|speech|talk|mic/, MODE.SPEECH],
  [/deck|calm|audio|music|dj|ddj/, MODE.AUDIO],
];

export function modeForChapter(id, index) {
  const key = String(id || '').toLowerCase();
  const hit = ID_RULES.find(([re]) => re.test(key));
  if (hit) return hit[1];
  return INDEX_FALLBACK[index] !== undefined ? INDEX_FALLBACK[index] : MODE.DRIFT;
}

const VERTEX = /* glsl */ `
  attribute float aT;
  uniform float uTime, uHead, uSize, uPx, uScale, uMix, uModeA, uModeB, uAmp, uPulseOn;
  uniform vec4 uSlot;
  varying float vGlow;
  varying float vPulse;
  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  float bump(float x, float w) { return exp(-(x * x) * w); }
  float wave(float m, float t, float time) {
    if (m < 0.5) return 0.18 * sin(t * 60.0 - time * 1.2);
    if (m < 1.5) {
      float s = fract(t * 34.0 - time * 0.35);
      return 1.6 * bump(s - 0.5, 800.0) - 0.35 * bump(s - 0.58, 320.0) + 0.22 * bump(s - 0.28, 200.0);
    }
    if (m < 2.5) return (hash(floor(t * 900.0) + floor(time * 12.0)) - 0.5) * 0.9;
    if (m < 3.5) {
      float s = fract(t * 14.0 - time * 0.25);
      return step(0.82, s) * step(s, 0.9) * 0.9;
    }
    if (m < 4.5) return 0.5 * sin(t * 220.0 - time * 4.0) * (0.6 + 0.4 * sin(t * 20.0));
    float g = fract(t * 9.0 - time * 0.3);
    float env = smoothstep(0.35, 0.5, g) * (1.0 - smoothstep(0.7, 0.85, g));
    return env * 0.7 * sin(t * 700.0 - time * 9.0) * (0.5 + 0.5 * hash(floor(t * 90.0)));
  }
  // Comets: sharp leading edge, long fading tail, evenly spaced along the thread.
  float pulses(float t) {
    float best = 0.0;
    for (int i = 0; i < ${PULSE_COUNT}; i++) {
      float head = fract(uTime * ${PULSE_SPEED.toFixed(3)} + float(i) / ${PULSE_COUNT}.0);
      float d = head - t;
      float trail = d >= 0.0 ? exp(-d * 34.0) : exp(d * 520.0);
      best = max(best, trail);
    }
    return best * uPulseOn;
  }
  void main() {
    float near = exp(-abs(aT - uHead) * 5.0);
    float h = mix(wave(uModeA, aT, uTime), wave(uModeB, aT, uTime), uMix);
    vec3 p = position + vec3(0.0, h * (0.2 + 0.8 * near) * uAmp, 0.0);
    float pulse = pulses(aT);
    float headGlow = exp(-abs(aT - uHead) * 14.0);
    float ends = smoothstep(0.0, 0.02, aT) * (1.0 - smoothstep(0.97, 1.0, aT));
    float base = 0.1 + 0.16 * exp(-abs(aT - uHead) * 7.0);
    vGlow = clamp((base + 0.34 * headGlow + 0.8 * pulse) * ends, 0.0, 1.0);
    vPulse = pulse;
    gl_PointSize = uSize * uPx * uScale * (1.0 + 1.3 * pulse + 0.4 * headGlow);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    // Calm the thread outside the active slot so it never fights the copy.
    vec2 ndc = gl_Position.xy / gl_Position.w;
    float inX = smoothstep(uSlot.x - ${SLOT_SOFT_EDGE.toFixed(2)}, uSlot.x, ndc.x) * (1.0 - smoothstep(uSlot.y, uSlot.y + ${SLOT_SOFT_EDGE.toFixed(2)}, ndc.x));
    float inY = smoothstep(uSlot.z - ${SLOT_SOFT_EDGE.toFixed(2)}, uSlot.z, ndc.y) * (1.0 - smoothstep(uSlot.w, uSlot.w + ${SLOT_SOFT_EDGE.toFixed(2)}, ndc.y));
    vGlow *= mix(${OUTSIDE_SLOT_GLOW.toFixed(2)}, 1.0, inX * inY);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor, uPulseColor;
  uniform float uLeftPx, uDpr;
  varying float vGlow;
  varying float vPulse;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float falloff = exp(-d * d * 4.2);
    vec3 color = mix(uColor, uPulseColor, clamp(vPulse * 1.3, 0.0, 1.0));
    float leftFade = smoothstep(uLeftPx, uLeftPx + ${LEFT_RAMP_PX.toFixed(1)} * uDpr, gl_FragCoord.x);
    gl_FragColor = vec4(color, falloff * vGlow * leftFade);
  }
`;

function buildThread() {
  const points = DESK_EXIT.map(([x, z]) => new THREE.Vector3(x, THREAD_LIFT, z));
  const midIndex = [];
  STATIONS.slice(1).forEach((s) => {
    const z = s.position[2] + STATION_FRONT_Z;
    points.push(new THREE.Vector3(s.position[0] - STATION_REACH_X, THREAD_LIFT, z));
    midIndex.push(points.length);
    points.push(new THREE.Vector3(s.position[0], THREAD_LIFT, z));
    points.push(new THREE.Vector3(s.position[0] + STATION_REACH_X, THREAD_LIFT, z));
  });
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const samples = curve.getSpacedPoints(POINT_COUNT - 1);
  const stationT = STATIONS.map((s, i) => {
    if (i === 0) return 0.02;
    const target = points[midIndex[i - 1]];
    let best = 0;
    samples.forEach((p, k) => {
      if (p.distanceToSquared(target) < samples[best].distanceToSquared(target)) best = k;
    });
    return best / (POINT_COUNT - 1);
  });
  return { samples, stationT };
}

/** Glowing GPU point thread from the hero desk to every station. */
export function createSignal({ scene, theme, pixelRatio }) {
  const { samples, stationT } = buildThread();
  const positions = new Float32Array(POINT_COUNT * 3);
  const ts = new Float32Array(POINT_COUNT);
  samples.forEach((p, i) => {
    positions.set([p.x, p.y, p.z], i * 3);
    ts[i] = i / (POINT_COUNT - 1);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aT', new THREE.BufferAttribute(ts, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uHead: { value: stationT[0] },
      uSize: { value: POINT_SIZE[theme] || POINT_SIZE.paper },
      uPx: { value: pixelRatio },
      uDpr: { value: pixelRatio },
      uLeftPx: { value: 0 },
      uScale: { value: 1 },
      uMix: { value: 1 },
      uModeA: { value: MODE.DRIFT },
      uModeB: { value: MODE.DRIFT },
      uAmp: { value: AMPLITUDE },
      uPulseOn: { value: 1 },
      uSlot: { value: new THREE.Vector4(-2, 2, -2, 2) },
      uColor: { value: new THREE.Color() },
      uPulseColor: { value: new THREE.Color() },
    },
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = THREAD_RENDER_ORDER;
  scene.add(points);
  const head = new CriticalSpring(stationT[0], HEAD_SMOOTH_SECONDS);

  function setTheme(name) {
    const colors = COLORS[name] || COLORS.paper;
    material.uniforms.uColor.value.setHex(colors.thread);
    material.uniforms.uPulseColor.value.setHex(colors.pulse);
    material.uniforms.uSize.value = POINT_SIZE[name] || POINT_SIZE.paper;
    material.blending = name === 'ink' ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
  }
  setTheme(theme);

  return {
    setTheme,
    setPixelRatio: (value) => {
      material.uniforms.uPx.value = value;
      material.uniforms.uDpr.value = value;
    },
    /** Slot rect and canvas rect (viewport px) the thread is allowed to glow in. */
    setSlot(slot, view, isHero = false) {
      const x = (px) => ((px - view.left) / view.width) * 2 - 1;
      const y = (py) => 1 - ((py - view.top) / view.height) * 2;
      material.uniforms.uSlot.value.set(x(slot.left), x(slot.right), y(slot.bottom), y(slot.top));
      // Hero lets the thread run free; story slots fade it left of their edge.
      material.uniforms.uLeftPx.value = isHero || slot.width < NARROW_SLOT_PX ? 0 : (slot.left - view.left) * material.uniforms.uDpr.value;
    },
    /** The glowing waveform follows the active station along the thread. */
    setStation(index) {
      if (index >= 0) head.target = stationT[index];
    },
    setChapter(id, index) {
      const next = modeForChapter(id, index);
      const u = material.uniforms;
      if (next === u.uModeB.value) return;
      u.uModeA.value = u.uMix.value >= 1 ? u.uModeB.value : u.uModeA.value;
      u.uModeB.value = next;
      u.uMix.value = 0;
    },
    update(dt, time, ppu, isReducedMotion) {
      const u = material.uniforms;
      head.step(dt);
      u.uTime.value = isReducedMotion ? 0 : time;
      u.uPulseOn.value = isReducedMotion ? 0 : 1;
      u.uHead.value = head.value;
      u.uScale.value = THREE.MathUtils.clamp(ppu / BASE_PPU, MIN_SCALE, MAX_SCALE);
      u.uMix.value = Math.min(1, u.uMix.value + dt / MODE_FADE_SECONDS);
    },
    dispose() {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}
