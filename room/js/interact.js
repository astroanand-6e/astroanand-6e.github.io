// Pointer and keyboard interaction: drag to look, hover and focus glow, tap or click to activate.
// Targets lift on a spring, their hairlines turn sakura and a halo pools under them.
import * as THREE from 'three';
import { BouncySpring, CriticalSpring } from '../../js/stage/motion.js';
import { SAKURA, SAKURA_NIGHT } from './config.js';
import { lerp } from './ease.js';

const TAP_SLOP_PX = 6;
const DRAG_YAW_PER_PX = 0.0028;
const DRAG_PITCH_PER_PX = 0.0016;
const GLOW_SMOOTH_S = 0.1;
const LIFT_STIFFNESS = 170;
const LIFT_DAMPING = 14;
const SAKURA_DAY = new THREE.Color(SAKURA);
const SAKURA_DARK = new THREE.Color(SAKURA_NIGHT);

export function createInteraction({ canvas, camera, rig, world, actions, getTheme, isLocked, onInput }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, inside: false, down: false, dragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0, id: null };
  const proxies = world.targets.flatMap((t) => t.proxies);
  const proxyOwner = new Map(world.targets.flatMap((t) => t.proxies.map((p) => [p, t.id])));
  const states = new Map(world.targets.map((t) => [t.id, {
    target: t,
    glow: new CriticalSpring(0, GLOW_SMOOTH_S),
    lift: new BouncySpring(0, LIFT_STIFFNESS, LIFT_DAMPING),
  }]));
  let hoverId = null;
  let focusId = null;

  function pick() {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((pointer.x - rect.left) / rect.width) * 2 - 1, -((pointer.y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects([...proxies, ...world.occluders], false);
    return hits.length ? proxyOwner.get(hits[0].object) || null : null;
  }

  function activate(id) {
    const action = actions[id];
    if (!action || isLocked()) return false;
    action();
    return true;
  }

  function isLinkedActive(state) {
    const link = state.target.link;
    if (!link) return false;
    return [hoverId, focusId].some((id) => id && states.get(id) && states.get(id).target.link === link);
  }

  function updateTargets(dt, reducedMotion) {
    const locked = isLocked();
    const line = world.mats.line;
    const sakura = getTheme() === 'ink' ? SAKURA_DARK : SAKURA_DAY;
    states.forEach((state, id) => {
      const wanted = !locked && (id === hoverId || id === focusId || isLinkedActive(state)) ? 1 : 0;
      state.glow.target = wanted;
      state.lift.target = wanted;
      const { target } = state;
      if (reducedMotion) {
        state.glow.snap(wanted);
        state.lift.snap(wanted);
      } else {
        state.glow.step(dt);
        state.lift.step(dt);
      }
      const glow = state.glow.value;
      target.holder.position[target.axis] = target.base + target.lift * state.lift.value;
      target.lines.color.copy(line.color).lerp(sakura, glow);
      target.lines.opacity = lerp(line.opacity, 1, glow);
      world.setHalo(id, glow, sakura);
    });
  }

  function updateHover() {
    if (!pointer.inside || pointer.dragging || isLocked()) {
      hoverId = null;
    } else {
      hoverId = pick();
    }
    canvas.classList.toggle('is-hot', hoverId !== null);
    canvas.classList.toggle('is-grabbing', pointer.dragging);
    canvas.classList.toggle('is-locked', isLocked());
  }

  function update(dt, reducedMotion) {
    updateHover();
    updateTargets(dt, reducedMotion);
  }

  function onDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    onInput();
    pointer.down = true;
    pointer.dragging = false;
    pointer.id = event.pointerId;
    pointer.startX = event.clientX;
    pointer.startY = event.clientY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.inside = true;
  }

  function onMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.inside = true;
    rig.drift((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
    if (!pointer.down || event.pointerId !== pointer.id || isLocked()) return;
    const moved = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    if (!pointer.dragging && moved > TAP_SLOP_PX) {
      pointer.dragging = true;
      canvas.setPointerCapture(event.pointerId);
    }
    if (pointer.dragging) {
      rig.look(-(event.clientX - pointer.lastX) * DRAG_YAW_PER_PX, (event.clientY - pointer.lastY) * DRAG_PITCH_PER_PX);
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
    }
  }

  function onUp(event) {
    if (event.pointerId !== pointer.id) return;
    const wasDragging = pointer.dragging;
    pointer.down = false;
    pointer.dragging = false;
    pointer.id = null;
    if (wasDragging) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const id = isLocked() ? null : pick();
    if (id) activate(id);
  }

  function onLeave(event) {
    if (event.pointerType === 'touch') pointer.inside = false;
    else if (!pointer.down) pointer.inside = false;
    if (!pointer.inside) rig.drift(0, 0);
  }

  function onCancel() {
    pointer.down = false;
    pointer.dragging = false;
    pointer.inside = false;
    pointer.id = null;
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave);

  function dispose() {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('pointerleave', onLeave);
  }

  return {
    update,
    activate,
    dispose,
    setFocus: (id) => { focusId = id; },
    clearFocus: (id) => { if (focusId === id) focusId = null; },
    hovered: () => hoverId,
  };
}
