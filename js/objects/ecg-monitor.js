// Bedside patient monitor figure (units: 1 = 10 cm). The screen draws a live scrolling ECG. No logos.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const [HOUSING_W, HOUSING_H, HOUSING_D] = [3.2, 2.1, 0.5];
const [BASE_R, BASE_H, POLE_TOP] = [0.85, 0.14, 1.55];
const HEAD_Y = POLE_TOP + HOUSING_H / 2;
const HEAD_YAW = 0.45;
const RIG_X = -0.4;
const [SCREEN_W, SCREEN_H, SCREEN_Y] = [2.7, 1.6, 0.1];
const [CANVAS_W, CANVAS_H] = [540, 320];
const TRACE_PAD = 20;
const BASELINE_Y = 196;
const AMPLITUDE_PX = 105;
const WINDOW_S = 4.2;
const [BEAT_LOOKAHEAD_S, SINUS_RR, REPAINT_S, BPM_SMOOTH] = [0.4, 0.86, 1 / 30, 4];
const [ALARM_HZ, MUTE_S, RHYTHM_SEED, EXPLODE_RATE, SHADOW_RADIUS] = [2.2, 4, 20250, 7, 3.6];
const FALLBACK = { dark: 0x2b2825, white: 0xfbfaf5, silver: 0xc7cacc, paper: 0xf4efe6, sakura: 0xd47589, glass: 0xbcd4da };
const ROLE_ALIAS = { ink: 'dark' };
const INK = { bg: '#101317', grid: '212,117,137', trace: '#e58ba0', text: '#e9e2d3', dim: '#8d8a82' };
const FONT = 'ui-monospace, Menlo, Consolas, monospace';
const BULB_OFF = 0x5b6168;

function makeExploder(parts) {
  let k = 0;
  return (dt, state) => {
    if (typeof state?.exploded !== 'boolean') return;
    const target = state.exploded ? 1 : 0;
    if (k === target) return;
    k += (target - k) * (1 - Math.exp(-EXPLODE_RATE * dt));
    if (Math.abs(target - k) < 1e-3) k = target;
    for (const p of parts) p.position.copy(p.userData.home).addScaledVector(p.userData.explode, k);
  };
}

// Shared roles come from ctx.materials properties; explode is owned by ctx.parts when present.
function makeKit(ctx) {
  const owned = [];
  const cache = new Map();
  const mats = ctx && ctx.materials;
  const mark = typeof ctx?.parts?.mark === 'function' ? ctx.parts.mark : null;
  const mat = (name, color) => {
    const role = ROLE_ALIAS[name] ?? name;
    const base = mats?.[role] ?? null;
    if (base && color === undefined) return base;
    if (!base && color === undefined && cache.has(role)) return cache.get(role);
    const m = base?.clone ? base.clone() : new THREE.MeshToonMaterial();
    m.color?.set(color ?? FALLBACK[role] ?? 0xffffff);
    if (role === 'glass' && !base) Object.assign(m, { transparent: true, opacity: 0.42, depthWrite: false });
    owned.push(m);
    if (!base && color === undefined) cache.set(role, m);
    return m;
  };
  const basic = (params) => {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false, ...params });
    owned.push(m);
    return m;
  };
  const outline = (mesh) => {
    if (typeof mats?.makeOutline === 'function') mats.makeOutline(mesh);
    return mesh;
  };
  const addPart = (parent, parts, obj, label, pos, explode) => {
    obj.position.copy(pos);
    const offset = typeof explode === 'number' ? [0, explode, 0] : explode.toArray();
    if (mark) {
      mark(obj, { explode: offset, label });
    } else {
      obj.userData.home = obj.position.clone();
      obj.userData.explode = new THREE.Vector3(...offset);
      obj.userData.label = label;
    }
    parent.add(obj);
    parts.push(obj);
    return obj;
  };
  const exploder = (parts) => (mark ? () => {} : makeExploder(parts));
  const sakura = () => mats?.sakura?.color ?? new THREE.Color(FALLBACK.sakura);
  return { owned, mat, basic, outline, addPart, exploder, sakura };
}

function anchorOn(part, local, label, side) {
  const marker = new THREE.Object3D();
  marker.position.copy(local);
  part.add(marker);
  return { object3D: marker, label, side };
}

