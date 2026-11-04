// The light switch beside the door: a plate, a rocker that flips, and a small sakura pilot light.
import * as THREE from 'three';
import { ROOM, SWITCH, PALETTE, SAKURA } from '../config.js';
import { createBaker, meshFromBake } from '../geo.js';
import { BouncySpring } from '../../../js/stage/motion.js';

const PLATE = Object.freeze({ t: 0.26, h: 3.9, w: 2.5 });
const ROCKER = Object.freeze({ t: 0.28, h: 2.5, w: 1.35 });
const FLIP = 0.2;
const PICK = Object.freeze({ x: 1.4, h: 6.0, w: 4.6 });
const PILOT_R = 0.17;
const PILOT_PULSE_HZ = 1.1;

export function createSwitch({ mats }) {
  const holder = new THREE.Group();
  holder.name = 'light-switch';
  holder.position.set(ROOM.x0, SWITCH.y, SWITCH.z);

  const plateBaker = createBaker();
  plateBaker.rbox(PLATE.t, PLATE.h, PLATE.w, 0.12, { color: PALETTE.trim, pos: [PLATE.t / 2, -PLATE.h / 2, 0] });
  holder.add(meshFromBake(plateBaker.build(), mats.furniture, mats.line));

  const rockerBaker = createBaker();
  rockerBaker.rbox(ROCKER.t, ROCKER.h, ROCKER.w, 0.12, { color: 0xe4dccb, pos: [0, -ROCKER.h / 2, 0] });
  const rocker = new THREE.Group();
  rocker.position.set(PLATE.t + ROCKER.t / 2 - 0.04, 0, 0);
  rocker.add(meshFromBake(rockerBaker.build(), mats.furniture, mats.line));
  holder.add(rocker);

  const pilotMaterial = new THREE.MeshBasicMaterial({ color: SAKURA, toneMapped: false });
  const pilot = new THREE.Mesh(new THREE.CylinderGeometry(PILOT_R, PILOT_R, 0.1, 14).rotateZ(Math.PI / 2), pilotMaterial);
  pilot.position.set(PLATE.t + 0.02, PLATE.h / 2 - 0.35, 0);
  pilot.raycast = () => {};
  holder.add(pilot);

  const proxy = new THREE.Mesh(new THREE.BoxGeometry(PICK.x, PICK.h, PICK.w), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.set(PICK.x / 2 - 0.1, -0.2, 0);
  proxy.visible = false;
  proxy.userData.target = 'switch';
  holder.add(proxy);

  const flip = new BouncySpring(1, 170, 14);
  const dim = new THREE.Color(0xd9a0ae);
  const lit = new THREE.Color(SAKURA);
  let clock = 0;

  return {
    group: holder,
    proxy,
    baseX: holder.position.x,
    /** lightsOn true: rocker tips up. */
    setLightsOn(isOn, { immediate = false } = {}) {
      flip.target = isOn ? 1 : -1;
      if (immediate) flip.snap(flip.target);
    },
    update(dt, night, reducedMotion) {
      clock += dt;
      flip.step(dt);
      rocker.rotation.z = flip.value * FLIP;
      const pulse = reducedMotion ? 0.7 : 0.55 + 0.45 * Math.sin(clock * PILOT_PULSE_HZ * Math.PI * 2);
      pilotMaterial.color.copy(dim).lerp(lit, Math.min(1, pulse * (0.45 + 0.55 * night)));
    },
    dispose() {
      holder.traverse((n) => n.geometry && n.geometry.dispose());
      pilotMaterial.dispose();
      proxy.material.dispose();
    },
  };
}
