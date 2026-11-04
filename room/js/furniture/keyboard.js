// A mechanical keyboard slid under the riser's lip (white and light-blue keycaps, a few green accents) and a white mouse.
import { DESK } from '../config.js';

const KB = Object.freeze({ x: -1, z: -8.55, w: 4.5, d: 1.4, caseH: 0.2, keyH: 0.17 });
const PITCH = 0.29;
const ROW_PITCH = 0.265;
const KEY_GAP = 0.05;
const WHITE = 0xf3f1ea;
const BLUE = 0x9fcbe4;
const GREEN = 0x79d957;
// Key widths in units of one key, back row to front row.
const ROWS = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75],
  [1.25, 1.25, 1.25, 5.5, 1, 1, 1, 1],
];

function keyColor(r, c, count) {
  if (r === 0 && c === 0) return GREEN;
  if (r === 2 && c === count - 1) return GREEN;
  if (r === 4 && c >= count - 2) return GREEN;
  const isEdge = c === 0 || c === count - 1;
  return isEdge || (r + c) % 4 === 0 ? BLUE : WHITE;
}

export function bakeKeyboard(baker, deskShadows) {
  baker.rbox(KB.w, KB.caseH, KB.d, 0.09, { color: 0x2a2d33, pos: [KB.x, DESK.top, KB.z] });
  ROWS.forEach((row, r) => {
    const total = row.reduce((sum, u) => sum + u, 0) * PITCH;
    let cursor = KB.x - total / 2;
    row.forEach((u, c) => {
      const w = u * PITCH - KEY_GAP;
      const z = KB.z - KB.d / 2 + 0.16 + r * ROW_PITCH;
      baker.rbox(w, KB.keyH, ROW_PITCH - KEY_GAP, 0.04, { color: keyColor(r, c, row.length), pos: [cursor + (u * PITCH) / 2, DESK.top + KB.caseH, z] });
      cursor += u * PITCH;
    });
  });
  deskShadows.add({ x: KB.x, z: KB.z, w: KB.w + 0.4, d: KB.d + 0.5, y: DESK.top + 0.03, strength: 0.7 });
}

export function bakeMouse(baker, deskShadows) {
  const at = [2.35, DESK.top, -8.1];
  baker.rbox(0.62, 0.3, 1.05, 0.26, { color: 0xf5f4ef, pos: at, rot: [0, 0.12, 0] });
  baker.rbox(0.07, 0.05, 0.22, 0.02, { color: 0x3a3d44, outline: false, pos: [2.35, DESK.top + 0.29, -8.3], rot: [0, 0.12, 0] });
  deskShadows.add({ x: 2.35, z: -8.1, w: 0.9, d: 1.3, y: DESK.top + 0.03, strength: 0.6 });
}
