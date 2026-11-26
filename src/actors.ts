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
  const col = AV_COLORS[idx % AV_COLORS.length];
  const suit = new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.7, metalness: 0.35 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.25 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x090a0d, roughness: 0.2 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c0).multiplyScalar(3) });
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.4) });

  // R.E.P.O. Semibot: rounded capsule torso + collar
  part(group, new THREE.CapsuleGeometry(0.24, 0.42, 8, 14), suit, 0, 0.92, 0);
  part(group, new THREE.CylinderGeometry(0.18, 0.21, 0.07, 14), dark, 0, 1.33, 0);

  // Rear battery pack + status LED
  part(group, new THREE.BoxGeometry(0.28, 0.34, 0.14), dark, 0, 0.96, 0.23);
  part(group, new THREE.SphereGeometry(0.032, 8, 6), led, 0, 1.06, 0.31);

  // Hinged lower jaw (opens when moving/talking)
  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, 1.44, 0.04);
  group.add(jawPivot);
  part(jawPivot, new THREE.CylinderGeometry(0.215, 0.17, 0.11, 16), suit, 0, -0.04, -0.04);
  part(jawPivot, new THREE.CylinderGeometry(0.19, 0.19, 0.03, 14), dark, 0, 0.015, -0.04);

  // Upper cranium + dome + antenna
  const head = new THREE.Group();
  head.position.set(0, 1.54, 0);
  group.add(head);
  part(head, new THREE.CylinderGeometry(0.225, 0.225, 0.16, 16), suit, 0, 0, 0);
  part(head, new THREE.SphereGeometry(0.225, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), suit, 0, 0.08, 0);
  part(head, new THREE.CylinderGeometry(0.016, 0.022, 0.18, 8), dark, 0, 0.36, 0.02);
  part(head, new THREE.SphereGeometry(0.036, 8, 8), led, 0, 0.46, 0.02);

  // Big expressive R.E.P.O. googly eyes
  for (const s of [-1, 1]) {
    part(head, new THREE.CylinderGeometry(0.088, 0.088, 0.04, 12), dark, s * 0.105, 0.03, -0.19).rotation.x = Math.PI / 2;
    part(head, new THREE.SphereGeometry(0.08, 12, 10), white, s * 0.105, 0.03, -0.21);
    part(head, new THREE.SphereGeometry(0.036, 8, 8), pupil, s * 0.105, 0.03, -0.275);
  }

  // Stubby capsule legs
  const legL = new THREE.Group(); legL.position.set(-0.13, 0.52, 0); group.add(legL);
  part(legL, new THREE.CapsuleGeometry(0.085, 0.32, 6, 10), dark, 0, -0.22, 0);
  const legR = new THREE.Group(); legR.position.set(0.13, 0.52, 0); group.add(legR);
  part(legR, new THREE.CapsuleGeometry(0.085, 0.32, 6, 10), dark, 0, -0.22, 0);

  // Stubby capsule arms + flashlight on right hand
  const armL = new THREE.Group(); armL.position.set(-0.31, 1.14, 0); group.add(armL);
  part(armL, new THREE.CapsuleGeometry(0.065, 0.32, 6, 10), suit, 0, -0.2, 0);
  const armR = new THREE.Group(); armR.position.set(0.31, 1.14, 0); group.add(armR);
  part(armR, new THREE.CapsuleGeometry(0.065, 0.32, 6, 10), suit, 0, -0.2, 0);

  part(armR, new THREE.CylinderGeometry(0.04, 0.05, 0.2, 8), dark, 0, -0.4, -0.12).rotation.x = Math.PI / 2;
  part(armR, new THREE.SphereGeometry(0.04, 8, 6), glow, 0, -0.4, -0.24);              // flashlight lens
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0.31, 0.96, -0.3);
  group.add(beam);

  let phase = 0;
  return {
    group, beam,
    animate(dt, speed) {
      phase += dt * (3.5 + speed * 1.8);
      const k = Math.min(1, speed / 3);
      const s = Math.sin(phase) * 0.75 * k;
      legL.rotation.x = s; legR.rotation.x = -s;
      armL.rotation.x = -s * 0.85; armR.rotation.x = -0.9 + s * 0.1;
      // subtle chattering jaw when moving
      jawPivot.rotation.x = k > 0.1 ? (0.08 + Math.abs(Math.sin(phase * 1.7)) * 0.22 * k) : 0.04;
      head.position.y = 1.54 + Math.abs(Math.sin(phase)) * 0.025 * k;
    },
  };
}