function disposeAll(group, owned) {
  group.traverse((o) => o.geometry?.dispose?.());
  for (const m of owned) m.dispose();
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bump = (x, width) => Math.exp(-(x * x) / (2 * width * width));

// One heartbeat centred on its R peak: P (sinus only), Q, R, S, T.
function beatShape(dt, isAf) {
  const p = isAf ? 0 : 0.13 * bump(dt + 0.2, 0.04);
  return p - 0.14 * bump(dt + 0.035, 0.011) + bump(dt, 0.014) - 0.26 * bump(dt - 0.04, 0.013) + 0.3 * bump(dt - 0.27, 0.06);
}

// Schedules beats on a clock; sinus is regular with P waves, AF is irregular with f-waves instead.
function createRhythm(seed) {
  const rand = mulberry32(seed);
  const beats = [];
  const switches = [];
  let [isAf, next] = [false, -WINDOW_S];
  const interval = () => (isAf ? 0.3 + rand() * 0.5 : SINUS_RR + (rand() - 0.5) * 0.04);
  const isAfAt = (tau) => {
    for (let i = switches.length - 1; i >= 0; i--) if (switches[i].t <= tau) return switches[i].isAf;
    return false;
  };
  function advance(now) {
    while (next < now + BEAT_LOOKAHEAD_S) {
      beats.push({ t: next, isAf, amp: isAf ? 0.72 + rand() * 0.28 : 1 });
      next += interval();
    }
    while (beats.length > 2 && beats[0].t < now - WINDOW_S - 1) beats.shift();
    while (switches.length > 1 && switches[1].t < now - WINDOW_S - 1) switches.shift();
  }
  function setAf(value, now) {
    if (value === isAf) return;
    isAf = value;
    switches.push({ t: now, isAf });
    while (beats.length && beats[beats.length - 1].t > now) beats.pop();
    const last = beats.length ? beats[beats.length - 1].t : now - 1;
    next = Math.max(last + interval(), now + 0.02);
  }
  function reset(value, now) {
    beats.length = 0;
    switches.length = 0;
    isAf = value;
    next = now - WINDOW_S;
    advance(now);
  }
  function sample(tau) {
    let y = 0.012 * Math.sin(tau * 0.9);
    for (const b of beats) {
      const d = tau - b.t;
      if (d > -0.3 && d < 0.7) y += b.amp * beatShape(d, b.isAf);
    }
    if (!isAfAt(tau)) return y;
    return y + 0.045 * Math.sin(tau * 41) + 0.035 * Math.sin(tau * 27 + 1.3) + 0.02 * Math.sin(tau * 63 + 0.4);
  }
  function bpm(now) {
    const seen = beats.filter((b) => b.t <= now).slice(-6);
    if (seen.length < 2) return 72;
    return 60 / ((seen[seen.length - 1].t - seen[0].t) / (seen.length - 1));
  }
  return { advance, setAf, reset, sample, bpm, beats, isAf: () => isAf };
}

function paintGrid(g) {
  for (const [step, alpha] of [[20, 0.07], [100, 0.16]]) {
    g.strokeStyle = `rgba(${INK.grid},${alpha})`;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= CANVAS_W; x += step) g.rect(x, 0, 0, CANVAS_H);
    for (let y = 0; y <= CANVAS_H; y += step) g.rect(0, y, CANVAS_W, 0);
    g.stroke();
  }
}

function paintScreen(g, rhythm, now, bpmShown) {
  const isAf = rhythm.isAf();
  const span = CANVAS_W - TRACE_PAD * 2;
  g.fillStyle = INK.bg;
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
  paintGrid(g);
  g.textAlign = 'left';
  g.fillStyle = INK.text;
  g.font = `700 22px ${FONT}`;
  g.fillText('II', 22, 34);
  g.fillStyle = isAf ? INK.trace : INK.dim;
  g.font = `600 18px ${FONT}`;
  g.fillText(isAf ? 'AF  IRREGULAR' : 'SINUS RHYTHM', 58, 34);
  g.textAlign = 'right';
  g.fillStyle = INK.dim;
  g.font = `600 13px ${FONT}`;
  g.fillText('BPM', CANVAS_W - 22, 16);
  g.fillStyle = INK.text;
  g.font = `700 54px ${FONT}`;
  g.fillText(String(Math.round(bpmShown)), CANVAS_W - 22, 56);
  g.fillStyle = INK.trace;
  for (const b of rhythm.beats) {
    const x = TRACE_PAD + ((b.t - (now - WINDOW_S)) / WINDOW_S) * span;
    if (x < TRACE_PAD || x > CANVAS_W - TRACE_PAD) continue;
    g.beginPath();
    g.moveTo(x - 5, 70);
    g.lineTo(x + 5, 70);
    g.lineTo(x, 80);
    g.fill();
  }
  g.strokeStyle = INK.trace;
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.beginPath();
  let lastY = BASELINE_Y;
  for (let i = 0; i <= span; i++) {
    lastY = BASELINE_Y - rhythm.sample(now - WINDOW_S + (i / span) * WINDOW_S) * AMPLITUDE_PX;
    if (i === 0) g.moveTo(TRACE_PAD, lastY);
    else g.lineTo(TRACE_PAD + i, lastY);
  }
  g.stroke();
  g.fillStyle = INK.text;
  g.beginPath();
  g.arc(CANVAS_W - TRACE_PAD, lastY, 4.5, 0, Math.PI * 2);
  g.fill();
}

