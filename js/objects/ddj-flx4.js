// White 4-channel DJ controller figure (units: 1 = 10 cm), laid out like a white club-style unit.
// Front of the unit is +z, left deck is -x. No logos or printed marks.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const WIDTH = 4.83;
const DEPTH = 2.72;
const HEIGHT = 0.59;
const BEVEL = 0.04;
const CORNER = 0.14;
const CREASE = 0.7;
const EDGE_DEG = 30;
const DECK_X = 1.54;
const DECKS = [-DECK_X, DECK_X];
const JOG_Z = -0.19;
const RIM_R = 0.68;
const RIM_H = 0.075;
const PLATTER_R = 0.565;
const PLATTER_H = 0.105;
const SCALLOPS = 28;
const SCALLOP_DEPTH = 0.02;
const GLOW_ARC = [-0.33, 1.6];
const PAD_PITCH = 0.23;
const PAD_ROWS_Z = [1.12, 0.88];
const MODE_Z = 0.65;
const PLATE_H = 0.018;
const BACK_Z = -1.05;
const SEAM_X = 0.77;
const CH_X = 0.2;
const STRIP_X = 0.57;
const KNOB_Z = { trim: -0.93, hi: -0.7, mid: -0.46, low: -0.22, cfx: 0.04 };
const KNOB_ANGLES = [-0.9, 0.5, 1.1, -0.3, 0.2, -1.2, 0.8];
const FADER_LEN = 0.5;
const FADER_Z = 0.66;
const XFADE_Z = 1.17;
const XFADE_TRAVEL = 0.22;
const TEMPO_DX = 0.6;
const TEMPO_Z = 0.79;
const TEMPO_LEN = 0.7;
const CABLE_R = 0.02;
const SPIN_GAIN = 25;
const SPIN_DAMPING = 2.5;
const FADE_SMOOTH = 12;
const SHADOW_RADIUS = 3.2;
const EXPLODE_RATE = 7;
const ORANGE = 0xff8a2e;
const LED_GREEN = 0x7dff5a;
const GLOW = { paper: { diffuse: 0.85, emissive: 0.15 }, ink: { diffuse: 0.08, emissive: 0.85 } };
const TINT = { paper: 0xffffff, ink: 0xd6d6d6 };
const C = {
  body: 0xe9e9e6, platter: 0xcdd0d1, rim: 0xbcc0c2, ring: 0xa6aaac, white: 0xf3f3f0, pad: 0x5a5a5a,
  knob: 0xdddede, skirt: 0xb3b6b8, ink: 0x27282c, seam: 0xc6c8c6, mark: 0x8d9294, cable: 0xf1f1ee,
};

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

// Three vertex-coloured/emissive materials cover the whole figure; ctx.materials only supplies the gradient ramp.
function makeKit(ctx) {
  const mats = ctx?.materials;
  const mark = typeof ctx?.parts?.mark === 'function' ? ctx.parts.mark : null;
  const base = { gradientMap: mats?.gradient ?? null, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const lit = (hex) => new THREE.MeshToonMaterial({ ...base, color: hex, emissive: hex });
  const plastic = new THREE.MeshToonMaterial({ ...base, vertexColors: true });
  const glow = lit(ORANGE);
  const led = lit(LED_GREEN);
  const owned = [plastic, glow, led];
  let theme = '';
  const setTheme = (name) => {
    const key = name === 'ink' ? 'ink' : 'paper';
    if (key === theme) return;
    theme = key;
    plastic.color.setHex(TINT[key]);
    for (const [m, hex] of [[glow, ORANGE], [led, LED_GREEN]]) {
      m.color.setHex(hex).multiplyScalar(GLOW[key].diffuse);
      m.emissiveIntensity = GLOW[key].emissive;
    }
  };
  // Mesh with a merged hairline outline; edgeSrc null skips it.
  const mesh = (geo, material, edgeSrc = geo) => {
    const m = new THREE.Mesh(geo, material);
    if (edgeSrc && mats?.line) {
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(edgeSrc, EDGE_DEG), mats.line);
      lines.raycast = () => {};
      lines.userData.isOutline = true;
      m.add(lines);
    }
    return m;
  };
  const addPart = (parent, parts, obj, label, pos, lift) => {
    obj.position.copy(pos);
    const explode = [0, lift, 0];
    if (mark) mark(obj, { explode, label });
    else Object.assign(obj.userData, { home: pos.clone(), explode: new THREE.Vector3(...explode), label });
    parent.add(obj);
    parts.push(obj);
    return obj;
  };
  setTheme(ctx?.theme ?? mats?.theme);
  return { owned, plastic, glow, led, mesh, addPart, setTheme, exploder: (parts) => (mark ? () => {} : makeExploder(parts)) };
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

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const [x, y] = [w / 2 - r, d / 2 - r];
  [[x, -y], [x, y], [-x, y], [-x, -y]].forEach(([cx, cy], i) => s.absarc(cx, cy, r, ((i - 1) * Math.PI) / 2, (i * Math.PI) / 2, false));
  return s;
}