interface Look {
  hide: number; bone: number; eye: number | null;
  torsoW: number; armLen: number; legLen: number; headScale: number;
  horns: boolean; ears: boolean; claws: number;
  shape?: 'biped' | 'crawler' | 'phantom' | 'warden';
}
const LOOKS: Record<MonsterKind, Look> = {
  stalker:  { hide: 0x0c0c0e, bone: 0xd9d2c0, eye: 0xff2200, torsoW: 1.0,  armLen: 1.45, legLen: 1.15, headScale: 1.0,  horns: false, ears: false, claws: 6, shape: 'biped' },
  runner:   { hide: 0x2a2c2a, bone: 0xc8c8b8, eye: 0xffe000, torsoW: 0.7,  armLen: 1.75, legLen: 1.3,  headScale: 0.85, horns: false, ears: false, claws: 8, shape: 'biped' },
  brute:    { hide: 0x2a0d0d, bone: 0xb8a890, eye: 0xff7a00, torsoW: 1.7,  armLen: 1.25, legLen: 1.0,  headScale: 0.9,  horns: true,  ears: false, claws: 5, shape: 'biped' },
  listener: { hide: 0x10161c, bone: 0xaab4b8, eye: null,     torsoW: 0.95, armLen: 1.5,  legLen: 1.15, headScale: 1.1,  horns: false, ears: true,  claws: 6, shape: 'biped' },
  crawler:  { hide: 0x1a1220, bone: 0xc2b8cc, eye: 0xc840ff, torsoW: 1.2,  armLen: 1.1,  legLen: 0.65, headScale: 1.05, horns: false, ears: false, claws: 7, shape: 'crawler' },
  phantom:  { hide: 0x0b161e, bone: 0x9ec8d8, eye: 0x38f0ff, torsoW: 0.9,  armLen: 1.65, legLen: 0.0,  headScale: 0.95, horns: false, ears: false, claws: 5, shape: 'phantom' },
  warden:   { hide: 0x161c16, bone: 0x9aa694, eye: 0x2dff7a, torsoW: 1.85, armLen: 1.4,  legLen: 1.1,  headScale: 1.15, horns: true,  ears: false, claws: 6, shape: 'warden' },
};

