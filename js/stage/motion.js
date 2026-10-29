import * as THREE from 'three';

export const YAW_LIMIT = THREE.MathUtils.degToRad(35);
const DRAG_RADIANS_PER_PX = 0.006;
const TAP_SLOP_PX = 5;
const MAX_STEP = 1 / 120;

/** Critically damped scalar spring (no overshoot), smoothTime in seconds. */
export class CriticalSpring {
  constructor(value = 0, smoothTime = 0.45) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.omega = 2 / smoothTime;
  }

  step(dt) {
    const o = this.omega;
    const x = o * dt;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.value - this.target;
    const temp = (this.velocity + o * change) * dt;
    this.velocity = (this.velocity - o * temp) * decay;
    this.value = this.target + (change + temp) * decay;
    return this.value;
  }

  snap(value = this.target) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
}

/** Slightly underdamped spring used for explode / rebuild overshoot. */
export class BouncySpring {
  constructor(value = 0, stiffness = 95, damping = 11) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  step(dt) {
    let remaining = dt;
    while (remaining > 0) {
      const h = Math.min(remaining, MAX_STEP);
      const accel = this.stiffness * (this.target - this.value) - this.damping * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    return this.value;
  }

  get isSettled() {
    return Math.abs(this.target - this.value) < 0.0004 && Math.abs(this.velocity) < 0.0004;
  }

  snap(value = this.target) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
}

/**
 * Horizontal drag turns the model; a pointer that barely moves is a tap.
 * Vertical gestures are left to native scrolling (touch-action: pan-y).
 */
export function createDragTurn(canvas, { onTurn, onTap, onMove, onLeave }) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let isTurning = false;

  canvas.style.touchAction = 'pan-y';

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startY = e.clientY;
    isTurning = false;
  }

  function move(e) {
    if (pointerId === null) {
      onMove(e.clientX, e.clientY);
      return;
    }
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!isTurning && Math.abs(dx) > TAP_SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
      isTurning = true;
      canvas.setPointerCapture(pointerId);
    }
    if (isTurning) {
      onTurn((e.clientX - lastX) * DRAG_RADIANS_PER_PX);
      lastX = e.clientX;
    }
  }

  function up(e) {
    if (e.pointerId !== pointerId) return;
    const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (!isTurning && moved <= TAP_SLOP_PX) onTap(e.clientX, e.clientY);
    pointerId = null;
    isTurning = false;
  }

  function cancel() {
    pointerId = null;
    isTurning = false;
    onLeave();
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('pointerleave', onLeave);

  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('pointerleave', onLeave);
  };
}