// Flat slab on y in [0, h] with a chamfer, so outlines trace the bevel.
function slab(w, h, d, radius, bevel) {
  const raw = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bevel, d - 2 * bevel, radius - bevel), {
    depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8,
  });
  raw.rotateX(-Math.PI / 2).translate(0, bevel, 0);
  const smooth = toCreasedNormals(raw, CREASE);
  raw.dispose();
  return smooth;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const cyl = (rTop, rBottom, h, seg = 24) => new THREE.CylinderGeometry(rTop, rBottom, h, seg).translate(0, h / 2, 0);

// Collects shapes into one geometry; each carries a per-vertex colour so a single draw call can mix greys.
function bake() {
  const list = [];
  const api = {
    add(geo, hex, x = 0, y = 0, z = 0, turn = 0) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.deleteAttribute('uv');
      g.rotateY(turn).translate(x, y, z);
      const colors = new Float32Array(g.attributes.position.count * 3);
      const c = new THREE.Color(hex);
      for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      list.push(g);
      return api;
    },
    build() {
      const merged = mergeGeometries(list);
      list.forEach((g) => g.dispose());
      return merged;
    },
  };
  return api;
}

function buildChassis(kit) {
  const body = slab(WIDTH, HEIGHT, DEPTH, CORNER, BEVEL);
  const b = bake().add(body, C.body);
  const groove = (w, d, x, z, hex) => b.add(box(w, 0.008, d), hex, x, HEIGHT - 0.002, z);
  for (const s of [-1, 1]) {
    groove(0.01, DEPTH - 0.3, s * SEAM_X, 0, C.seam);
    groove(0.045, FADER_LEN, s * CH_X, FADER_Z, C.ink);
    groove(0.045, TEMPO_LEN, s * DECK_X + TEMPO_DX, TEMPO_Z, C.ink);
    for (let i = 0; i < 5; i++) groove(0.022, 0.065, s * 0.05, -0.68 + i * 0.1, C.ink);
  }
  groove(XFADE_TRAVEL * 2 + 0.06, 0.045, 0, XFADE_Z, C.ink);
  const cable = [[0.78, 0.3, -1.25], [0.78, 0.3, -1.41], [0.79, 0.26, -1.47], [0.83, 0.13, -1.49], [0.92, 0.035, -1.49], [1.15, 0.022, -1.47], [1.4, 0.022, -1.42]];
  const path = new THREE.CatmullRomCurve3(cable.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  b.add(new THREE.TubeGeometry(path, 40, CABLE_R, 8), C.cable);
  b.add(new THREE.SphereGeometry(CABLE_R, 8, 6), C.cable, ...cable[cable.length - 1]);
  b.add(box(0.12, 0.07, 0.07), C.cable, 0.78, 0.265, -1.395);
  const chassis = kit.mesh(b.build(), kit.plastic, body);
  body.dispose();
  const dot = new THREE.CylinderGeometry(0.03, 0.03, 0.014, 12).translate(0, HEIGHT + 0.003, -0.8);
  chassis.add(new THREE.Mesh(dot, kit.led));
  return chassis;
}

// Silver grip ring with scalloped dimples around its outer wall.
function buildRim() {
  const profile = [[0.5, 0], [RIM_R, 0], [RIM_R, 0.025], [RIM_R, 0.05], [RIM_R - 0.03, RIM_H], [0.5, RIM_H]];
  const lathe = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), SCALLOPS * 5);
  const p = lathe.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < RIM_R - 0.035) continue;
    const wall = r > RIM_R - 0.001 ? 1 : 0.5;
    const k = (r - SCALLOP_DEPTH * wall * (0.5 + 0.5 * Math.cos(SCALLOPS * Math.atan2(z, x)))) / r;
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  const smooth = toCreasedNormals(lathe, CREASE);
  lathe.dispose();
  return bake().add(smooth, C.rim).build();
}

