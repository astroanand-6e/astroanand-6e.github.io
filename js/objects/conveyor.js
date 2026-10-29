// Conveyor of patient-record cards through three gates; about 1 card in 14 escalates up a ramp and rings a bell.
// Units: 1 = 10 cm. Cards animate as children of one group, never as explodable parts. No logos.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const [BELT_X0, BELT_X1, BELT_W, BELT_TOP] = [-2.1, 2.1, 1.0, 0.96];
const [CARD_W, CARD_T, CARD_D, CARD_Y] = [0.42, 0.03, 0.3, 0.98];
const [GATE_PROPOSER_X, GATE_SKEPTIC_X, GATE_HARNESS_X] = [-1.3, -0.2, 0.9];
const [RAMP_X, RAMP_RUN, RAMP_RISE, EDGE_Z] = [1.6, 1.55, 0.75, -0.5];
const RAMP_ANGLE = Math.atan2(RAMP_RISE, RAMP_RUN);
const LANDING_Z = EDGE_Z - RAMP_RUN - 0.3;
const SPEEDS = { slow: 0.45, normal: 0.9, fast: 1.8 };
const [SPAWN_GAP, POOL_SIZE, ESCALATE_BLOCK] = [0.62, 14, 14];
const [RAMP_RATE, DWELL_S, SPEED_SMOOTH, LAMP_REACH] = [0.8, 0.7, 6, 0.3];
const [BELL_AMP, BELL_FREQ, BELL_DECAY] = [0.55, 14, 2.2];
const [RIB_COUNT, RIG_Z, CARD_SEED, EXPLODE_RATE, SHADOW_RADIUS] = [21, 0.85, 1407, 7, 4.0];
const FALLBACK = { dark: 0x2b2825, white: 0xfbfaf5, silver: 0xc7cacc, paper: 0xf4efe6, sakura: 0xd47589, glass: 0xbcd4da };
const ROLE_ALIAS = { ink: 'dark' };
const LAMP_OFF = 0x6b6f73;

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

const clamp01 = (n) => Math.min(1, Math.max(0, n));

