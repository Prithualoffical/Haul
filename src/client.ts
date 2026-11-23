import { playSfx } from './audio';
import { feed } from './hud';
import { makeItem } from './items';
import { generateMap } from './map';
import { Nav } from './nav';
import { sendToHost } from './net';
import { buildLevelScene } from './scene';
import { newPlayer, S } from './state';
import type { LvlMsg, ServerMsg, SnapMsg } from './types';

function isServerMsg(d: unknown): d is ServerMsg {
  if (typeof d !== 'object' || d === null) return false;
  const t = (d as { t?: unknown }).t;
  return t === 'lvl' || t === 's' || t === 'msg';
}

/** Called once the first level message arrives; returns true when the game should begin. */
export function onServerMsg(d: unknown, begin: () => void): void {
  if (!isServerMsg(d)) return;
  if (d.t === 'lvl') applyLevel(d, begin);
  else if (d.t === 's') applySnapshot(d);
  else {
    feed(d.m);
    if (d.sfx) playSfx(d.sfx);
  }
}

function applyLevel(d: LvlMsg, begin: () => void): void {
  S.isHost = false;
  S.level = d.L; S.quota = d.q; S.banked = 0; S.upg = d.up; S.phase = 'play';
  S.lastSeed = d.seed;
  const map = generateMap(d.seed);        // deterministic: identical to the host's map
  S.map = map;
  S.nav = new Nav(map.solids);
  buildLevelScene(map);
  S.items = [];
  d.items.forEach((t, i) => makeItem(i, t));
  const me = newPlayer(S.myId, d.idx);
  if (d.sp) { me.x = d.sp[0]; me.z = d.sp[1]; }
  me.stam = 100 + 30 * d.up.sta;
  S.me = me;
  S.mview = [];
  S.remote.clear();
  S.explored.clear();
  begin();
  feed(`LEVEL ${d.L} - quota $${d.q}`);
}

function applySnapshot(d: SnapMsg): void {
  const me = S.me;
  if (!me) return;
  S.phase = d.ph; S.banked = d.b; S.quota = d.q; S.level = d.L; S.upg = d.up;
  const seen = new Set<string>();
  for (const [id, x, z, yaw, hp, alive, idx] of d.p) {
    if (id === S.myId) { me.hp = hp; me.alive = alive === 1; me.idx = idx; }
    else { S.remote.set(id, { x, z, yaw, alive: alive === 1, idx }); seen.add(id); }
  }
  for (const id of [...S.remote.keys()]) if (!seen.has(id)) S.remote.delete(id);
  d.i.forEach((a, k) => {
    const it = S.items[k];
    if (!it) return;
    it.pos.set(a[0], a[1], a[2]);
    it.quat.set(a[3], a[4], a[5], a[6]);
    it.frac = a[7];
    it.state = a[8] as 0 | 1 | 2;
    if (!it.seen && it.view) {
      it.seen = true;
      it.view.group.position.copy(it.pos);
      it.view.group.quaternion.copy(it.quat);
    }
  });
  S.mview = d.m.map(a => ({ x: a[0], z: a[1], yaw: a[2], chasing: a[3] === 1 }));
}

let netT = 0;
export function clientSend(dt: number): void {
  const me = S.me;
  if (!me) return;
  netT += dt;
  if (netT < 0.05) return;
  netT = 0;
  sendToHost({ t: 'in', x: me.x, z: me.z, yaw: me.yaw, pitch: me.pitch, grab: me.grab, thrN: me.thrN, mv: me.mv });
}