function buildPlatter() {
  return bake()
    .add(cyl(PLATTER_R, PLATTER_R, PLATTER_H, 72), C.platter)
    .add(new THREE.RingGeometry(0.228, 0.242, 72).rotateX(-Math.PI / 2), C.ring, 0, PLATTER_H + 0.003, 0)
    .add(box(0.016, 0.004, 0.1), C.mark, 0, PLATTER_H, -0.46)
    .build();
}

function addJogs(kit, group, parts, spinners) {
  const rim = buildRim();
  const platter = buildPlatter();
  const [aim, span] = GLOW_ARC;
  const arc = new THREE.RingGeometry(0.578, 0.628, 24, 1, aim - Math.PI / 2 - span / 2, span).rotateX(-Math.PI / 2).translate(0, RIM_H + 0.003, 0);
  return DECKS.map((cx) => {
    const jog = new THREE.Group();
    const spinner = new THREE.Group();
    spinner.add(kit.mesh(platter, kit.plastic));
    jog.add(new THREE.Mesh(rim, kit.plastic), new THREE.Mesh(arc, kit.glow), spinner);
    spinners.push(spinner);
    return kit.addPart(group, parts, jog, 'jog wheel', new THREE.Vector3(cx, HEIGHT, JOG_Z), 1.9);
  });
}

// 2 x 4 grey pads in orange frames per deck, plus four orange pad-mode keys behind them.
function addPads(kit, group, parts) {
  const caps = bake();
  const frames = bake();
  const plate = box(PAD_PITCH - 0.025, PLATE_H, PAD_PITCH - 0.025);
  const cap = box(PAD_PITCH - 0.075, 0.03, PAD_PITCH - 0.075);
  const mode = box(0.19, 0.03, 0.09);
  for (const cx of DECKS) {
    for (let c = 0; c < 4; c++) {
      const x = cx + (c - 1.5) * PAD_PITCH;
      for (const z of PAD_ROWS_Z) {
        frames.add(plate, ORANGE, x, HEIGHT, z);
        caps.add(cap, C.pad, x, HEIGHT + PLATE_H, z);
      }
      frames.add(mode, ORANGE, x, HEIGHT, MODE_Z);
    }
  }
  const pads = new THREE.Group();
  pads.add(kit.mesh(caps.build(), kit.plastic), kit.mesh(frames.build(), kit.glow));
  return kit.addPart(group, parts, pads, '16 performance pads', new THREE.Vector3(), 1.5);
}

