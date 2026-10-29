import * as THREE from 'three';
import { CriticalSpring } from './motion.js';

const AZIMUTH = Math.PI / 4;
const ELEVATION = Math.atan2(0.85, Math.SQRT2);
const CAMERA_DISTANCE = 60;
const SMOOTH_SECONDS = 0.6;
const PPU_MIN = 4;
const PPU_MAX = 400;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const FIT_PADDING = 1.04;

/**
 * Orthographic isometric camera that frames a volume inside a screen rect.
 * A volume is { center, radius } (bounding sphere) plus optional world-space
 * `corners` of its bounding box: with corners the fit uses the box's true
 * screen extents (a flat desk is much wider than tall, so a sphere would waste
 * most of the slot); without them it falls back to the sphere. Six critically
 * damped springs (focus xyz, log pixels-per-unit and the rect center offset)
 * are smoothed independently and the look-at is re-derived from them every
 * frame, so the volume stays centered in the rect while the camera glides
 * between stations and between layout slots.
 */
export function createCameraRig({ reducedMotion = false } = {}) {
  const spring = () => new CriticalSpring(0, SMOOTH_SECONDS);
  const s = { x: spring(), y: spring(), z: spring(), ppu: spring(), dx: spring(), dy: spring() };
  const all = Object.values(s);
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const look = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const extent = { center: new THREE.Vector3(), halfW: 1, halfH: 1 };
  let isReduced = reducedMotion;
  let hasTarget = false;
  let ppu = 1;

  function orient(parallax) {
    const az = AZIMUTH + parallax.yaw;
    const el = ELEVATION + parallax.pitch;
    dir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    right.crossVectors(WORLD_UP, dir).normalize();
    up.crossVectors(dir, right);
  }

  /** Screen-aligned center and half extents (world units) of a volume. */
  function measure(volume) {
    if (!volume.corners) {
      extent.center.copy(volume.center);
      extent.halfW = volume.radius;
      extent.halfH = volume.radius;
      return extent;
    }
    let minR = Infinity;
    let maxR = -Infinity;
    let minU = Infinity;
    let maxU = -Infinity;
    volume.corners.forEach((c) => {
      const r = c.dot(right);
      const u = c.dot(up);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
    });
    extent.center
      .copy(volume.center)
      .addScaledVector(right, (minR + maxR) / 2 - volume.center.dot(right))
      .addScaledVector(up, (minU + maxU) / 2 - volume.center.dot(up));
    extent.halfW = (maxR - minR) / 2;
    extent.halfH = (maxU - minU) / 2;
    return extent;
  }
  orient({ yaw: 0, pitch: 0 });

  function snap() {
    all.forEach((sp) => sp.snap(sp.target));
  }

  return {
    /** Aim at a world-space volume that should fill fit {cx, cy, width, height} (canvas px). */
    setTarget(volume, fit, size) {
      const e = measure(volume);
      s.x.target = e.center.x;
      s.y.target = e.center.y;
      s.z.target = e.center.z;
      const wanted = Math.min(fit.width / (2 * e.halfW), fit.height / (2 * e.halfH)) / FIT_PADDING;
      s.ppu.target = Math.log(THREE.MathUtils.clamp(wanted, PPU_MIN, PPU_MAX));
      s.dx.target = fit.cx - size.width / 2;
      s.dy.target = fit.cy - size.height / 2;
      if (!hasTarget || isReduced) snap();
      hasTarget = true;
    },
    snap,
    setReducedMotion(value) {
      isReduced = value;
      if (value) snap();
    },
    /** Steps the springs and writes the camera. parallax = { yaw, pitch } radians. */
    update(dt, camera, size, parallax) {
      all.forEach((sp) => sp.step(dt));
      ppu = Math.exp(s.ppu.value);
      orient(parallax);
      look.set(s.x.value, s.y.value, s.z.value);
      look.addScaledVector(right, -s.dx.value / ppu).addScaledVector(up, s.dy.value / ppu);

      camera.left = -size.width / (2 * ppu);
      camera.right = size.width / (2 * ppu);
      camera.top = size.height / (2 * ppu);
      camera.bottom = -size.height / (2 * ppu);
      camera.zoom = 1;
      camera.position.copy(look).addScaledVector(dir, CAMERA_DISTANCE);
      basis.makeBasis(right, up, dir);
      camera.quaternion.setFromRotationMatrix(basis);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    },
    /** Smoothed focus point (world) the camera is currently centered on. */
    focus: (out) => out.set(s.x.value, s.y.value, s.z.value),
    pixelsPerUnit: () => ppu,
    /** Half extents (world units) of the volume last passed to setTarget. */
    extent: () => extent,
  };
}
