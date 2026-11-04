// The diorama shell: a floor slab with plank top, the back wall (window opening) and the left wall (door opening).
import * as THREE from 'three';
import { ROOM, DOOR, PALETTE } from './config.js';
import { EDGE_ANGLE, lineSet } from './geo.js';
import { makeFloorTexture } from './floor-texture.js';

const BASEBOARD = Object.freeze({ h: 0.95, t: 0.24 });
// The planks float a hair above the slab's top face, which keeps the two from fighting for depth.
const FLOOR_LIFT = 0.012;

function backWallGeometry() {
  const { x0, x1, z0, wall, height } = ROOM;
  const left = x0 - wall;
  const shape = new THREE.Shape();
  shape.moveTo(left, 0);
  shape.lineTo(x1, 0);
  shape.lineTo(x1, height);
  shape.lineTo(left, height);
  shape.closePath();
  // Extrusion runs +z; the front cap (normal +z) lands on the room side at z0.
  return new THREE.ExtrudeGeometry(shape, { depth: wall, bevelEnabled: false }).translate(0, 0, z0 - wall);
}

function leftWallGeometry() {
  const { x0, z0, z1, wall, height } = ROOM;
  const doorA = DOOR.hingeZ;
  const doorB = DOOR.hingeZ + DOOR.w;
  const shape = new THREE.Shape();
  shape.moveTo(z0, 0);
  shape.lineTo(doorA, 0);
  shape.lineTo(doorA, DOOR.h);
  shape.lineTo(doorB, DOOR.h);
  shape.lineTo(doorB, 0);
  shape.lineTo(z1, 0);
  shape.lineTo(z1, height);
  shape.lineTo(z0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: wall, bevelEnabled: false });
  // Shape x becomes world z; the extrusion runs outward (-x), so the room-side cap sits at x0.
  geometry.rotateY(-Math.PI / 2);
  return geometry.translate(x0, 0, 0);
}

function slabGeometries() {
  const { x0, x1, z0, z1, wall, slab } = ROOM;
  const w = x1 - x0 + wall;
  const d = z1 - z0 + wall;
  const full = new THREE.BoxGeometry(w, slab, d).translate((x0 - wall + x1) / 2, -slab / 2, (z0 - wall + z1) / 2);
  return { fill: full, edges: new THREE.EdgesGeometry(full, EDGE_ANGLE) };
}

export function createShell({ renderer, mats }) {
  const group = new THREE.Group();
  group.name = 'shell';
  const floorTexture = makeFloorTexture(renderer);
  mats.floor.map = floorTexture;
  mats.floor.needsUpdate = true;

  const slab = slabGeometries();
  const plane = new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0).rotateX(-Math.PI / 2).translate(0, FLOOR_LIFT, 0);
  const back = backWallGeometry();
  const left = leftWallGeometry();
  const wallEdges = [back, left].map((g) => new THREE.EdgesGeometry(g, EDGE_ANGLE));

  group.add(new THREE.Mesh(slab.fill, mats.slab));
  group.add(new THREE.Mesh(plane, mats.floor));
  group.add(new THREE.Mesh(back, mats.wall));
  group.add(new THREE.Mesh(left, mats.wall));
  [slab.edges, ...wallEdges].forEach((edges) => group.add(lineSet(edges, mats.line)));

  /** Skirting boards, parked in the shared static bake so they cost nothing extra. */
  function bakeTrim(baker) {
    const { x0, x1, z0, z1 } = ROOM;
    const { h, t } = BASEBOARD;
    const trim = { color: PALETTE.trim };
    baker.box(x1 - x0, h, t, { ...trim, pos: [(x0 + x1) / 2, 0, z0 + t / 2] });
    const gapA = DOOR.hingeZ - DOOR.frame;
    const gapB = DOOR.hingeZ + DOOR.w + DOOR.frame;
    baker.box(t, h, gapA - (z0 + t), { ...trim, pos: [x0 + t / 2, 0, (z0 + t + gapA) / 2] });
    baker.box(t, h, z1 - gapB, { ...trim, pos: [x0 + t / 2, 0, (gapB + z1) / 2] });
  }

  function dispose() {
    group.traverse((node) => node.geometry && node.geometry.dispose());
    floorTexture.dispose();
  }

  return { group, bakeTrim, dispose };
}