// Transport, hot-cue and loop buttons: white/grey caps in one mesh, glowing orange keys in another.
function addButtons(kit, group, parts) {
  const caps = bake();
  const keys = bake();
  const round = (rBase, rCap, x, z, hex = C.white) => {
    caps.add(cyl(rBase, rBase, 0.025), C.ring, x, HEIGHT, z).add(cyl(rCap, rCap, 0.045), hex, x, HEIGHT, z);
  };
  const square = (w, d, x, z, hex = C.white) => {
    caps.add(box(w, 0.022, d), C.ring, x, HEIGHT, z).add(box(w - 0.035, 0.04, d - 0.035), hex, x, HEIGHT, z);
  };
  const orange = (r, x, z) => keys.add(cyl(r, r, 0.035), ORANGE, x, HEIGHT, z);
  for (const cx of DECKS) {
    round(0.14, 0.11, cx - 0.62, 1.08);
    round(0.14, 0.11, cx - 0.62, 0.79);
    square(0.13, 0.13, cx - 0.62, 0.5);
    orange(0.09, cx - 0.57, BACK_Z);
    orange(0.09, cx - 0.33, BACK_Z);
    round(0.055, 0.04, cx - 0.08, BACK_Z, C.knob);
    round(0.055, 0.04, cx + 0.19, BACK_Z, C.knob);
    round(0.055, 0.04, cx + 0.4, BACK_Z, C.knob);
    orange(0.085, cx + 0.62, BACK_Z);
  }
  for (const s of [-1, 1]) {
    square(0.22, 0.13, s * 0.35, -1.14);
    keys.add(box(0.15, 0.03, 0.085), ORANGE, s * CH_X, HEIGHT, 0.27);
    square(0.075, 0.075, STRIP_X + s * 0.045, 0.29, C.knob);
  }
  orange(0.085, -STRIP_X, 0.9);
  orange(0.085, -STRIP_X, 0.05);
  orange(0.105, STRIP_X, 0.85);
  keys.add(box(0.11, 0.03, 0.075), ORANGE, STRIP_X, HEIGHT, -0.88);
  square(0.1, 0.09, STRIP_X, 0.04, C.knob);
  caps.add(box(0.13, 0.02, 0.16), C.ring, STRIP_X, HEIGHT, -0.46);
  caps.add(box(0.04, 0.026, 0.12), C.ink, STRIP_X, HEIGHT, -0.46);
  caps.add(box(0.09, 0.07, 0.05), C.white, STRIP_X, HEIGHT, -0.44);
  const buttons = new THREE.Group();
  buttons.add(kit.mesh(caps.build(), kit.plastic), kit.mesh(keys.build(), kit.glow));
  return kit.addPart(group, parts, buttons, 'cue / play', new THREE.Vector3(), 1.5);
}

// Light-grey knob caps on a darker skirt, each with a dark indicator line; spec = { x, z, r, a }.
function knobMesh(kit, specs) {
  const b = bake();
  const top = HEIGHT + 0.12;
  for (const { x, z, r, a } of specs) {
    const reach = r * 0.45;
    b.add(cyl(r * 1.14, r * 1.14, 0.03), C.skirt, x, HEIGHT, z);
    b.add(cyl(r * 0.8, r, 0.09), C.knob, x, HEIGHT + 0.03, z);
    b.add(box(0.02, 0.008, r * 0.65), C.ink, x + Math.sin(a) * reach, top - 0.002, z - Math.cos(a) * reach, Math.PI - a);
  }
  return kit.mesh(b.build(), kit.plastic);
}

function channelKnobs(keys) {
  return [-1, 1].flatMap((s, ch) => keys.map((k, i) => ({
    x: s * CH_X, z: KNOB_Z[k], r: k === 'trim' ? 0.075 : 0.09, a: KNOB_ANGLES[(i + ch * 2 + keys.length) % KNOB_ANGLES.length],
  })));
}

const AUX_KNOBS = [
  { x: -STRIP_X, z: 0.6, r: 0.085, a: 0.9 },
  { x: -STRIP_X, z: 0.34, r: 0.085, a: -0.3 },
  { x: -STRIP_X, z: -0.44, r: 0.085, a: -1.0 },
  { x: STRIP_X, z: 0.6, r: 0.085, a: 0.5 },
  { x: STRIP_X, z: -1.11, r: 0.095, a: 0.9 },
  { x: 0, z: -1.14, r: 0.085, a: 0.2 },
];

function capsMesh(kit, specs, [w, h, d], y0) {
  const b = bake();
  for (const { x, z } of specs) {
    b.add(box(w, h, d), C.white, x, y0, z);
    b.add(box(w * 0.82, 0.008, 0.014), C.ink, x, y0 + h - 0.002, z);
  }
  return kit.mesh(b.build(), kit.plastic);
}