function leadCurve(start, end, bend) {
  const mid = (t, y) => new THREE.Vector3().lerpVectors(start, end, t).setY(y);
  const side = new THREE.Vector3(-(end.z - start.z), 0, end.x - start.x).normalize().multiplyScalar(bend);
  return new THREE.CatmullRomCurve3([
    start,
    start.clone().add(new THREE.Vector3(0.05, -0.5, 0)),
    mid(0.35, 0.75).add(new THREE.Vector3(0.12, 0, 0)),
    mid(0.7, 0.25).add(side),
    end.clone().add(new THREE.Vector3(0, 0.05, 0)).addScaledVector(side, -0.4),
    end.clone().setY(0.04),
  ]);
}

function buildPinComb(material) {
  const pins = [];
  for (let i = 0; i < 9; i++) {
    for (const s of [-1, 1]) pins.push(new THREE.BoxGeometry(0.035, 0.03, 0.07).translate(-0.32 + i * 0.08, -0.03, s * 0.29));
  }
  const merged = mergeGeometries(pins);
  pins.forEach((g) => g.dispose());
  return new THREE.Mesh(merged, material);
}

export function create(ctx) {
  const kit = makeKit(ctx);
  const group = new THREE.Group();
  group.name = 'ecg-monitor';
  const rig = new THREE.Group();
  rig.position.x = RIG_X;
  group.add(rig);
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  head.rotation.y = HEAD_YAW;
  rig.add(head);
  const parts = [];
  const anchors = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const rbox = (w, h, d, r, material) => kit.outline(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material));
  const cyl = (r0, r1, h, material, seg = 24) => kit.outline(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), material));

  kit.addPart(rig, parts, cyl(BASE_R, BASE_R * 1.06, BASE_H, kit.mat('white'), 40), 'base', v(0, BASE_H / 2, 0), 0);

  const stand = new THREE.Group();
  const poleLen = POLE_TOP - BASE_H;
  const pole = cyl(0.1, 0.1, poleLen, kit.mat('silver'), 20);
  const foot = cyl(0.2, 0.26, 0.14, kit.mat('dark'), 20);
  const yoke = rbox(0.5, 0.14, 0.3, 0.03, kit.mat('dark'));
  pole.position.y = poleLen / 2;
  foot.position.y = 0.07;
  yoke.position.y = poleLen - 0.07;
  stand.add(pole, foot, yoke);
  kit.addPart(rig, parts, stand, 'stand', v(0, BASE_H, 0), 0.5);

  const housing = new THREE.Group();
  housing.add(rbox(HOUSING_W, HOUSING_H, HOUSING_D, 0.14, kit.mat('white')));
  const buttonGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16).rotateX(Math.PI / 2);
  [-0.6, -0.4, -0.2, 0.9].forEach((x) => {
    const button = new THREE.Mesh(buttonGeo, kit.mat('silver'));
    button.position.set(x, -HOUSING_H / 2 + 0.14, HOUSING_D / 2 + 0.01);
    housing.add(kit.outline(button));
  });
  const port = rbox(0.34, 0.14, 0.28, 0.02, kit.mat('dark'));
  port.position.set(0.9, -HOUSING_H / 2 - 0.05, 0);
  housing.add(port);
  kit.addPart(head, parts, housing, 'housing', v(0, 0, 0), 1.0);

  const canvas = Object.assign(document.createElement('canvas'), { width: CANVAS_W, height: CANVAS_H });
  const g2d = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Group();
  screen.add(rbox(SCREEN_W + 0.25, SCREEN_H + 0.2, 0.06, 0.05, kit.mat('ink')));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), kit.basic({ map: texture }));
  face.position.z = 0.032;
  screen.add(face);
  kit.addPart(head, parts, screen, 'ecg trace', v(0, SCREEN_Y, HOUSING_D / 2 + 0.03), v(0, 2.0, 0.9));

  const chip = new THREE.Group();
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.55), kit.mat('paper'));
  const die = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.3), kit.mat('ink'));
  die.position.y = 0.06;
  const dieCore = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.14), kit.mat('sakura'));
  dieCore.position.y = 0.045;
  die.add(dieCore);
  chip.add(kit.outline(card), kit.outline(die), buildPinComb(kit.mat('silver')));
  kit.addPart(head, parts, chip, 'resformer', v(-0.95, HOUSING_H / 2 + 0.04, -0.05), 2.1);

  const alarm = new THREE.Group();
  const lampBase = cyl(0.2, 0.22, 0.1, kit.mat('ink'), 20);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), kit.mat('glass'));
  const bulbMat = kit.basic({ color: BULB_OFF });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), bulbMat);
  [lampBase.position.y, dome.position.y, bulb.position.y] = [0.05, 0.1, 0.17];
  alarm.add(lampBase, dome, bulb);
  kit.addPart(head, parts, alarm, 'alarm', v(1.1, HOUSING_H / 2, -0.05), 1.5);

  const leads = new THREE.Group();
  const start = v(0.9, -HOUSING_H / 2 - 0.12, 0).applyAxisAngle(v(0, 1, 0), HEAD_YAW).add(v(0, HEAD_Y, 0));
  const ends = [v(2.0, 0, 0.8), v(1.2, 0, 1.5), v(2.55, 0, -0.2)];
  const padGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.03, 20);
  const snapGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12);
  ends.forEach((end, i) => {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(leadCurve(start, end, (i - 1) * 0.35), 44, 0.034, 6), kit.mat('sakura'));
    const pad = kit.outline(new THREE.Mesh(padGeo, kit.mat('white')));
    const snap = new THREE.Mesh(snapGeo, kit.mat('ink'));
    pad.position.set(end.x, 0.015, end.z);
    snap.position.y = 0.03;
    pad.add(snap);
    leads.add(tube, pad);
  });
  kit.addPart(rig, parts, leads, 'lead ii', v(0, 0, 0), 0.3);

  const rhythm = createRhythm(RHYTHM_SEED);
  let [now, clock, sinceRepaint, mutedUntil, bpmShown] = [0, 0, 0, 0, 72];
  rhythm.advance(now);
  const repaint = () => {
    if (g2d) paintScreen(g2d, rhythm, now, bpmShown);
    texture.needsUpdate = true;
    sinceRepaint = 0;
  };
  repaint();

  anchors.push(anchorOn(screen, v(-0.5, -0.15, 0.04), 'ecg trace', 'left'));
  anchors.push(anchorOn(screen, v(0.45, 0.34, 0.04), 'r-peak', 'right'));
  anchors.push(anchorOn(screen, v(1.1, 0.65, 0.04), 'bpm', 'right'));
  anchors.push(anchorOn(leads, v(ends[0].x, 0.08, ends[0].z), 'lead ii', 'right'));
  anchors.push(anchorOn(chip, v(0, 0.1, 0), 'resformer', 'left'));
  anchors.push(anchorOn(alarm, v(0, 0.2, 0), 'alarm', 'right'));

  const explode = kit.exploder(parts);
  const off = new THREE.Color(BULB_OFF);

  function update(dt, state) {
    const reduced = Boolean(state?.reducedMotion);
    const wantAf = state?.controls?.['heart-rhythm'] === 'af';
    clock += dt;
    if (!reduced) now += dt;
    let isDirty = false;
    if (wantAf !== rhythm.isAf()) {
      if (reduced) rhythm.reset(wantAf, now);
      else rhythm.setAf(wantAf, now);
      isDirty = true;
    }
    rhythm.advance(now);
    const targetBpm = rhythm.bpm(now);
    bpmShown = reduced ? targetBpm : bpmShown + (targetBpm - bpmShown) * (1 - Math.exp(-BPM_SMOOTH * dt));
    sinceRepaint += dt;
    if (isDirty || (!reduced && sinceRepaint >= REPAINT_S)) repaint();
    const isAlarming = wantAf && clock >= mutedUntil;
    const isBlinkOn = reduced || Math.sin(clock * Math.PI * 2 * ALARM_HZ) > 0;
    bulbMat.color.copy(isAlarming && isBlinkOn ? kit.sakura() : off);
    explode(dt, state);
  }

  function onPick(part) {
    if (part?.userData?.label === 'alarm') mutedUntil = clock + MUTE_S;
    return part?.userData?.label ?? null;
  }

  function dispose() {
    texture.dispose();
    disposeAll(group, kit.owned);
  }

  group.userData.shadowRadius = SHADOW_RADIUS;
  return { group, parts, anchors, update, onPick, dispose };
}