function mergeBoxes(specs) {
  const geos = specs.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

export function create(ctx) {
  const kit = makeKit(ctx);
  const group = new THREE.Group();
  group.name = 'conveyor';
  const rig = new THREE.Group();
  rig.position.z = RIG_Z;
  group.add(rig);
  const parts = [];
  const anchors = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const rbox = (w, h, d, r, material) => kit.outline(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), material));
  const bar = (w, h, d, material) => kit.outline(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
  const at = (obj, x, y, z) => {
    obj.position.set(x, y, z);
    return obj;
  };

  const frame = new THREE.Group();
  const railSide = BELT_W / 2 + 0.08;
  const legGeo = new THREE.BoxGeometry(0.1, 0.72, 0.1);
  for (const sz of [-1, 1]) {
    frame.add(at(rbox(4.5, 0.16, 0.1, 0.03, kit.mat('white')), 0, 0.8, sz * railSide));
    for (const x of [-1.9, 0, 1.9]) frame.add(at(kit.outline(new THREE.Mesh(legGeo, kit.mat('silver'))), x, 0.36, sz * railSide));
  }
  const rollerGeo = new THREE.CylinderGeometry(0.16, 0.16, BELT_W + 0.1, 20).rotateX(Math.PI / 2);
  for (const x of [BELT_X0, BELT_X1]) frame.add(at(kit.outline(new THREE.Mesh(rollerGeo, kit.mat('silver'))), x, 0.8, 0));
  kit.addPart(rig, parts, frame, 'frame', v(0, 0, 0), 0);

  const belt = new THREE.Group();
  belt.add(at(kit.outline(new THREE.Mesh(new THREE.BoxGeometry(BELT_X1 - BELT_X0, 0.04, BELT_W), kit.mat('ink'))), 0, BELT_TOP - 0.02, 0));
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.012, BELT_W - 0.06), kit.mat('silver'), RIB_COUNT);
  ribs.frustumCulled = false;
  belt.add(ribs);
  kit.addPart(rig, parts, belt, 'belt', v(0, 0, 0), 0.5);

  const cardsGroup = new THREE.Group();
  const cardGeo = new RoundedBoxGeometry(CARD_W, CARD_T, CARD_D, 2, 0.008);
  const tabGeo = mergeBoxes([[0.1, 0.006, CARD_D - 0.02, -CARD_W / 2 + 0.07, CARD_T / 2 + 0.002, 0]]);
  const lineGeo = mergeBoxes([-0.07, 0, 0.07].map((z) => [0.22, 0.005, 0.02, 0.05, CARD_T / 2 + 0.002, z]));
  const flagGeo = mergeBoxes([[0.04, 0.16, 0.04, CARD_W / 2 - 0.05, CARD_T / 2 + 0.08, 0], [0.12, 0.06, 0.04, CARD_W / 2 - 0.1, CARD_T / 2 + 0.15, 0]]);
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const card = new THREE.Group();
    card.add(kit.outline(new THREE.Mesh(cardGeo, kit.mat('white'))), new THREE.Mesh(tabGeo, kit.mat('sakura')), new THREE.Mesh(lineGeo, kit.mat('ink')));
    const flag = new THREE.Mesh(flagGeo, kit.mat('sakura'));
    flag.visible = false;
    card.add(flag);
    card.visible = false;
    cardsGroup.add(card);
    pool.push({ node: card, flag, phase: 'idle', x: 0, r: 0, t: 0, isEscalated: false });
  }
  kit.addPart(rig, parts, cardsGroup, 'patient card', v(0, 0, 0), 1.1);

  const lampMats = [];
  const buildGate = (x, label, builder, explode) => {
    const gate = new THREE.Group();
    const lamp = kit.basic({ color: LAMP_OFF });
    lampMats.push(lamp);
    builder(gate, lamp);
    return kit.addPart(rig, parts, gate, label, v(x, 0, 0), explode);
  };
  const post = (gate, z, top) => gate.add(at(bar(0.12, top - 0.8, 0.12, kit.mat('silver')), 0, (top + 0.8) / 2, z));
  const lampAt = (gate, lamp, y) => gate.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), lamp), 0.1, y, 0));
  const sideZ = BELT_W / 2 + 0.22;

  const proposer = buildGate(GATE_PROPOSER_X, 'proposer', (gate, lamp) => {
    post(gate, -sideZ, 1.3);
    post(gate, sideZ, 1.3);
    const arch = kit.outline(new THREE.Mesh(new THREE.TorusGeometry(sideZ, 0.06, 10, 32, Math.PI), kit.mat('white')));
    arch.rotation.y = Math.PI / 2;
    const disc = kit.outline(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 28).rotateZ(Math.PI / 2), kit.mat('sakura')));
    gate.add(at(arch, 0, 1.3, 0), at(disc, 0, 2.3, 0));
    lampAt(gate, lamp, 1.3 + sideZ + 0.1);
  }, 1.9);

  const skeptic = buildGate(GATE_SKEPTIC_X, 'skeptic', (gate, lamp) => {
    post(gate, -sideZ, 1.5);
    post(gate, sideZ, 1.5);
    const slope = Math.hypot(sideZ, 0.6);
    for (const s of [-1, 1]) {
      const rafter = bar(0.1, 0.1, slope, kit.mat('white'));
      rafter.rotation.x = s * Math.atan2(0.6, sideZ);
      gate.add(at(rafter, 0, 1.8, (s * sideZ) / 2));
    }
    gate.add(at(bar(0.1, 0.1, sideZ * 2, kit.mat('white')), 0, 1.5, 0));
    gate.add(at(kit.outline(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 3), kit.mat('sakura'))), 0, 2.5, 0));
    lampAt(gate, lamp, 2.15);
  }, 1.9);

  const harness = buildGate(GATE_HARNESS_X, 'safety harness', (gate, lamp) => {
    post(gate, -sideZ, 1.75);
    post(gate, sideZ, 1.75);
    gate.add(at(bar(0.14, 0.12, sideZ * 2 + 0.12, kit.mat('white')), 0, 1.75, 0));
    gate.add(at(bar(0.1, 0.08, sideZ * 2, kit.mat('white')), 0, 1.3, 0));
    const strapLen = Math.hypot(sideZ * 2, 0.45);
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, strapLen), kit.mat('sakura'));
      strap.rotation.x = s * Math.atan2(0.45, sideZ * 2);
      gate.add(at(strap, 0.04, 1.525, 0));
    }
    gate.add(at(bar(0.08, 0.12, 0.12, kit.mat('silver')), 0.05, 1.525, 0));
    gate.add(at(bar(0.06, 0.34, 0.34, kit.mat('sakura')), 0, 2.1, 0));
    lampAt(gate, lamp, 1.88);
  }, 1.9);

  const ramp = new THREE.Group();
  const slab = rbox(0.55, 0.06, Math.hypot(RAMP_RUN, RAMP_RISE), 0.015, kit.mat('white'));
  slab.rotation.x = RAMP_ANGLE;
  const wallGeo = new THREE.BoxGeometry(0.04, 0.1, Math.hypot(RAMP_RUN, RAMP_RISE));
  ramp.add(at(slab, 0, BELT_TOP + RAMP_RISE / 2 - 0.03, EDGE_Z - RAMP_RUN / 2));
  for (const s of [-1, 1]) {
    const wall = kit.outline(new THREE.Mesh(wallGeo, kit.mat('silver')));
    wall.rotation.x = RAMP_ANGLE;
    ramp.add(at(wall, s * 0.295, BELT_TOP + RAMP_RISE / 2 + 0.02, EDGE_Z - RAMP_RUN / 2));
  }
  ramp.add(at(rbox(0.7, 0.08, 0.6, 0.02, kit.mat('white')), 0, BELT_TOP + RAMP_RISE - 0.04, LANDING_Z));
  const legs = [-0.27, 0.27].map((x) => at(bar(0.08, BELT_TOP + RAMP_RISE - 0.1, 0.08, kit.mat('silver')), x, (BELT_TOP + RAMP_RISE - 0.1) / 2, LANDING_Z));
  ramp.add(...legs);
  const paddle = new THREE.Group();
  paddle.add(at(bar(0.5, 0.18, 0.04, kit.mat('sakura')), -0.25, 0, 0));
  ramp.add(at(paddle, 0.3, BELT_TOP + 0.1, 0.46));
  kit.addPart(rig, parts, ramp, 'escalation ramp', v(RAMP_X, 0, 0), 0.8);

  const bellFrame = new THREE.Group();
  const bellTop = BELT_TOP + RAMP_RISE + 0.95;
  for (const x of [-0.3, 0.3]) bellFrame.add(at(bar(0.07, 0.95, 0.07, kit.mat('silver')), x, BELT_TOP + RAMP_RISE + 0.475, 0));
  bellFrame.add(at(bar(0.7, 0.07, 0.07, kit.mat('silver')), 0, bellTop, 0));
  const pivot = new THREE.Group();
  const profile = [[0.0, 0.34], [0.07, 0.32], [0.1, 0.24], [0.13, 0.12], [0.2, 0.0]].map(([r, y]) => new THREE.Vector2(r, y - 0.34));
  const bell = kit.outline(new THREE.Mesh(new THREE.LatheGeometry(profile, 24), kit.mat('silver', 0xc79a4a)));
  pivot.add(bell, at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), kit.mat('ink')), 0, -0.36, 0));
  bellFrame.add(at(pivot, 0, bellTop - 0.04, 0));
  kit.addPart(rig, parts, bellFrame, 'clinician bell', v(RAMP_X, 0, LANDING_Z), 1.9);

  anchors.push(anchorOn(proposer, v(0, 2.3, 0), 'proposer', 'left'));
  anchors.push(anchorOn(skeptic, v(0, 2.5, 0), 'skeptic', 'right'));
  anchors.push(anchorOn(harness, v(0, 1.52, 0), 'safety harness', 'right'));
  anchors.push(anchorOn(cardsGroup, v(-1.75, 1.0, 0), 'patient card', 'left'));
  anchors.push(anchorOn(ramp, v(0, BELT_TOP + RAMP_RISE - 0.05, EDGE_Z - RAMP_RUN), 'escalation ramp', 'right'));
  anchors.push(anchorOn(bellFrame, v(0, bellTop - 0.34, 0), 'clinician bell', 'right'));

  const rand = mulberry32(CARD_SEED);
  let [spawnCount, escalateSlot, speed, ribOffset, bellAge, paddleSwing] = [0, 0, SPEEDS.normal, 0, 99, 0];
  let [sinceSpawn, isStaticReady] = [SPAWN_GAP, false];
  const ringBell = () => { bellAge = 0; };
  function launch(x, scale) {
    const card = pool.find((c) => c.phase === 'idle');
    if (!card) return null;
    if (spawnCount % ESCALATE_BLOCK === 0) escalateSlot = Math.floor(rand() * ESCALATE_BLOCK);
    Object.assign(card, { phase: 'belt', x, r: 0, t: 0, scale, isEscalated: spawnCount % ESCALATE_BLOCK === escalateSlot });
    spawnCount += 1;
    card.node.visible = true;
    return card;
  }
  for (let x = BELT_X0 + 0.35; x < BELT_X1 - 0.3; x += SPAWN_GAP) launch(x, 1);

  function place(card) {
    const { node, phase } = card;
    let [y, z, tilt, scale] = [CARD_Y, 0, 0, 1];
    let x = card.x;
    if (phase === 'belt') {
      scale = clamp01((x - BELT_X0) / 0.3);
    } else if (phase === 'ramp' || phase === 'dwell') {
      const u = phase === 'ramp' ? card.r : 1;
      [x, z, y, tilt] = [RAMP_X, EDGE_Z - u * RAMP_RUN, CARD_Y + u * RAMP_RISE, RAMP_ANGLE];
      if (phase === 'dwell') {
        z -= 0.28 * clamp01(card.t / 0.4);
        [y, tilt, scale] = [y - 0.02 * clamp01(card.t / 0.4), RAMP_ANGLE * (1 - clamp01(card.t / 0.4)), 1 - clamp01((card.t - DWELL_S + 0.3) / 0.3)];
      }
    } else if (phase === 'drop') {
      const d = x - BELT_X1;
      [y, tilt, scale] = [CARD_Y - d * d * 2.2, d * 1.4, 1 - clamp01(d / 0.55)];
    }
    node.position.set(x, y, z);
    node.rotation.x = tilt;
    node.scale.setScalar(Math.max(scale, 0.001));
    card.flag.visible = card.isEscalated && (phase !== 'belt' || x > GATE_HARNESS_X + 0.25);
  }

  function step(dt) {
    sinceSpawn += speed * dt;
    if (sinceSpawn >= SPAWN_GAP && launch(BELT_X0, 0)) sinceSpawn = 0;
    for (const card of pool) {
      if (card.phase === 'belt') {
        card.x += speed * dt;
        if (card.isEscalated && card.x >= RAMP_X) Object.assign(card, { phase: 'ramp', x: RAMP_X, r: 0 });
        else if (card.x >= BELT_X1) card.phase = 'drop';
      } else if (card.phase === 'ramp') {
        card.r += (speed * RAMP_RATE * dt) / RAMP_RUN;
        if (card.r >= 1) {
          Object.assign(card, { phase: 'dwell', t: 0 });
          ringBell();
        }
      } else if (card.phase === 'dwell') {
        card.t += speed > 0.01 ? dt : 0;
        if (card.t >= DWELL_S) card.phase = 'gone';
      } else if (card.phase === 'drop') {
        card.x += speed * dt;
        if (card.x >= BELT_X1 + 0.55) card.phase = 'gone';
      }
      if (card.phase === 'gone') Object.assign(card, { phase: 'idle' });
      if (card.phase === 'idle') card.node.visible = false;
    }
  }

  function syncRibs() {
    const m = new THREE.Matrix4();
    const span = BELT_X1 - BELT_X0;
    for (let i = 0; i < RIB_COUNT; i++) {
      m.makeTranslation(BELT_X0 + ((i * span) / RIB_COUNT + ribOffset) % span, BELT_TOP + 0.004, 0);
      ribs.setMatrixAt(i, m);
    }
    ribs.instanceMatrix.needsUpdate = true;
  }

  const lampLit = new THREE.Color();
  const lampOff = new THREE.Color(LAMP_OFF);
  function syncLamps() {
    const gates = [GATE_PROPOSER_X, GATE_SKEPTIC_X, GATE_HARNESS_X];
    lampMats.forEach((lamp, i) => {
      let glow = 0;
      for (const c of pool) {
        if (c.phase !== 'belt') continue;
        const near = clamp01(1 - Math.abs(c.x - gates[i]) / LAMP_REACH);
        glow = Math.max(glow, i === 2 && !c.isEscalated ? near * 0.35 : near);
      }
      lamp.color.copy(lampOff).lerp(lampLit.copy(kit.sakura()), glow);
    });
  }

  function ensureStaticFrame() {
    if (isStaticReady) return;
    isStaticReady = true;
    const card = launch(BELT_X0, 1);
    if (card) Object.assign(card, { phase: 'ramp', x: RAMP_X, r: 0.55, isEscalated: true });
    bellAge = 0.25;
  }

  const explode = kit.exploder(parts);

  function update(dt, state) {
    const reduced = Boolean(state?.reducedMotion);
    const mode = state?.controls?.['care-speed'];
    const isPaused = state?.controls?.['care-pause'] === true || state?.controls?.['care-pause'] === 'true';
    const target = isPaused || reduced ? 0 : SPEEDS[mode] ?? SPEEDS.normal;
    speed += (target - speed) * (reduced ? 1 : 1 - Math.exp(-SPEED_SMOOTH * dt));
    if (speed < 1e-3) speed = 0;
    if (reduced) ensureStaticFrame();
    if (speed > 0) {
      step(dt);
      ribOffset = (ribOffset + speed * dt) % (BELT_X1 - BELT_X0);
    }
    bellAge = reduced ? bellAge : bellAge + dt;
    const swingTarget = pool.some((c) => c.isEscalated && c.phase === 'belt' && c.x > GATE_HARNESS_X + 0.2) ? 1 : 0;
    paddleSwing += (swingTarget - paddleSwing) * (1 - Math.exp(-10 * dt));
    paddle.rotation.y = -0.9 * paddleSwing;
    pivot.rotation.z = BELL_AMP * Math.exp(-BELL_DECAY * bellAge) * Math.sin(BELL_FREQ * bellAge);
    pool.forEach(place);
    syncRibs();
    syncLamps();
    explode(dt, state);
  }

  function onPick(part) {
    if (part?.userData?.label === 'clinician bell') ringBell();
    return part?.userData?.label ?? null;
  }

  function dispose() {
    ribs.dispose();
    disposeAll(group, kit.owned);
  }

  pool.forEach(place);
  syncRibs();
  group.userData.shadowRadius = SHADOW_RADIUS;
  return { group, parts, anchors, update, onPick, dispose };
}