export function makeMonster(kind: MonsterKind): Actor {
  const look = LOOKS[kind];
  const scale = MONSTER_DEFS[kind].scale;
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: look.hide, roughness: 0.9 });
  const bone = new THREE.MeshStandardMaterial({ color: look.bone, roughness: 0.6 });
  const eyes = look.eye === null ? null : new THREE.MeshBasicMaterial({ color: new THREE.Color(look.eye).multiplyScalar(3.5) });

  if (look.shape === 'crawler') {
    // Low-slung spider-like lurker with 4 splayed legs
    const body = new THREE.Group();
    body.position.set(0, 0.55, 0);
    group.add(body);
    part(body, new THREE.SphereGeometry(0.42, 12, 10), hide, 0, 0, 0.1).scale.set(1.1, 0.55, 1.45);
    const head = new THREE.Group();
    head.position.set(0, 0.08, -0.58);
    body.add(head);
    part(head, new THREE.SphereGeometry(0.24, 12, 10), bone, 0, 0, 0).scale.set(1.15, 0.85, 1.0);
    for (const s of [-1, 1]) {
      part(head, new THREE.SphereGeometry(0.055, 8, 6), hide, s * 0.1, 0.06, -0.18);
      if (eyes) part(head, new THREE.SphereGeometry(0.032, 8, 6), eyes, s * 0.1, 0.06, -0.21);
    }
    part(head, new THREE.BoxGeometry(0.22, 0.1, 0.08), hide, 0, -0.09, -0.17);
    const legs: THREE.Group[] = [];
    for (const [sx, sz] of [[-1, -0.35], [1, -0.35], [-1, 0.35], [1, 0.35]]) {
      const lp = new THREE.Group();
      lp.position.set(sx * 0.35, 0, sz);
      lp.rotation.z = sx * 0.75;
      part(lp, new THREE.BoxGeometry(0.1, 0.95, 0.1), hide, 0, -0.42, 0);
      part(lp, new THREE.ConeGeometry(0.05, 0.24, 5), bone, 0, -0.95, 0).rotation.x = Math.PI;
      body.add(lp);
      legs.push(lp);
    }
    group.scale.setScalar(scale);
    let phase = 0;
    return {
      group, beam: null,
      animate(dt, speed, alert, stunned = false) {
        if (stunned) { head.rotation.z = Math.sin(performance.now() / 35) * 0.3; return; }
        phase += dt * (4 + speed * 2.2);
        const k = Math.min(1, speed / 2);
        legs.forEach((l, i) => { l.rotation.x = Math.sin(phase + i * 1.5) * 0.55 * k; });
        body.position.y = 0.55 + Math.abs(Math.sin(phase)) * 0.07 * k + (alert ? 0.08 : 0);
        head.rotation.z = Math.sin(phase * 0.5) * 0.12;
      },
    };
  }

  const torso = new THREE.Group();
  const isPhantom = look.shape === 'phantom';
  torso.position.set(0, isPhantom ? 1.45 : 0.45 + look.legLen, 0);
  torso.rotation.x = isPhantom ? -0.1 : -0.22;                                            // stoop forward
  group.add(torso);
  if (isPhantom) {
    part(torso, new THREE.ConeGeometry(0.42, 1.35, 10, 1, true), hide, 0, -0.25, 0);
  } else {
    part(torso, new THREE.BoxGeometry(0.42 * look.torsoW, 0.95, 0.24 * Math.max(1, look.torsoW * 0.8)), hide, 0, 0, 0);
    part(torso, new THREE.BoxGeometry(0.46 * look.torsoW, 0.18, 0.28), hide, 0, 0.42, 0); // shoulders
  }
  const head = new THREE.Group();
  head.position.set(0, 0.78, -0.08);
  head.scale.setScalar(look.headScale);
  torso.add(head);
  const skull = part(head, new THREE.SphereGeometry(0.2, 14, 12), bone, 0, 0, 0);
  skull.scale.set(0.85, 1.35, 0.95);
  if (look.shape === 'warden') {
    // Cyclops emerald eye + cage crest
    part(head, new THREE.SphereGeometry(0.085, 10, 8), hide, 0, 0.06, -0.17);
    if (eyes) part(head, new THREE.SphereGeometry(0.052, 10, 8), eyes, 0, 0.06, -0.21);
    part(head, new THREE.TorusGeometry(0.22, 0.03, 6, 12), hide, 0, 0.06, 0).rotation.y = Math.PI / 2;
  } else {
    for (const s of [-1, 1]) {
      part(head, new THREE.SphereGeometry(0.055, 8, 6), hide, s * 0.075, 0.08, -0.17);   // sockets
      if (eyes) part(head, new THREE.SphereGeometry(0.028, 8, 6), eyes, s * 0.075, 0.08, -0.2);
      if (look.horns) {
        const h = part(head, new THREE.ConeGeometry(0.06, 0.34, 8), bone, s * 0.14, 0.3, 0);
        h.rotation.z = -s * 0.5;
      }
      if (look.ears) {
        const ear = part(head, new THREE.SphereGeometry(0.16, 10, 8), bone, s * 0.23, 0.02, 0.02);
        ear.scale.set(0.25, 1.1, 0.8);                                                   // big, flat, pale ears
      }
    }
  }
  part(head, new THREE.BoxGeometry(look.ears ? 0.2 : 0.1, look.ears ? 0.26 : 0.16, 0.06), hide, 0, -0.14, -0.15); // maw

  const armL = limb(torso, 0.09 * Math.max(1, look.torsoW * 0.7), look.armLen, hide, -0.3 * look.torsoW, 0.4, 0);
  const armR = limb(torso, 0.09 * Math.max(1, look.torsoW * 0.7), look.armLen, hide, 0.3 * look.torsoW, 0.4, 0);
  for (const a of [armL, armR]) part(a, new THREE.ConeGeometry(0.06, 0.3, look.claws), bone, 0, -look.armLen - 0.1, 0).rotation.x = Math.PI;
  const legL = isPhantom ? null : limb(group, 0.12 * Math.max(1, look.torsoW * 0.7), look.legLen, hide, -0.12 * look.torsoW, look.legLen, 0);
  const legR = isPhantom ? null : limb(group, 0.12 * Math.max(1, look.torsoW * 0.7), look.legLen, hide, 0.12 * look.torsoW, look.legLen, 0);
  group.scale.setScalar(scale);

  let phase = 0;
  return {
    group, beam: null,
    animate(dt, speed, alert, stunned = false) {
      if (stunned) {
        head.rotation.z = Math.sin(performance.now() / 35) * 0.25;                       // shuddering
        if (legL) legL.rotation.x *= 0.8;
        if (legR) legR.rotation.x *= 0.8;
        return;
      }
      phase += dt * (2 + speed * 1.2);
      const k = Math.min(1, speed / 2);
      const s = Math.sin(phase) * 0.6 * k;
      if (legL) legL.rotation.x = s;
      if (legR) legR.rotation.x = -s;
      if (isPhantom) torso.position.y = 1.45 + Math.sin(phase * 0.8) * 0.14;
      const lift = alert ? -1.35 : 0;
      armL.rotation.x += (lift - s * 0.6 - armL.rotation.x) * Math.min(1, dt * 6);
      armR.rotation.x += (lift + s * 0.6 - armR.rotation.x) * Math.min(1, dt * 6);
      head.rotation.z = Math.sin(phase * 0.5) * 0.12 * (1 - k * 0.5);
    },
  };
}
