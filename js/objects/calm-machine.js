// CALM as a machine: vinyl, glass pipe, two frozen padlocked towers, brass gearbox, split-flap genre board.
// Units: 1 = 10 cm, laid out left to right. No logos or printed marks.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GENRES = ['ROCK', 'HIP-HOP', 'ELECTRONIC', 'FOLK', 'JAZZ', 'POP', 'BLUES', 'CLASSICAL'];
const ALPHABET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ-';
const [CELLS, FLIP_S, FLIP_STAGGER, HOLD_S, FLIP_STEPS] = [10, 0.55, 0.06, 3.4, 8];
const [BOARD_W, BOARD_H, REPAINT_S] = [680, 220, 1 / 30];
const [AUDIO_H, TEXT_H, TOWER_Z_AUDIO, TOWER_Z_TEXT, AUDIO_X, TEXT_X] = [1.3, 2.08, 0.35, -0.35, -1.15, -0.2];
const [TURNTABLE_X, TURNTABLE_SCALE, GEARBOX_X, GEARBOX_Z, BOARD_X, PIPE_Y] = [-2.45, 1.15, 0.9, 0, 2.35, 0.4];
const [SPIN_RATE, SPIN_BOOST_DECAY, GEAR_RATE, FLOW_SPEED] = [2.2, 2, 1.1, 0.55];
const [TILT_RANGE, WOBBLE, TILT_SMOOTH] = [0.32, 0.05, 8];
const [RIG_Z, EXPLODE_RATE, SHADOW_RADIUS] = [0.43, 7, 4.8];
const GEARS = [{ teeth: 10, radius: 0.17 }, { teeth: 14, radius: 0.238 }, { teeth: 8, radius: 0.136 }];
const BRASS = 0xc79a4a;
const lane = (x0, x1, z, count) => ({ from: [x0, PIPE_Y, z], to: [x1, PIPE_Y, z], count });
const [AUDIO_L, AUDIO_R, TEXT_R, GEARBOX_L, GEARBOX_R, STAND_L] = [AUDIO_X - 0.3, AUDIO_X + 0.3, TEXT_X + 0.3, GEARBOX_X - 0.55, GEARBOX_X + 0.55, BOARD_X - 0.275];
const LANES = [
  lane(TURNTABLE_X + 0.5, AUDIO_L, TOWER_Z_AUDIO, 3),
  lane(AUDIO_R, GEARBOX_L, TOWER_Z_AUDIO, 4),
  lane(TEXT_R, GEARBOX_L, TOWER_Z_TEXT, 2),
  lane(GEARBOX_R, STAND_L, GEARBOX_Z, 2),
];
const FROST = { shell: { paper: 0xdcecf3, ink: 0x56788a }, core: { paper: 0xa9c8da, ink: 0x2f4a58 } };
const FALLBACK = { dark: 0x2b2825, white: 0xfbfaf5, silver: 0xc7cacc, paper: 0xf4efe6, sakura: 0xd47589, glass: 0xbcd4da };
const ROLE_ALIAS = { ink: 'dark' };
const FONT = 'ui-monospace, Menlo, Consolas, monospace';

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
  const themed = [];
  const mats = ctx && ctx.materials;
  const mark = typeof ctx?.parts?.mark === 'function' ? ctx.parts.mark : null;
  let theme = ctx?.theme ?? mats?.theme ?? 'paper';
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
  // Owned clone that follows the page theme (shared roles recolor themselves).
  const tinted = (role, byTheme) => {
    const m = mat(role, byTheme[theme] ?? byTheme.paper);
    themed.push([m, byTheme]);
    return m;
  };
  const applyTheme = (name) => {
    if (!name || name === theme) return;
    theme = name;
    for (const [m, byTheme] of themed) m.color.setHex(byTheme[name] ?? byTheme.paper);
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
  return { owned, mat, tinted, applyTheme, basic, outline, addPart, exploder, sakura };
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

function makeScreen(width, height) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { g: canvas.getContext('2d'), texture };
}

function gearGeometry(teeth, radius) {
  const [root, tip, pitch] = [radius - 0.03, radius + 0.025, (Math.PI * 2) / teeth];
  const shape = new THREE.Shape();
  for (let k = 0; k < teeth; k++) {
    for (const [r, da] of [[root, -0.3], [tip, -0.16], [tip, 0.16], [root, 0.3], [root, 0.5]]) {
      const a = (k + da) * pitch;
      if (k === 0 && da === -0.3) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  shape.closePath();
  shape.holes.push(new THREE.Path().absarc(0, 0, 0.04, 0, Math.PI * 2, true));
  return new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false }).rotateX(-Math.PI / 2);
}

