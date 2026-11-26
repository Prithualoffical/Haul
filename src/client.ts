import { playSfx } from './audio';
import { MONSTER_KIND_INDEX } from './config';
import { feed, showTitle } from './hud';
import { makeItem } from './items';
import { generateMap, MAP_KINDS } from './map';
import { Nav } from './nav';
import { sendToHost } from './net';
import { buildLevelScene } from './scene';
import { maxHealth, newPlayer, S } from './state';
import type { LvlMsg, ServerMsg, SnapMsg } from './types';
import { flareFx } from './visuals';

function isServerMsg(d: unknown): d is ServerMsg {
  if (typeof d !== 'object' || d === null) return false;
  const t = (d as { t?: unknown }).t;
  return t === 'lvl' || t === 's' || t === 'msg';
}

export function onServerMsg(d: unknown, begin: () => void): void {
  if (!isServerMsg(d)) return;
  if (d.t === 'lvl') applyLevel(d, begin);
  else if (d.t === 's') applySnapshot(d);
  else {
    if (d.m) feed(d.m);
    if (d.sfx) playSfx(d.sfx);
    if (d.fx) flareFx(d.fx[0], d.fx[1]);
  }
}

function applyLevel(d: LvlMsg, begin: () => void): void {
  S.isHost = false;
  S.difficulty = d.diff ?? 'easy';
  S.level = d.L; S.quota = d.q; S.banked = 0; S.upg = d.up; S.phase = 'play';
  S.wallet = d.w; S.flares = d.fl; S.levelTime = 0;
  S.cart = { x: 6.4, z: 4.5, yaw: -2.36, driver: null, driverIdx: -1 };
  S.lastSeed = d.seed;
  S.hostPeerId = d.hid;
  const map = generateMap(d.seed, d.kind);        // deterministic: identical to the host's map
  S.map = map;
  S.nav = new Nav(map.solids, map.size);
  buildLevelScene(map);
  S.items = [];
  d.items.forEach((t, i) => makeItem(i, t));
  const me = newPlayer(S.myId, d.idx);
  if (d.sp) { me.x = d.sp[0]; me.z = d.sp[1]; }
  me.stam = 100 + 30 * d.up.sta;
  me.hp = maxHealth();
  S.me = me;
  S.mview = [];
  S.remote.clear();
  S.explored.clear();
  begin();
  feed(`LEVEL ${d.L} - ${map.name} - quota $${d.q}`);
  showTitle(d.L, map.name, MAP_KINDS[map.kind].tag);
}

function applySnapshot(d: SnapMsg): void {
  const me = S.me;
  if (!me) return;
  S.phase = d.ph; S.banked = d.b; S.quota = d.q; S.level = d.L; S.upg = d.up; S.wallet = d.w; S.flares = d.fl;
  const seen = new Set<string>();
  for (const [id, x, z, yaw, hp, alive, idx, rev] of d.p) {
    if (id === S.myId) { me.hp = hp; me.alive = alive === 1; me.idx = idx; me.rev = rev; }
    else { S.remote.set(id, { x, z, yaw, alive: alive === 1, idx, rev }); seen.add(id); }
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
  S.mview = d.m.map(a => ({
    x: a[0], z: a[1], yaw: a[2], chasing: a[3] === 1, kind: MONSTER_KIND_INDEX[a[4]] ?? 'stalker', stunned: a[5] === 1,
  }));
  if (d.c) {
    S.cart.x = d.c[0]; S.cart.z = d.c[1]; S.cart.yaw = d.c[2]; S.cart.driverIdx = d.c[3];
    S.cart.driver = d.c[3] === me.idx ? S.myId : null;
  }
}

let netT = 0;
export function clientSend(dt: number): void {
  const me = S.me;
  if (!me) return;
  netT += dt;
  if (netT < 0.05) return;
  netT = 0;
  sendToHost({
    t: 'in', x: me.x, z: me.z, yaw: me.yaw, pitch: me.pitch, grab: me.grab, thrN: me.thrN, mv: me.mv,
    use: me.use, flN: me.flN, cartN: me.cartN,
  });
}
