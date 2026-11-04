// An office chair, pulled out and turned away from the desk as if someone just got up.
import { PALETTE } from '../config.js';

const PLACE = Object.freeze({ x: -9.2, z: -3.6, yaw: -0.5 });
const ARMS = 5;
const SEAT_Y = 4.25;

function bakeBase(baker) {
  const ink = { color: PALETTE.ink };
  for (let i = 0; i < ARMS; i += 1) {
    const a = (i / ARMS) * Math.PI * 2;
    baker.push([0, 0, 0], a);
    baker.rbox(0.55, 0.32, 3.0, 0.1, { ...ink, pos: [0, 0.5, 1.6] });
    baker.cyl(0.4, 0.4, 0.42, { color: PALETTE.chairDark, pos: [0, 0, 3.0] });
    baker.pop();
  }
  baker.cyl(0.62, 0.5, 0.55, { ...ink, pos: [0, 0.55, 0] });
  baker.cyl(0.3, 0.3, SEAT_Y - 1.0, { color: PALETTE.steel, pos: [0, 1.05, 0] });
}

function bakeSeat(baker) {
  const fabric = { color: PALETTE.chair };
  baker.cyl(1.25, 1.25, 0.28, { color: PALETTE.ink, pos: [0, SEAT_Y - 0.1, 0] });
  baker.rbox(5.4, 1.0, 5.2, 0.42, { ...fabric, pos: [0, SEAT_Y + 0.15, 0] });
  baker.rbox(0.55, 2.4, 0.5, 0.1, { color: PALETTE.ink, pos: [0, SEAT_Y + 0.8, 2.35] });
  baker.rbox(4.8, 6.6, 0.85, 0.36, { ...fabric, pos: [0, SEAT_Y + 1.7, 2.7], rot: [0.13, 0, 0] });
  baker.rbox(3.2, 1.1, 0.5, 0.2, { color: PALETTE.chairDark, pos: [0, SEAT_Y + 6.6, 3.05], rot: [0.13, 0, 0] });
  [-1, 1].forEach((s) => {
    baker.rbox(0.32, 2.2, 0.32, 0.08, { color: PALETTE.ink, pos: [s * 2.85, SEAT_Y + 0.95, 0.4] });
    baker.rbox(0.7, 0.32, 3.2, 0.14, { color: PALETTE.chairDark, pos: [s * 2.85, SEAT_Y + 3.1, 0.7] });
  });
}

export function bakeChair(baker, shadows) {
  baker.push([PLACE.x, 0, PLACE.z], PLACE.yaw);
  bakeBase(baker);
  bakeSeat(baker);
  baker.pop();
  shadows.add({ x: PLACE.x, z: PLACE.z + 0.4, w: 6.6, d: 6.6, strength: 1.1, yaw: PLACE.yaw });
}
