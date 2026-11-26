import * as THREE from 'three';
import { makeAvatar, makeMonster, type Actor } from './actors';
import { audioMonsters, footstep, setListener, type MonsterAudio } from './audio';
import { EYE, WALL_H } from './config';
import { camera, flash, scene, setFlashLevel } from './gfx';
import { getHurt, screenFlash } from './hud';
import { getCull, getLamps, getPool, getRooms } from './scene';
import { S } from './state';
import type { MonsterKind } from './types';

interface Tracked { actor: Actor; kind: MonsterKind | null; lx: number; lz: number }
const avatars = new Map<string, Tracked>();
const monsters: Tracked[] = [];

/** 3D Carriage Vehicle (utility hand-cart for hauling multiple valuables at once). */
const cartVisual = ((): {
  group: THREE.Group; wheels: THREE.Mesh[]; beacon: THREE.MeshBasicMaterial; lx: number; lz: number;
} => {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.65, metalness: 0.45 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5c3e26, roughness: 0.85 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x44ee88 });

  const addBox = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  // Flatbed + side rails (open top so loaded valuables are visible)
  addBox(1.06, 0.08, 1.56, wood, 0, 0.28, 0);
  addBox(1.12, 0.08, 1.62, steel, 0, 0.22, 0);
  // Corner posts
  for (const sx of [-0.52, 0.52]) for (const sz of [-0.76, 0.76]) addBox(0.06, 0.42, 0.06, steel, sx, 0.49, sz);
  // Top rails (left, right, front)
  addBox(0.05, 0.05, 1.54, steel, -0.52, 0.68, 0);
  addBox(0.05, 0.05, 1.54, steel,  0.52, 0.68, 0);
  addBox(1.08, 0.05, 0.05, steel, 0, 0.68, -0.76);
  // Rear push handle (+Z is back, -Z is forward)
  addBox(0.05, 0.36, 0.05, steel, -0.44, 0.84, 0.82);
  addBox(0.05, 0.36, 0.05, steel,  0.44, 0.84, 0.82);
  addBox(0.94, 0.05, 0.05, steel,  0, 1.0, 0.86);
  // Front lantern beacon
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), beacon);
  lantern.position.set(0, 0.72, -0.78);
  g.add(lantern);

  // 4 rugged wheels
  const wheels: THREE.Mesh[] = [];
  const wGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.09, 14);
  wGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.56, -0.52], [0.56, -0.52], [-0.56, 0.52], [0.56, 0.52]]) {
    const w = new THREE.Mesh(wGeo, tire);
    w.position.set(wx, 0.18, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  scene.add(g);
  return { group: g, wheels, beacon, lx: 6.4, lz: 4.5 };
})();

export interface FrameInfo { nearest: number; danger: number }

/** One permanent light for flare bursts (adding/removing lights would force shader recompiles). */
const flareLight = new THREE.PointLight(0xfff0d0, 0, 28, 1.6);
flareLight.position.set(-50, 2, -50);
scene.add(flareLight);
let flareT = 0;

export function flareFx(x: number, z: number): void {
  flareT = 1;
  flareLight.position.set(x, 1.8, z);
  const me = S.me;
  if (me && Math.hypot(me.x - x, me.z - z) < 12) screenFlash(0.8);
}

let flashLevel = -1;
let stepT = 0;

interface Other { id: string; x: number; z: number; yaw: number; alive: boolean; idx: number }
function othersList(): Other[] {
  const out: Other[] = [];
  if (S.isHost) {
    for (const p of S.players.values()) if (p.id !== S.myId) out.push({ id: p.id, x: p.x, z: p.z, yaw: p.yaw, alive: p.alive, idx: p.idx });
  } else {
    for (const [id, p] of S.remote) out.push({ id, x: p.x, z: p.z, yaw: p.yaw, alive: p.alive, idx: p.idx });
  }
  return out;
}

const sorted: { d: number; i: number }[] = [];

