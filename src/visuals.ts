import { makeAvatar, makeMonster, type Actor } from './actors';
import { EYE } from './config';
import { camera, flash, scene } from './gfx';
import { getHurt } from './hud';
import { getLamps } from './scene';
import { S } from './state';
import type { MonsterView } from './types';

interface Tracked { actor: Actor; lx: number; lz: number }
const avatars = new Map<string, Tracked>();
const monsters: Tracked[] = [];

export interface FrameInfo { nearest: number; danger: number }

export function updateVisuals(dt: number, t: number): FrameInfo {
  const me = S.me;
  if (!me) return { nearest: 99, danger: 0 };
  const k = Math.min(1, dt * 14);

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
  const others: [string, number, number, number, boolean, number][] = [];
  if (S.isHost) { for (const p of S.players.values()) if (p.id !== S.myId) others.push([p.id, p.x, p.z, p.yaw, p.alive, p.idx]); }
  else { for (const [id, p] of S.remote) others.push([id, p.x, p.z, p.yaw, p.alive, p.idx]); }
  for (const [id, x, z, yaw, alive, idx] of others) {
    seen.add(id);
    let a = avatars.get(id);
    if (!a) {
      a = { actor: makeAvatar(idx), lx: x, lz: z };
      a.actor.group.position.set(x, 0, z);
      scene.add(a.actor.group);
      avatars.set(id, a);
    }
    const g = a.actor.group;
    g.position.x += (x - g.position.x) * k;
    g.position.z += (z - g.position.z) * k;
    g.rotation.y = yaw;
    const sp = alive ? Math.hypot(x - a.lx, z - a.lz) / Math.max(dt, 1e-3) : 0;
    a.lx = x; a.lz = z;
    a.actor.animate(dt, Math.min(sp, 7), false);
    g.rotation.x = alive ? 0 : -Math.PI / 2;
    g.position.y = alive ? 0 : 0.25;
  }
  for (const [id, a] of avatars) if (!seen.has(id)) { scene.remove(a.actor.group); avatars.delete(id); }

  /* ---- monsters ---- */
  const list: MonsterView[] = S.isHost
    ? S.monsters.map(m => ({ x: m.x, z: m.z, yaw: m.yaw, chasing: m.state === 'chase' }))
    : S.mview;
  while (monsters.length < list.length) {
    const actor = makeMonster();
    scene.add(actor.group);
    monsters.push({ actor, lx: 0, lz: 0 });
    const m = list[monsters.length - 1];
    actor.group.position.set(m.x, 0, m.z);
    monsters[monsters.length - 1].lx = m.x; monsters[monsters.length - 1].lz = m.z;
  }
  while (monsters.length > list.length) {
    const t0 = monsters.pop();
    if (t0) scene.remove(t0.actor.group);
  }
  let nearest = 99, danger = 0;
  list.forEach((m, i) => {
    const tr = monsters[i];
    const g = tr.actor.group;
    g.position.x += (m.x - g.position.x) * k;
    g.position.z += (m.z - g.position.z) * k;
    g.rotation.y = m.yaw;
    const sp = Math.hypot(m.x - tr.lx, m.z - tr.lz) / Math.max(dt, 1e-3);
    tr.lx = m.x; tr.lz = m.z;
    tr.actor.animate(dt, Math.min(sp, 6), m.chasing);
    const d = Math.hypot(m.x - me.x, m.z - me.z);
    if (d < nearest) nearest = d;
    if (m.chasing && d < 18) danger = Math.max(danger, 1 - d / 18);
  });
  if (!me.alive) danger = 0;

  /* ---- lamps flicker (broken lights blink) ---- */
  for (const l of getLamps()) {
    const f = l.flicker
      ? (Math.sin(t * 17 + l.phase) > 0.72 ? 0.08 : 1) * (0.85 + 0.15 * Math.sin(t * 5 + l.phase))
      : 0.96 + 0.04 * Math.sin(t * 2 + l.phase);
    l.light.intensity = l.base * f;
    l.fixture.color.copy(l.color).multiplyScalar(f);
  }

  /* ---- flashlight stutters when something is hunting you ---- */
  flash.intensity = 55 * (1 - danger * 0.45 * (0.5 + 0.5 * Math.sin(t * 40)));

  /* ---- camera: head bob, damage shake, death slump ---- */
  const hurt = getHurt();
  const bob = me.alive && me.mv ? Math.sin(t * (me.mv === 2 ? 14 : 9)) * 0.035 : 0;
  camera.position.set(me.x, me.alive ? EYE + 0.05 + bob : 0.35, me.z);
  const sh = hurt * 0.05;
  camera.rotation.set(
    me.pitch + (Math.random() - 0.5) * sh,
    me.yaw + (Math.random() - 0.5) * sh,
    me.alive ? 0 : 0.8,
  );

  return { nearest, danger };
}