function paintCell(g, x, y, w, h, letter, scaleY) {
  g.fillStyle = '#1b1917';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#26231f';
  g.fillRect(x, y, w, h / 2 - 1);
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.scale(1, Math.max(scaleY, 0.05));
  Object.assign(g, { fillStyle: '#efe8d8', font: `700 ${Math.round(h * 0.72)}px ${FONT}`, textAlign: 'center', textBaseline: 'middle' });
  g.fillText(letter, 0, 4);
  g.restore();
  g.fillStyle = '#0b0a09';
  g.fillRect(x, y + h / 2 - 1.5, w, 3);
}

function paintBoard(g, cells, now) {
  g.fillStyle = '#12100e';
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  Object.assign(g, { fillStyle: '#8d8a82', font: `600 22px ${FONT}`, textAlign: 'left', textBaseline: 'alphabetic' });
  g.fillText('GENRE', 24, 38);
  const [w, gap, top, h] = [58, 6, 56, 140];
  cells.forEach((cell, i) => {
    const x = 23 + i * (w + gap);
    const t = now - cell.flipAt;
    if (t < 0 || t >= FLIP_S) {
      if (t >= FLIP_S) cell.shown = cell.target;
      paintCell(g, x, top, w, h, cell.shown, 1);
      return;
    }
    const frac = t / FLIP_S;
    const step = Math.floor(frac * FLIP_STEPS);
    const letter = ALPHABET[(ALPHABET.indexOf(cell.shown) + 1 + step * 5) % ALPHABET.length];
    paintCell(g, x, top, w, h, letter, 0.35 + 0.65 * Math.abs(Math.cos(frac * FLIP_STEPS * Math.PI)));
  });
}

function paintGauge(g, w, h) {
  const [cx, cy, r] = [w / 2, h * 0.9, h * 0.7];
  g.fillStyle = '#f0eadc';
  g.fillRect(0, 0, w, h);
  g.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 1.15 + (i / 10) * Math.PI * 0.7;
    const inner = r - (i === 5 ? 16 : 9);
    g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
  }
  Object.assign(g, { strokeStyle: '#1c1a17', lineWidth: 3, font: `700 20px ${FONT}`, textBaseline: 'alphabetic' });
  g.stroke();
  Object.assign(g, { textAlign: 'left', fillStyle: '#c4566f' });
  g.fillText('AUDIO', 10, 26);
  Object.assign(g, { textAlign: 'right', fillStyle: '#1c1a17' });
  g.fillText('TEXT', w - 10, 26);
}