export function updateVisuals(dt: number, t: number): FrameInfo {
  const me = S.me;
  if (!me) return { nearest: 99, danger: 0 };
  const k = Math.min(1, dt * 14);

  /* ---- carriage vehicle ---- */
  {
    const c = S.cart;
    const cg = cartVisual.group;
    cg.position.x += (c.x - cg.position.x) * k;
    cg.position.z += (c.z - cg.position.z) * k;
    cg.rotation.y = c.yaw;
    const dist = Math.hypot(cg.position.x - cartVisual.lx, cg.position.z - cartVisual.lz);
    cartVisual.lx = cg.position.x; cartVisual.lz = cg.position.z;
    for (const w of cartVisual.wheels) w.rotation.x -= dist / 0.18;
    const loaded = S.items.some(it => it.state === 0 && it.cartSlot >= 0);
    cartVisual.beacon.color.setHex(c.driverIdx >= 0 ? 0x44e5ff : loaded ? 0xffbb33 : 0x44ee88);
  }

  /* ---- valuables ---- */
  for (const it of S.items) {
    const v = it.view;
    if (!v) continue;
    if (it.state !== 0 || !it.seen) { v.group.visible = false; continue; }
    v.group.visible = true;
    if (S.isHost) { v.group.position.copy(it.pos); v.group.quaternion.copy(it.quat); }
    else { v.group.position.lerp(it.pos, k); v.group.quaternion.slerp(it.quat, k); }
    const dmg = 1 - it.frac;
    for (const m of v.tint) m.emissive.setRGB(dmg * 0.6, dmg * 0.02, 0);
    if (v.screen) {
      const f = 0.75 + 0.25 * Math.sin(t * 30 + it.i) * Math.sin(t * 7 + it.i * 3);
      v.screen.color.setRGB(0.3 * f, 1.1 * f, 1.6 * f);
    }
  }

  /* ---- teammates ---- */
  const seen = new Set<string>();
  const others = othersList();
  for (const o of others) {
    seen.add(o.id);
    let a = avatars.get(o.id);
    if (!a) {
      a = { actor: makeAvatar(o.idx), kind: null, lx: o.x, lz: o.z };
      a.actor.group.position.set(o.x, 0, o.z);
      scene.add(a.actor.group);
      avatars.set(o.id, a);
    }
    const g = a.actor.group;
    g.position.x += (o.x - g.position.x) * k;
    g.position.z += (o.z - g.position.z) * k;
    g.rotation.y = o.yaw;
    const sp = o.alive ? Math.hypot(o.x - a.lx, o.z - a.lz) / Math.max(dt, 1e-3) : 0;
    a.lx = o.x; a.lz = o.z;
    a.actor.animate(dt, Math.min(sp, 7), false);
    g.rotation.x = o.alive ? 0 : -Math.PI / 2;
    g.position.y = o.alive ? 0 : 0.25;
    if (a.actor.beam) a.actor.beam.visible = o.alive;
  }
  for (const [id, a] of avatars) if (!seen.has(id)) { scene.remove(a.actor.group); avatars.delete(id); }

  /* ---- monsters ---- */
  const list = S.isHost
    ? S.monsters.map(m => ({ kind: m.kind, x: m.x, z: m.z, yaw: m.yaw, chasing: m.state === 'chase', stunned: m.stun > 0 }))
    : S.mview;
  while (monsters.length > list.length) {
    const t0 = monsters.pop();
    if (t0) scene.remove(t0.actor.group);
  }
  list.forEach((m, i) => {
    let tr: Tracked | undefined = monsters[i];
    if (tr && tr.kind !== m.kind) { scene.remove(tr.actor.group); tr = undefined; }
    if (!tr) {
      tr = { actor: makeMonster(m.kind), kind: m.kind, lx: m.x, lz: m.z };
      tr.actor.group.position.set(m.x, 0, m.z);
      scene.add(tr.actor.group);
      monsters[i] = tr;
    }
  });
  let nearest = 99, danger = 0;
  const audio: MonsterAudio[] = [];
  list.forEach((m, i) => {
    const tr = monsters[i];
    const g = tr.actor.group;
    g.position.x += (m.x - g.position.x) * k;
    g.position.z += (m.z - g.position.z) * k;
    g.rotation.y = m.yaw;
    const sp = Math.hypot(m.x - tr.lx, m.z - tr.lz) / Math.max(dt, 1e-3);
    tr.lx = m.x; tr.lz = m.z;
    tr.actor.animate(dt, Math.min(sp, 6), m.chasing, m.stunned);
    const d = Math.hypot(m.x - me.x, m.z - me.z);
    if (d < nearest) nearest = d;
    if (m.chasing && !m.stunned && d < 18) danger = Math.max(danger, 1 - d / 18);
    audio.push({ kind: m.kind, x: g.position.x, z: g.position.z, chasing: m.chasing, stunned: m.stunned });
  });
  if (!me.alive) danger = 0;
  audioMonsters(audio);

  /* ---- lights: a fixed pool follows the player to the nearest lit lamps ---- */
  const lamps = getLamps(), pool = getPool();
  const lampF: number[] = [];
  lamps.forEach((l, i) => {
    const f = l.flicker
      ? (Math.sin(t * 17 + l.phase) > 0.72 ? 0.08 : 1) * (0.85 + 0.15 * Math.sin(t * 5 + l.phase))
      : 0.96 + 0.04 * Math.sin(t * 2 + l.phase);
    lampF[i] = f;
    l.fixture.color.copy(l.color).multiplyScalar(f);
    sorted[i] = { d: (l.x - me.x) ** 2 + (l.z - me.z) ** 2, i };
  });
  sorted.length = lamps.length;
  sorted.sort((a, b) => a.d - b.d);
  pool.forEach((light, n) => {
    const s = sorted[n];
    if (!s) { light.intensity = 0; return; }
    const l = lamps[s.i];
    light.position.set(l.x, WALL_H - 0.4, l.z);
    light.color.setHex(l.hex);
    light.intensity = l.base * lampF[s.i];
  });

  /* ---- flare burst ---- */
  if (flareT > 0) {
    flareT = Math.max(0, flareT - dt * 1.4);
    flareLight.intensity = 90 * flareT * flareT;
  } else flareLight.intensity = 0;

  /* ---- flashlight (upgradeable) stutters when something is hunting you ---- */
  if (flashLevel !== S.upg.lamp) { flashLevel = S.upg.lamp; setFlashLevel(flashLevel); }
  const base = (flash.userData['base'] as number | undefined) ?? 55;
  flash.intensity = base * (1 - danger * 0.4 * (0.5 + 0.5 * Math.sin(t * 40)));

  /* ---- footsteps ---- */
  if (me.alive && me.mv) {
    stepT -= dt;
    if (stepT <= 0) { footstep(me.mv === 2); stepT = me.mv === 2 ? 0.3 : 0.5; }
  } else stepT = 0;

  /* ---- camera: head bob, damage shake, and spectating a living teammate when dead ---- */
  const hurt = getHurt();
  const bob = me.alive && me.mv ? Math.sin(t * (me.mv === 2 ? 14 : 9)) * 0.035 : 0;
  let cx = me.x, cz = me.z, cy = me.alive ? EYE + 0.05 + bob : 0.35, cyaw = me.yaw;
  if (!me.alive) {
    const target = others.find(o => o.alive);
    if (target) { cx = target.x; cz = target.z; cy = EYE; cyaw = target.yaw; }
  }
  camera.position.set(cx, cy, cz);
  const sh = hurt * 0.05;
  const spectating = !me.alive && cy === EYE;
  camera.rotation.set(
    (spectating ? 0 : me.pitch) + (Math.random() - 0.5) * sh,
    cyaw + (Math.random() - 0.5) * sh,
    me.alive || spectating ? 0 : 0.8,
  );
  setListener(cx, cy, cz, cyaw);

  /* ---- don't draw rooms that are completely lost in the fog (keeps 65 m maps fast) ---- */
  const cull = getCull();
  for (const r of getRooms()) {
    const dx = Math.max(r.x1 - cx, 0, cx - r.x2), dz = Math.max(r.z1 - cz, 0, cz - r.z2);
    r.group.visible = Math.hypot(dx, dz) < cull;
  }

  return { nearest, danger };
}