function addMixer(kit, group, parts) {
  const origin = new THREE.Vector3();
  const part = (obj, label, lift) => kit.addPart(group, parts, obj, label, origin, lift);
  const eq = part(knobMesh(kit, channelKnobs(['hi', 'mid', 'low'])), '3-band eq', 1.2);
  part(knobMesh(kit, channelKnobs(['trim', 'cfx'])), 'trim / filter', 1.2);
  part(knobMesh(kit, AUX_KNOBS), 'mixer knobs', 1.2);
  const channelCaps = [-1, 1].map((s, i) => ({ x: s * CH_X, z: FADER_Z - FADER_LEN / 2 + 0.11 + i * 0.1 }));
  const channel = part(capsMesh(kit, channelCaps, [0.2, 0.09, 0.1], HEIGHT), 'channel fader', 0.9);
  const tempoCaps = DECKS.map((cx, i) => ({ x: cx + TEMPO_DX, z: TEMPO_Z - i * 0.07 }));
  const tempo = part(capsMesh(kit, tempoCaps, [0.19, 0.09, 0.16], HEIGHT), 'tempo fader', 0.9);
  const slider = new THREE.Group();
  slider.add(capsMesh(kit, [{ x: 0, z: 0 }], [0.14, 0.09, 0.22], 0));
  const fader = new THREE.Group();
  fader.add(slider);
  kit.addPart(group, parts, fader, 'crossfader', new THREE.Vector3(0, HEIGHT, XFADE_Z), 0.9);
  return { eq, channel, tempo, slider };
}

export function create(ctx) {
  const kit = makeKit(ctx);
  const group = new THREE.Group();
  group.name = 'ddj-flx4';
  const parts = [];
  const spinners = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);

  kit.addPart(group, parts, buildChassis(kit), 'chassis', v(0, 0, 0), 0.6);
  const jogs = addJogs(kit, group, parts, spinners);
  const pads = addPads(kit, group, parts);
  const buttons = addButtons(kit, group, parts);
  const mixer = addMixer(kit, group, parts);

  const anchors = [
    anchorOn(jogs[0], v(-0.3, PLATTER_H + 0.004, 0.2), 'jog wheel', 'left'),
    anchorOn(pads, v(DECK_X - PAD_PITCH / 2, HEIGHT + PLATE_H + 0.03, PAD_ROWS_Z[1]), '16 performance pads', 'right'),
    anchorOn(mixer.eq, v(-CH_X, HEIGHT + 0.128, KNOB_Z.mid), '3-band eq', 'left'),
    anchorOn(mixer.slider, v(0, 0.094, 0), 'crossfader', 'right'),
    anchorOn(mixer.tempo, v(DECK_X + TEMPO_DX, HEIGHT + 0.094, TEMPO_Z), 'tempo fader', 'right'),
    anchorOn(mixer.channel, v(-CH_X, HEIGHT + 0.094, FADER_Z - FADER_LEN / 2 + 0.11), 'channel fader', 'left'),
    anchorOn(buttons, v(-DECK_X - 0.62, HEIGHT + 0.05, 1.08), 'cue / play', 'left'),
  ];

  const explode = kit.exploder(parts);
  let fade = 0.5;
  let jogVel = 0;

  function update(dt, state) {
    kit.setTheme(state?.theme ?? ctx?.materials?.theme);
    const raw = state?.controls?.['decks-crossfader'] ?? state?.crossfader;
    const target = typeof raw === 'number' ? Math.min(1, Math.max(0, raw)) : fade;
    const prev = fade;
    fade += (target - fade) * (1 - Math.exp(-FADE_SMOOTH * dt));
    mixer.slider.position.x = (fade - 0.5) * 2 * XFADE_TRAVEL;
    jogVel = (jogVel + (fade - prev) * SPIN_GAIN) * Math.exp(-SPIN_DAMPING * dt);
    if (!state?.reducedMotion) for (const s of spinners) s.rotation.y += jogVel * dt;
    explode(dt, state);
  }

  function onPick(part) {
    if (part?.userData?.label === 'jog wheel') jogVel += 6;
    return part?.userData?.label ?? null;
  }

  group.userData.shadowRadius = SHADOW_RADIUS;
  return { group, parts, anchors, update, onPick, dispose: () => disposeAll(group, kit.owned) };
}