export function create(ctx) {
  const kit = makeKit(ctx);
  const group = new THREE.Group();
  group.name = 'calm-machine';
  const rig = new THREE.Group();
  rig.position.z = RIG_Z;
  group.add(rig);
  const parts = [];
  const anchors = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const rbox = (w, h, d, r, material) => kit.outline(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), material));
  const cyl = (r, h, material, seg = 28) => kit.outline(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material));
  const bar = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  const at = (obj, x, y, z) => {
    obj.position.set(x, y, z);
    return obj;
  };

  const turntable = new THREE.Group();
  turntable.add(at(rbox(0.95, 0.14, 0.85, 0.03, kit.mat('white')), 0, 0.07, 0), at(cyl(0.07, 0.1, kit.mat('silver'), 16), 0.34, 0.19, -0.3));
  const arm = rbox(0.03, 0.03, 0.34, 0.005, kit.mat('silver'));
  arm.rotation.y = Math.atan2(-0.2, 0.27);
  turntable.add(at(arm, 0.235, 0.24, -0.165), at(rbox(0.07, 0.025, 0.06, 0.005, kit.mat('ink')), 0.14, 0.23, -0.03));
  turntable.scale.setScalar(TURNTABLE_SCALE);
  kit.addPart(rig, parts, turntable, 'turntable', v(TURNTABLE_X, 0, TOWER_Z_AUDIO), 0);

  const vinyl = new THREE.Group();
  const spinner = new THREE.Group();
  const sheenGeo = new THREE.RingGeometry(0.14, 0.34, 20, 1, 0, 0.9).rotateX(-Math.PI / 2);
  spinner.add(cyl(0.39, 0.04, kit.mat('silver'), 40), at(cyl(0.36, 0.014, kit.mat('ink'), 40), 0, 0.027, 0));
  spinner.add(at(cyl(0.12, 0.016, kit.mat('sakura'), 24), 0, 0.034, 0), at(cyl(0.025, 0.07, kit.mat('silver'), 10), 0, 0.05, 0));
  spinner.add(at(new THREE.Mesh(sheenGeo, kit.mat('silver')), 0, 0.036, 0));
  vinyl.add(at(spinner, 0, 0.02, 0));
  vinyl.scale.setScalar(TURNTABLE_SCALE);
  kit.addPart(rig, parts, vinyl, 'vinyl', v(TURNTABLE_X, 0.14 * TURNTABLE_SCALE, TOWER_Z_AUDIO), 1.3);

  const pipes = new THREE.Group();
  const addPipe = (from, to, r) => {
    const len = to[0] - from[0];
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20).rotateZ(Math.PI / 2), kit.mat('glass'));
    pipes.add(at(body, from[0] + len / 2, from[1], from[2]));
    for (const x of [from[0], to[0]]) pipes.add(at(cyl(r * 1.35, 0.05, kit.mat('silver'), 20).rotateZ(Math.PI / 2), x, from[1], from[2]));
  };
  LANES.forEach(({ from, to }, i) => addPipe(from, to, i === 0 ? 0.13 : 0.1));
  pipes.add(at(cyl(0.04, PIPE_Y - 0.14, kit.mat('silver'), 10), TURNTABLE_X + 0.75, (PIPE_Y + 0.14) / 2, TOWER_Z_AUDIO));
  const particleCount = LANES.reduce((n, lane) => n + lane.count, 0);
  const coreMat = kit.basic({ color: FALLBACK.sakura });
  const haloMat = kit.basic({ color: FALLBACK.sakura, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
  const cores = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), coreMat, particleCount);
  const halos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 10, 8), haloMat, particleCount);
  [cores, halos].forEach((m) => { m.frustumCulled = false; pipes.add(m); });
  kit.addPart(rig, parts, pipes, 'glass pipe', v(0, 0, 0), 0.5);

  const padlock = (y) => {
    const lock = new THREE.Group();
    const shackle = kit.outline(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 18, Math.PI), kit.mat('silver')));
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12).rotateX(Math.PI / 2), kit.mat('sakura'));
    lock.add(at(rbox(0.26, 0.22, 0.1, 0.03, kit.mat('ink')), 0, 0, 0), at(shackle, 0, 0.11, 0), at(hole, 0, -0.01, 0.056));
    return at(lock, 0, y, 0.36);
  };
  const buildTower = (height, label, x, z) => {
    const tower = new THREE.Group();
    const shell = kit.outline(new THREE.Mesh(new THREE.BoxGeometry(0.6, height, 0.6), kit.tinted('glass', FROST.shell)));
    shell.material.opacity = 0.62;
    tower.add(at(rbox(0.72, 0.08, 0.72, 0.02, kit.mat('ink')), 0, 0.04, 0), at(new THREE.Mesh(new THREE.BoxGeometry(0.46, height, 0.46), kit.tinted('white', FROST.core)), 0, 0.08 + height / 2, 0));
    tower.add(at(shell, 0, 0.08 + height / 2, 0), at(rbox(0.66, 0.06, 0.66, 0.015, kit.mat('ink')), 0, 0.11 + height, 0));
    for (const f of [0.25, 0.5, 0.75]) tower.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.62), kit.mat('silver')), 0, 0.08 + height * f, 0));
    const icicles = [0, 1, 2, 3, 4, 5].map((i) => new THREE.ConeGeometry(0.03, 0.1 + (i % 3) * 0.05, 6).rotateX(Math.PI).translate(-0.25 + i * 0.1, 0.08 + height - (0.05 + (i % 3) * 0.025), 0.31));
    tower.add(new THREE.Mesh(mergeGeometries(icicles), kit.tinted('white', FROST.shell)), padlock(0.08 + height * 0.62));
    icicles.forEach((g) => g.dispose());
    return kit.addPart(rig, parts, tower, label, v(x, 0, z), 0.5);
  };
  const audioTower = buildTower(AUDIO_H, '305m audio', AUDIO_X, TOWER_Z_AUDIO);
  const textTower = buildTower(TEXT_H, '4.6b text', TEXT_X, TOWER_Z_TEXT);

  const gearbox = new THREE.Group();
  gearbox.add(at(rbox(1.1, 0.6, 1.2, 0.04, kit.mat('silver', BRASS)), 0, 0, 0), at(rbox(1.02, 0.03, 0.03, 0.01, kit.mat('sakura')), 0, 0.26, 0.61));
  const slatGeos = [0, 1, 2, 3].map((i) => new THREE.BoxGeometry(0.02, 0.3, 0.06).translate(0.56, 0, -0.3 + i * 0.2));
  gearbox.add(new THREE.Mesh(mergeGeometries(slatGeos), kit.mat('ink')));
  slatGeos.forEach((g) => g.dispose());
  kit.addPart(rig, parts, gearbox, '~4m trainable', v(GEARBOX_X, 0.4, GEARBOX_Z), 0.5);

  const gearTrain = new THREE.Group();
  const gearMat = kit.mat('silver', 0xdcb35e);
  const gearMeshes = [];
  let gx = -0.42;
  GEARS.forEach(({ teeth, radius }, i) => {
    gx += i === 0 ? 0 : GEARS[i - 1].radius + radius;
    const mesh = kit.outline(new THREE.Mesh(gearGeometry(teeth, radius), gearMat));
    gearTrain.add(at(mesh, gx, 0, 0), at(cyl(0.03, 0.14, kit.mat('silver'), 10), gx, 0.06, 0));
    gearMeshes.push(mesh);
  });
  kit.addPart(rig, parts, gearTrain, '~4m trainable', v(GEARBOX_X, 0.7, GEARBOX_Z), 1.7);

  const { g: gGauge, texture: gaugeTex } = makeScreen(260, 130);
  if (gGauge) paintGauge(gGauge, 260, 130);
  const gauge = new THREE.Group();
  const needlePivot = new THREE.Group();
  needlePivot.add(at(bar(0.02, 0.17, 0.012, kit.mat('sakura')), 0, 0.085, 0), cyl(0.025, 0.02, kit.mat('ink'), 12).rotateX(Math.PI / 2));
  gauge.add(rbox(0.6, 0.34, 0.04, 0.02, kit.mat('ink')), at(new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.26), kit.basic({ map: gaugeTex })), 0, 0, 0.022));
  gauge.add(at(needlePivot, 0, -0.106, 0.034));
  kit.addPart(rig, parts, gauge, 'audio ⇄ text', v(GEARBOX_X, 0.42, GEARBOX_Z + 0.62), v(0, 2.0, 0.5));

  const stand = rbox(0.55, 0.5, 0.5, 0.03, kit.mat('white'));
  stand.add(at(cyl(0.08, 0.5, kit.mat('silver'), 16), 0, 0.5, 0));
  kit.addPart(rig, parts, stand, 'board stand', v(BOARD_X, 0.25, GEARBOX_Z), 0);
  const { g: gBoard, texture: boardTex } = makeScreen(BOARD_W, BOARD_H);
  const board = new THREE.Group();
  board.add(rbox(1.2, 0.56, 0.12, 0.04, kit.mat('ink')), at(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1 * (BOARD_H / BOARD_W)), kit.basic({ map: boardTex })), 0, 0, 0.062));
  board.rotation.y = 0.45;
  kit.addPart(rig, parts, board, 'genre board', v(BOARD_X, 1.28, GEARBOX_Z), 1.3);

  const cells = Array.from({ length: CELLS }, () => ({ shown: ' ', target: ' ', flipAt: -Infinity }));
  let [genreIndex, clock, spinBoost, tilt, sinceRepaint, nextFlipAt] = [0, 0, 0, 0, 0, HOLD_S];
  let [flipEndAt, isBoardDirty, isReduced] = [0, true, false];
  const setGenre = (index, now, isInstant) => {
    genreIndex = index % GENRES.length;
    flipEndAt = isInstant ? now : now + FLIP_S + (CELLS - 1) * FLIP_STAGGER;
    nextFlipAt = flipEndAt + HOLD_S;
    isBoardDirty = true;
    const word = GENRES[genreIndex].padEnd(CELLS, ' ');
    cells.forEach((cell, i) => {
      cell.target = word[i];
      cell.flipAt = isInstant ? -Infinity : now + i * FLIP_STAGGER;
      if (isInstant) cell.shown = word[i];
    });
  };
  const repaintBoard = () => {
    if (gBoard) paintBoard(gBoard, cells, clock);
    boardTex.needsUpdate = true;
    [sinceRepaint, isBoardDirty] = [0, false];
  };
  setGenre(0, 0, true);
  repaintBoard();

  anchors.push(anchorOn(vinyl, v(0.25, 0.1, 0.1), 'vinyl', 'left'));
  anchors.push(anchorOn(pipes, v(TURNTABLE_X + 0.65, PIPE_Y + 0.12, TOWER_Z_AUDIO), 'glass pipe', 'left'));
  anchors.push(anchorOn(audioTower, v(-0.3, AUDIO_H * 0.62 + 0.08, 0.3), '305m audio', 'left'));
  anchors.push(anchorOn(textTower, v(0.3, TEXT_H * 0.62 + 0.08, 0.3), '4.6b text', 'right'));
  anchors.push(anchorOn(gearbox, v(0.4, 0.3, 0.6), '~4m trainable', 'right'));
  anchors.push(anchorOn(board, v(0.3, 0.2, 0.07), 'genre board', 'right'));
  anchors.push(anchorOn(gauge, v(0.22, 0.12, 0.04), 'audio ⇄ text', 'right'));

  const matrix = new THREE.Matrix4();
  const flow = (time) => {
    let slot = 0;
    for (const { from, to, count } of LANES) {
      const len = Math.hypot(to[0] - from[0], to[2] - from[2]);
      for (let i = 0; i < count; i++, slot++) {
        const u = (i / count + (time * FLOW_SPEED) / len) % 1;
        const bob = Math.sin(time * 5 + slot) * 0.012;
        matrix.makeTranslation(from[0] + (to[0] - from[0]) * u, from[1] + bob, from[2] + (to[2] - from[2]) * u);
        cores.setMatrixAt(slot, matrix);
        halos.setMatrixAt(slot, matrix);
      }
    }
    cores.instanceMatrix.needsUpdate = true;
    halos.instanceMatrix.needsUpdate = true;
  };
  flow(0);

  const explode = kit.exploder(parts);
  const gearPose = (angle) => {
    const [a, b, c] = GEARS;
    gearMeshes[0].rotation.y = angle;
    gearMeshes[1].rotation.y = Math.PI / b.teeth - (angle * a.teeth) / b.teeth;
    gearMeshes[2].rotation.y = (angle * a.teeth) / c.teeth;
  };
  gearPose(0);

  function update(dt, state) {
    kit.applyTheme(state?.theme);
    const reduced = Boolean(state?.reducedMotion);
    isReduced = reduced;
    const fader = state?.controls?.['calm-fader'];
    const target = (0.5 - Math.min(1, Math.max(0, typeof fader === 'number' ? fader : 0.5))) * 2 * TILT_RANGE;
    spinBoost *= Math.exp(-SPIN_BOOST_DECAY * dt);
    if (!reduced) [clock, spinner.rotation.y] = [clock + dt, spinner.rotation.y - (SPIN_RATE + spinBoost) * dt];
    gearPose(reduced ? 0 : clock * GEAR_RATE);
    tilt = reduced ? target : tilt + (target - tilt) * (1 - Math.exp(-TILT_SMOOTH * dt));
    needlePivot.rotation.z = tilt + (reduced ? 0 : WOBBLE * (Math.sin(clock * 1.3) + 0.5 * Math.sin(clock * 2.9 + 1)));
    if (!reduced) {
      flow(clock);
      if (clock >= nextFlipAt) setGenre(genreIndex + 1, clock, false);
    }
    for (const m of [coreMat, haloMat]) m.color.copy(kit.sakura());
    sinceRepaint += dt;
    const isFlipping = clock <= flipEndAt + REPAINT_S;
    if (reduced ? isBoardDirty : (isFlipping || isBoardDirty) && sinceRepaint >= REPAINT_S) repaintBoard();
    explode(dt, state);
  }

  function onPick(part) {
    const label = part?.userData?.label ?? null;
    if (label === 'vinyl') spinBoost += 6;
    if (label === 'genre board') setGenre(genreIndex + 1, clock, isReduced);
    return label;
  }

  function dispose() {
    gaugeTex.dispose();
    boardTex.dispose();
    disposeAll(group, kit.owned);
  }

  group.userData.shadowRadius = SHADOW_RADIUS;
  return { group, parts, anchors, update, onPick, dispose };
}
