import * as THREE from 'three';
import { AV_COLORS, MONSTER_DEFS } from './config';
import type { MonsterKind } from './types';

export interface Actor {
  group: THREE.Group;
  /** speed in m/s drives the walk cycle; alert raises the arms (monsters); stunned freezes and shudders */
  animate(dt: number, speed: number, alert: boolean, stunned?: boolean): void;
  /** the visible flashlight cone on teammates */
  beam: THREE.Object3D | null;
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

const beamGeo = ((): THREE.ConeGeometry => {
  const g = new THREE.ConeGeometry(1.5, 7, 18, 1, true);
  g.translate(0, -3.5, 0);        // apex at the origin, opening downwards...
  g.rotateX(Math.PI / 2);         // ...then swung so it opens along -Z (the way the player faces)
  return g;
})();
const beamMat = new THREE.MeshBasicMaterial({
  color: 0xfff0c0, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});

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
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0.34, 1.05, -0.3);
  group.add(beam);

  let phase = 0;
  return {
    group, beam,
    animate(dt, speed) {
      phase += dt * (3 + speed * 1.6);
      const k = Math.min(1, speed / 3);
      const s = Math.sin(phase) * 0.7 * k;
      legL.rotation.x = s; legR.rotation.x = -s;
      armL.rotation.x = -s * 0.8; armR.rotation.x = -0.9 + s * 0.1;
    },
  };
}

interface Look {
  hide: number; bone: number; eye: number | null;
  torsoW: number; armLen: number; legLen: number; headScale: number;
  horns: boolean; ears: boolean; claws: number;
}
const LOOKS: Record<MonsterKind, Look> = {
  stalker:  { hide: 0x0c0c0e, bone: 0xd9d2c0, eye: 0xff2200, torsoW: 1.0, armLen: 1.45, legLen: 1.15, headScale: 1.0,  horns: false, ears: false, claws: 6 },
  runner:   { hide: 0x2a2c2a, bone: 0xc8c8b8, eye: 0xffe000, torsoW: 0.7, armLen: 1.75, legLen: 1.3,  headScale: 0.85, horns: false, ears: false, claws: 8 },
  brute:    { hide: 0x2a0d0d, bone: 0xb8a890, eye: 0xff7a00, torsoW: 1.7, armLen: 1.25, legLen: 1.0,  headScale: 0.9,  horns: true,  ears: false, claws: 5 },
  listener: { hide: 0x10161c, bone: 0xaab4b8, eye: null,     torsoW: 0.95, armLen: 1.5, legLen: 1.15, headScale: 1.1,  horns: false, ears: true,  claws: 6 },
};

export function makeMonster(kind: MonsterKind): Actor {
  const look = LOOKS[kind];
  const scale = MONSTER_DEFS[kind].scale;
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: look.hide, roughness: 0.9 });
  const bone = new THREE.MeshStandardMaterial({ color: look.bone, roughness: 0.6 });
  const eyes = look.eye === null ? null : new THREE.MeshBasicMaterial({ color: new THREE.Color(look.eye).multiplyScalar(3.5) });

  const torso = new THREE.Group();
  torso.position.set(0, 0.45 + look.legLen, 0);
  torso.rotation.x = -0.22;                                                              // stoop forward
  group.add(torso);
  part(torso, new THREE.BoxGeometry(0.42 * look.torsoW, 0.95, 0.24 * Math.max(1, look.torsoW * 0.8)), hide, 0, 0, 0);
  part(torso, new THREE.BoxGeometry(0.46 * look.torsoW, 0.18, 0.28), hide, 0, 0.42, 0);  // shoulders
  const head = new THREE.Group();
  head.position.set(0, 0.78, -0.08);
  head.scale.setScalar(look.headScale);
  torso.add(head);
  const skull = part(head, new THREE.SphereGeometry(0.2, 14, 12), bone, 0, 0, 0);
  skull.scale.set(0.85, 1.35, 0.95);
  for (const s of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.055, 8, 6), hide, s * 0.075, 0.08, -0.17);     // sockets
    if (eyes) part(head, new THREE.SphereGeometry(0.028, 8, 6), eyes, s * 0.075, 0.08, -0.2);
    if (look.horns) {
      const h = part(head, new THREE.ConeGeometry(0.06, 0.34, 8), bone, s * 0.14, 0.3, 0);
      h.rotation.z = -s * 0.5;
    }
    if (look.ears) {
      const ear = part(head, new THREE.SphereGeometry(0.16, 10, 8), bone, s * 0.23, 0.02, 0.02);
      ear.scale.set(0.25, 1.1, 0.8);                                                     // big, flat, pale ears
    }
  }
  part(head, new THREE.BoxGeometry(look.ears ? 0.2 : 0.1, look.ears ? 0.26 : 0.16, 0.06), hide, 0, -0.14, -0.15); // maw

  const armL = limb(torso, 0.09 * Math.max(1, look.torsoW * 0.7), look.armLen, hide, -0.3 * look.torsoW, 0.4, 0);
  const armR = limb(torso, 0.09 * Math.max(1, look.torsoW * 0.7), look.armLen, hide, 0.3 * look.torsoW, 0.4, 0);
  for (const a of [armL, armR]) part(a, new THREE.ConeGeometry(0.06, 0.3, look.claws), bone, 0, -look.armLen - 0.1, 0).rotation.x = Math.PI;
  const legL = limb(group, 0.12 * Math.max(1, look.torsoW * 0.7), look.legLen, hide, -0.12 * look.torsoW, look.legLen, 0);
  const legR = limb(group, 0.12 * Math.max(1, look.torsoW * 0.7), look.legLen, hide, 0.12 * look.torsoW, look.legLen, 0);
  group.scale.setScalar(scale);

  let phase = 0;
  return {
    group, beam: null,
    animate(dt, speed, alert, stunned = false) {
      if (stunned) {
        head.rotation.z = Math.sin(performance.now() / 35) * 0.25;                       // shuddering
        legL.rotation.x *= 0.8; legR.rotation.x *= 0.8;
        return;
      }
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
