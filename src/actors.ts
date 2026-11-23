import * as THREE from 'three';
import { AV_COLORS } from './config';

export interface Actor {
  group: THREE.Group;
  /** speed in m/s drives the walk cycle; alert raises the arms (monsters) */
  animate(dt: number, speed: number, alert: boolean): void;
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A hanging limb: pivot at the joint so rotation.x swings it. */
function limb(parent: THREE.Object3D, w: number, len: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  part(pivot, new THREE.BoxGeometry(w, len, w), mat, 0, -len / 2, 0);
  parent.add(pivot);
  return pivot;
}

export function makeAvatar(idx: number): Actor {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: AV_COLORS[idx % AV_COLORS.length], roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8b9a0, roughness: 0.8 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c0).multiplyScalar(3) });

  part(group, new THREE.BoxGeometry(0.5, 0.62, 0.28), suit, 0, 1.12, 0);
  part(group, new THREE.BoxGeometry(0.34, 0.44, 0.16), dark, 0, 1.15, 0.2);            // backpack
  part(group, new THREE.SphereGeometry(0.19, 14, 10), skin, 0, 1.6, 0);
  part(group, new THREE.BoxGeometry(0.3, 0.1, 0.1), dark, 0, 1.64, -0.14);             // visor strip
  const legL = limb(group, 0.18, 0.8, dark, -0.14, 0.82, 0);
  const legR = limb(group, 0.18, 0.8, dark, 0.14, 0.82, 0);
  const armL = limb(group, 0.13, 0.55, suit, -0.34, 1.38, 0);
  const armR = limb(group, 0.13, 0.55, suit, 0.34, 1.38, 0);
  part(armR, new THREE.CylinderGeometry(0.04, 0.05, 0.2, 8), dark, 0, -0.5, -0.12).rotation.x = Math.PI / 2;
  part(armR, new THREE.SphereGeometry(0.04, 8, 6), glow, 0, -0.5, -0.24);              // flashlight lens

  let phase = 0;
  return {
    group,
    animate(dt, speed) {
      phase += dt * (3 + speed * 1.6);
      const k = Math.min(1, speed / 3);
      const s = Math.sin(phase) * 0.7 * k;
      legL.rotation.x = s; legR.rotation.x = -s;
      armL.rotation.x = -s * 0.8; armR.rotation.x = -0.9 + s * 0.1;
    },
  };
}

export function makeMonster(): Actor {
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xd9d2c0, roughness: 0.6 });
  const eyes = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2200).multiplyScalar(3.5) });

  const torso = new THREE.Group();
  torso.position.set(0, 1.6, 0);
  torso.rotation.x = -0.22;                                                              // stoop forward
  group.add(torso);
  part(torso, new THREE.BoxGeometry(0.42, 0.95, 0.24), hide, 0, 0, 0);
  part(torso, new THREE.BoxGeometry(0.46, 0.18, 0.28), hide, 0, 0.42, 0);                // shoulders
  const head = new THREE.Group();
  head.position.set(0, 0.78, -0.08);
  torso.add(head);
  const skull = part(head, new THREE.SphereGeometry(0.2, 14, 12), bone, 0, 0, 0);
  skull.scale.set(0.85, 1.35, 0.95);
  for (const s of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.055, 8, 6), hide, s * 0.075, 0.08, -0.17);     // sockets
    part(head, new THREE.SphereGeometry(0.028, 8, 6), eyes, s * 0.075, 0.08, -0.2);      // glowing eyes
  }
  part(head, new THREE.BoxGeometry(0.1, 0.16, 0.06), hide, 0, -0.14, -0.15);             // maw
  const glow = new THREE.PointLight(0xff2200, 1.6, 6, 2);
  glow.position.set(0, 0.1, -0.3);
  head.add(glow);

  const armL = limb(torso, 0.09, 1.45, hide, -0.3, 0.4, 0);
  const armR = limb(torso, 0.09, 1.45, hide, 0.3, 0.4, 0);
  for (const a of [armL, armR]) part(a, new THREE.ConeGeometry(0.06, 0.3, 6), bone, 0, -1.55, 0).rotation.x = Math.PI;
  const legL = limb(group, 0.12, 1.15, hide, -0.12, 1.15, 0);
  const legR = limb(group, 0.12, 1.15, hide, 0.12, 1.15, 0);

  let phase = 0;
  return {
    group,
    animate(dt, speed, alert) {
      phase += dt * (2 + speed * 1.2);
      const k = Math.min(1, speed / 2);
      const s = Math.sin(phase) * 0.6 * k;
      legL.rotation.x = s; legR.rotation.x = -s;
      const lift = alert ? -1.35 : 0;
      armL.rotation.x += (lift - s * 0.6 - armL.rotation.x) * Math.min(1, dt * 6);
      armR.rotation.x += (lift + s * 0.6 - armR.rotation.x) * Math.min(1, dt * 6);
      head.rotation.z = Math.sin(phase * 0.5) * 0.12 * (1 - k * 0.5);
    },
  };
}
