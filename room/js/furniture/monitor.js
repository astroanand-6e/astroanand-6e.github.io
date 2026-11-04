// The 24-inch monitor on the riser: thin bezel, a neck and foot, and the "Paper City" title screen. It is the
// game's door: clicking it (or the controller) pushes the camera into this screen.
import * as THREE from 'three';
import { RISER, PALETTE } from '../config.js';
import { createBaker, meshFromBake, ownLines } from '../geo.js';
import { createScreenArt } from '../screen-art.js';

const PLACE = Object.freeze({ x: 0.6, yaw: 0.2 });
const PANEL = Object.freeze({ w: 5.62, h: 3.3, d: 0.3, bottom: 1.55 });
const SCREEN = Object.freeze({ w: 5.31, h: 2.99, lift: 0.015 });
const BODY = 0x16171c;
const STAND = 0x24262c;
const LIFT = 0.35;

export function createMonitor({ renderer, mats, theme }) {
  const baker = createBaker();
  baker.rbox(2.6, 0.12, 1.5, 0.05, { color: STAND, pos: [0, 0, 0.15] });
  baker.box(0.55, PANEL.bottom + 0.6, 0.28, { color: STAND, pos: [0, 0.1, -0.22] });
  baker.rbox(PANEL.w, PANEL.h, PANEL.d, 0.14, { color: BODY, pos: [0, PANEL.bottom, -PANEL.d / 2] });
  baker.sphere(0.045, { color: 0x21d6cf, outline: false, pos: [PANEL.w / 2 - 0.4, PANEL.bottom + 0.16, 0.01] });
  const body = meshFromBake(baker.build(), mats.furniture, mats.line);

  const group = new THREE.Group();
  group.name = 'monitor';
  group.position.set(PLACE.x, RISER.top, RISER.z);
  group.rotation.y = PLACE.yaw;
  group.add(body);

  // Lid-space convention (shared with the MacBook): the plane faces -y with its top toward +z, then it is stood up.
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial());
  screenMesh.rotation.x = -Math.PI / 2;
  screenMesh.position.set(0, PANEL.bottom + PANEL.h / 2, SCREEN.lift);
  group.add(screenMesh);
  const art = createScreenArt({ screenMesh, renderer, theme });

  const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const proxies = [
    [PANEL.w + 0.4, PANEL.h + 0.4, 0.9, 0, PANEL.bottom + PANEL.h / 2, -0.1],
    [2.8, PANEL.bottom + 0.4, 1.8, 0, (PANEL.bottom + 0.4) / 2, 0.1],
  ].map(([w, h, d, x, y, z]) => {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hiddenMaterial);
    proxy.position.set(x, y, z);
    proxy.visible = false;
    proxy.userData.target = 'game';
    group.add(proxy);
    return proxy;
  });

  const lines = ownLines(group, mats.line);
  const target = { id: 'game', holder: group, axis: 'y', base: group.position.y, proxies, lines, lift: LIFT, link: 'play' };

  return {
    group,
    screenMesh,
    target,
    setTheme: art.setTheme,
    update: art.update,
    dispose() {
      art.dispose();
      body.traverse((n) => n.geometry && n.geometry.dispose());
      screenMesh.geometry.dispose();
      screenMesh.material.dispose();
      proxies.forEach((p) => p.geometry.dispose());
      hiddenMaterial.dispose();
      lines.dispose();
    },
  };
}
