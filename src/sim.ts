import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { DataConnection } from 'peerjs';
import { playSfx } from './audio';
import {
  BAL, CART_OFFSETS, CART_SLOTS, DIFFICULTIES, EYE, ITEM_DEFS, MAX_PLAYERS, MONSTER_DEFS,
  MONSTER_KIND_INDEX, MONSTER_ORDER, PAD, ROOM, WALL_H, type ShopKey,
} from './config';
import { feed, showTitle } from './hud';
import { makeItem, pickItem } from './items';
import { generateMap, MAP_KIND_LIST, MAP_KINDS } from './map';
import { Nav } from './nav';
import { conns, sendAll, sendTo } from './net';
import { buildLevelScene } from './scene';
import { tryBuy } from './shop';
import { maxHealth, newPlayer, S } from './state';
import type {
  InputMsg, Item, LvlMsg, MapData, MapKind, Monster, MonsterKind, Player, Sfx, SnapMsg,
} from './types';
import { clamp, dirFrom, finite, r2, r3 } from './util';
import { flareFx } from './visuals';

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();

/* ====================================================================== */
/*  Messaging helpers                                                      */
/* ====================================================================== */
export function say(text: string, sfx?: Sfx, fx?: [number, number]): void {
  feed(text);
  if (sfx) playSfx(sfx);
  if (fx) flareFx(fx[0], fx[1]);
  sendAll({ t: 'msg', m: text, sfx, fx });
}

function spawnPlayer(p: Player): void {
  p.x = 3 + (p.idx % 4) * 1.35;
  p.z = 3 + Math.floor(p.idx / 4) * 1.7;
  if (p === S.me) { p.yaw = -2.36; p.pitch = 0; }
}

function lvlMsg(c: DataConnection | null): LvlMsg {
  const pl = c ? S.players.get(c.peer) : undefined;
  return {
    t: 'lvl', seed: S.lastSeed, kind: S.map ? S.map.kind : 'manor', diff: S.difficulty,
    L: S.level, q: S.quota, up: S.upg,
    w: S.wallet, fl: S.flares, items: S.items.map(i => i.type), you: c ? c.peer : null,
    sp: pl ? [pl.x, pl.z] : null, idx: pl ? pl.idx : 0, hid: S.hostPeerId,
  };
}
function broadcastLevel(): void {
  for (const c of conns) sendTo(c, lvlMsg(c));
}

/* ====================================================================== */
/*  Level loading (host only)                                              */
/* ====================================================================== */
function makeWorld(map: MapData): CANNON.World {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.12;
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  const ceil = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ceil.position.set(0, WALL_H, 0);
  ceil.quaternion.setFromEuler(Math.PI / 2, 0, 0);
  world.addBody(ceil);
  for (const s of map.solids) {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3((s.x2 - s.x1) / 2, s.h / 2, (s.z2 - s.z1) / 2)) });
    b.position.set((s.x1 + s.x2) / 2, s.h / 2, (s.z1 + s.z2) / 2);
    world.addBody(b);
  }
  return world;
}

function addBody(world: CANNON.World, it: Item, yaw: number): void {
  const [sx, sy, sz] = it.def.size;
  const b = new CANNON.Body({
    mass: it.def.mass, shape: new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)),
    linearDamping: 0.05, angularDamping: 0.4,
  });
  b.position.set(it.pos.x, it.pos.y, it.pos.z);
  b.quaternion.setFromEuler(0, yaw, 0);
  b.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
    const imp = Math.abs(e.contact.getImpactVelocityAlongNormal());
    const now = performance.now() / 1000;
    if (imp < 2 || now < S.armTime || it.state !== 0 || now - it.lastHit < 0.1) return;
    it.lastHit = now;
    addNoise(b.position.x, b.position.z, Math.min(16, imp * BAL.crashNoise));
    if (imp > 2.5) {
      it.hp -= (imp - 2.5) * 4;
      if (it.hp <= 0) it.broke = true;
    }
  });
  it.body = b;
  world.addBody(b);
}

function spawnItems(world: CANNON.World, map: MapData, nav: Nav, players: number): void {
  const reach = nav.reachMap((PAD.x1 + PAD.x2) / 2, (PAD.z1 + PAD.z2) / 2);
  const rooms = map.rooms.filter(r => !(r.rx === 0 && r.rz === 0));
  const weights = rooms.map(r => 1 + r.tier * 0.5);
  const sum = weights.reduce((a, b) => a + b, 0);
  const pickRoom = () => {
    let t = Math.random() * sum;
    for (let i = 0; i < rooms.length; i++) { t -= weights[i]; if (t <= 0) return rooms[i]; }
    return rooms[rooms.length - 1];
  };
  const minCount = 10 + 3 * S.level + 3 * (players - 1) + (map.n - 3) * 6;
  let total = 0, count = 0, guard = 0;
  while ((count < minCount || total < S.quota * 1.6) && guard++ < 900) {
    const room = pickRoom();
    // deeper rooms skew towards the valuable, heavy items
    const e = Math.max(0.5, 1.6 - (1.1 * room.tier) / Math.max(1, map.maxTier));
    const type = Math.min(ITEM_DEFS.length - 1, Math.floor(Math.pow(Math.random(), e) * ITEM_DEFS.length));
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 40 && !ok; k++) {
      x = room.x1 + 1.4 + Math.random() * (ROOM - 2.8);
      z = room.z1 + 1.4 + Math.random() * (ROOM - 2.8);
      ok = nav.reachable(reach, x, z) && !map.solids.some(s => x > s.x1 - 0.9 && x < s.x2 + 0.9 && z > s.z1 - 0.9 && z < s.z2 + 0.9);
    }
    if (!ok) continue;
    const it = makeItem(S.items.length, type);
    it.pos.set(x, it.def.size[1] / 2 + 0.02, z);
    it.seen = true;
    const yaw = Math.random() * Math.PI * 2;
    it.quat.setFromEuler(new THREE.Euler(0, yaw, 0));
    addBody(world, it, yaw);
    total += it.def.value;
    count++;
  }
}

function spawnMonsters(map: MapData, nav: Nav, players: number): void {
  S.monsters = [];
  const diff = DIFFICULTIES[S.difficulty];
  const n = Math.min(7, 1 + diff.extraMonsters + Math.floor((S.level - 1) / 2) + Math.floor((players - 1) / 3) + (S.level >= 2 && map.n >= 5 ? 1 : 0));
  const reach = nav.reachMap((PAD.x1 + PAD.x2) / 2, (PAD.z1 + PAD.z2) / 2);
  const lairs = map.rooms.filter(r => r.tier >= Math.max(3, map.maxTier - 2));
  for (let k = 0; k < n; k++) {
    const room = lairs[Math.floor(Math.random() * lairs.length)];
    let x = (room.x1 + room.x2) / 2, z = (room.z1 + room.z2) / 2;
    for (let t = 0; t < 60; t++) {
      const px = room.x1 + 2 + Math.random() * (ROOM - 4), pz = room.z1 + 2 + Math.random() * (ROOM - 4);
      if (nav.isFree(px, pz) && nav.reachable(reach, px, pz) && Math.hypot(px - 5, pz - 5) > 18) { x = px; z = pz; break; }
    }
    const kind: MonsterKind = MONSTER_ORDER[k % MONSTER_ORDER.length];
    S.monsters.push({
      kind, x, z, yaw: 0, state: 'patrol', path: null, pi: 0, rp: 0, has: false,
      wait: 2 + Math.random() * 3, tx: 0, tz: 0, lost: 0, atk: 0, stun: 0,
    });
  }
}

let lastKind: MapKind | null = null;
/** 'random' never plays the same location twice in a row, so every level feels like a new place. */
function pickKind(): MapKind {
  let k: MapKind;
  if (S.mapChoice === 'random') {
    const options = MAP_KIND_LIST.filter(x => x !== lastKind);
    k = options[Math.floor(Math.random() * options.length)];
  } else k = S.mapChoice;
  lastKind = k;
  return k;
}

export function hostLoadLevel(n: number): void {
  const players = S.players.size;
  const diff = DIFFICULTIES[S.difficulty];
  S.level = n;
  S.phase = 'play';
  S.banked = 0;
  S.levelTime = 0;
  S.quota = Math.round(((1500 + 800 * (n - 1)) * (1 + 0.3 * (players - 1)) * diff.quotaMul) / 50) * 50;
  S.cart = { x: 6.4, z: 4.5, yaw: -2.36, driver: null, driverIdx: -1 };
  S.lastSeed = (Math.random() * 1e9) | 0;
  const map = generateMap(S.lastSeed, pickKind());
  S.map = map;
  const nav = new Nav(map.solids, map.size);
  S.nav = nav;
  buildLevelScene(map);
  S.items = [];
  S.explored.clear();
  const world = makeWorld(map);
  S.world = world;
  spawnItems(world, map, nav, players);
  spawnMonsters(map, nav, players);
  S.armTime = performance.now() / 1000 + 1.5;
  for (const p of S.players.values()) {
    p.hp = maxHealth(); p.alive = true; p.held = null; p.grab = false; p.wasGrab = false;
    p.inv = 2; p.rev = 0;
    spawnPlayer(p);
  }
  if (S.me) S.me.stam = 100 + 30 * S.upg.sta;
  broadcastLevel();
  feed(`LEVEL ${n} - ${map.name} - quota $${S.quota}`);
  showTitle(n, map.name, MAP_KINDS[map.kind].tag);
}

/* ---- between-level shop (host only; the wallet is shared by the team) ---- */
export function hostBuy(key: ShopKey): void {
  if (S.phase !== 'clear') return;
  if (tryBuy(key)) say('Purchased', 'buy');
  else feed('Not enough money');
}
export function hostContinue(): void {
  if (S.phase === 'clear') hostLoadLevel(S.level + 1);
}
export function hostRestart(): void {
  if (S.phase !== 'dead') return;
  S.upg = { sta: 0, str: 0, spd: 0, lamp: 0, vit: 0 };
  S.wallet = 0;
  S.flares = DIFFICULTIES[S.difficulty].startFlares;
  hostLoadLevel(1);
}

/* ====================================================================== */
/*  Players joining / leaving / input                                      */
/* ====================================================================== */
export function onPlayerJoin(c: DataConnection): void {
  if (S.players.size >= MAX_PLAYERS) {
    sendTo(c, { t: 'msg', m: 'Lobby is full (8 players max)' });
    setTimeout(() => c.close(), 400);
    return;
  }
  const used = new Set([...S.players.values()].map(p => p.idx));
  let idx = 0;
  while (used.has(idx)) idx++;
  const p = newPlayer(c.peer, idx);
  p.hp = maxHealth();
  spawnPlayer(p);
  S.players.set(c.peer, p);
  sendTo(c, lvlMsg(c));
  say(`Player ${idx + 1} joined`);
}
export function onPlayerLeave(c: DataConnection): void {
  const p = S.players.get(c.peer);
  if (p) {
    p.held = null;
    if (S.cart.driver === p.id) { S.cart.driver = null; S.cart.driverIdx = -1; }
    S.players.delete(c.peer);
    feed(`Player ${p.idx + 1} left`);
  }
}
function isInput(d: unknown): d is InputMsg {
  return typeof d === 'object' && d !== null && (d as { t?: unknown }).t === 'in';
}
export function onPlayerData(c: DataConnection, d: unknown): void {
  if (!isInput(d)) return;
  const p = S.players.get(c.peer);
  const size = S.map ? S.map.size : 39;
  if (!p) return;
  if (p.alive) { p.x = clamp(finite(d.x), 0, size); p.z = clamp(finite(d.z), 0, size); }
  p.yaw = finite(d.yaw);
  p.pitch = clamp(finite(d.pitch), -1.5, 1.5);
  p.grab = !!d.grab;
  p.use = !!d.use;
  p.thrN = finite(d.thrN);
  p.flN = finite(d.flN);
  p.cartN = finite(d.cartN);
  p.mv = finite(d.mv) | 0;
}

/* ====================================================================== */
/*  Noise & monster AI                                                     */
/* ====================================================================== */
const inGrace = (): boolean => S.levelTime < DIFFICULTIES[S.difficulty].graceSeconds;

export function addNoise(x: number, z: number, loud: number): void {
  if (!S.isHost || inGrace()) return;
  const sense = DIFFICULTIES[S.difficulty].senseMul;
  for (const m of S.monsters) {
    if (m.state === 'chase' || m.stun > 0) continue;
    if (Math.hypot(m.x - x, m.z - z) < loud * MONSTER_DEFS[m.kind].hearing * sense) setTarget(m, x, z, 'investigate');
  }
}
function setTarget(m: Monster, x: number, z: number, state: Monster['state']): void {
  m.tx = x; m.tz = z; m.state = state; m.rp = 0; m.has = true;
}

function updateMonster(m: Monster, nav: Nav, dt: number): void {
  const def = MONSTER_DEFS[m.kind];
  const diff = DIFFICULTIES[S.difficulty];
  if (m.stun > 0) { m.stun -= dt; return; }          // frozen by a flare

  const grace = inGrace();
  let near: Player | null = null;
  let nd = Infinity;
  for (const p of S.players.values()) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - m.x, p.z - m.z);
    if (d < nd) { nd = d; near = p; }
  }
  const sees = near !== null && nd < def.vision * diff.senseMul && nav.lineClear(m.x, m.z, near.x, near.z);
  if (!grace && near && (sees || nd < 2)) {
    if (m.state !== 'chase') m.rp = 0;
    m.state = 'chase'; m.tx = near.x; m.tz = near.z; m.has = true; m.lost = 0;
  } else if (m.state === 'chase') {
    m.lost += dt;
    if (m.lost > BAL.loseTrack || grace) { m.state = 'investigate'; m.rp = 0; }
  }
  if (grace && m.state === 'investigate') m.state = 'patrol';

  m.rp -= dt;
  if (m.has && m.rp <= 0) {
    m.path = nav.findPath(m.x, m.z, m.tx, m.tz);
    m.pi = 0;
    m.rp = m.state === 'chase' ? 0.4 : 99;
    if (!m.path) { m.has = false; m.state = 'patrol'; }
  }

  const speed = (m.state === 'chase' ? def.chase + 0.08 * S.level : m.state === 'investigate' ? def.investigate : def.patrol) * diff.speedMul;
  let mx: number | null = null, mz: number | null = null;
  if (m.has) {
    if (m.state === 'chase' && near && nd < 2.5 && sees) { mx = near.x; mz = near.z; }
    else if (m.path && m.pi < m.path.length) {
      const w = m.path[m.pi];
      if (Math.hypot(w.x - m.x, w.z - m.z) < 0.35) m.pi++;
      else { mx = w.x; mz = w.z; }
    }
    if (m.path && m.pi >= m.path.length && m.state !== 'chase') {
      m.has = false; m.state = 'patrol'; m.wait = 2 + Math.random() * 3;
    }
  } else {
    m.wait -= dt;
    if (m.wait <= 0) {
      let x = 0, z = 0;
      for (let k = 0; k < 40; k++) {
        if (near && Math.random() < 0.35) { x = near.x + (Math.random() - 0.5) * 16; z = near.z + (Math.random() - 0.5) * 16; }
        else { x = Math.random() * nav.size; z = Math.random() * nav.size; }
        if (nav.isFree(x, z)) break;
      }
      setTarget(m, x, z, 'patrol');
      m.wait = 1.5 + Math.random() * 2.5;
    }
  }
  if (mx !== null && mz !== null) {
    const dx = mx - m.x, dz = mz - m.z, d = Math.hypot(dx, dz) || 1;
    m.x += (dx / d) * speed * dt;
    m.z += (dz / d) * speed * dt;
    m.yaw = Math.atan2(-dx, -dz);
  }

  m.atk -= dt;
  if (!grace && near && nd < def.reach && m.atk <= 0 && near.inv <= 0 && nav.lineClear(m.x, m.z, near.x, near.z)) {
    near.hp -= Math.round(def.damage * diff.dmgMul);
    near.inv = BAL.invuln;
    m.atk = def.cooldown;
    if (near.hp <= 0) {
      near.hp = 0; near.alive = false; near.held = null; near.rev = 0;
      say(`Player ${near.idx + 1} was killed by a ${def.name}. Hold E near the body to revive.`, 'death');
    }
  }
}

/** A flare: monsters close by (and in front of the thrower, or very near) are stunned and lose the chase. */
function fireFlare(p: Player): void {
  S.flares--;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  let hit = 0;
  for (const m of S.monsters) {
    const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
    if (d > BAL.flareRange) continue;
    if (d > 3.5 && (dx * fx + dz * fz) / Math.max(d, 1e-3) < 0.15) continue;
    m.stun = BAL.stunSeconds;
    if (m.state === 'chase') { m.state = 'investigate'; m.has = false; m.lost = 0; }
    hit++;
  }
  say(`Player ${p.idx + 1} fired a flare${hit ? ` - ${hit} stunned` : ''} (${S.flares} left)`, 'flare', [p.x, p.z]);
}

/* ====================================================================== */
/*  Per-frame host simulation                                              */
/* ====================================================================== */
export function hostStep(dt: number): void {
  const world = S.world, nav = S.nav;
  if (!world || !nav) return;
  if (S.phase === 'play') S.levelTime += dt;
  world.step(1 / 60, dt, 4);

  const held = new Set<Item>();
  for (const p of S.players.values()) if (p.held) held.add(p.held);

  for (const it of S.items) {
    if (it.state !== 0 || !it.body) continue;
    const b = it.body;
    if (it.cartSlot < 0) {
      it.pos.set(b.position.x, b.position.y, b.position.z);
      it.quat.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
    it.frac = Math.max(0, it.hp / it.def.hp);
    if (it.broke) {
      it.state = 2;
      it.cartSlot = -1;
      world.removeBody(b);
      for (const p of S.players.values()) if (p.held === it) p.held = null;
      say(`${it.def.name} destroyed (-$${it.def.value})`, 'break');
      continue;
    }
    const onPad = it.pos.y < 1.8 && it.pos.x > PAD.x1 && it.pos.x < PAD.x2 && it.pos.z > PAD.z1 && it.pos.z < PAD.z2;
    if (onPad && !held.has(it)) {
      it.zt += dt;
      if (it.zt > 0.8) {
        const v = Math.round(it.def.value * it.frac);
        S.banked += v;
        it.state = 1;
        it.cartSlot = -1;
        world.removeBody(b);
        say(`+$${v} ${it.def.name} extracted`, 'extract');
      }
    } else it.zt = 0;
  }

  const str = 1 + 0.3 * S.upg.str;
  const all = [...S.players.values()];
  for (const p of all) {
    p.inv = Math.max(0, p.inv - dt);
    if (!p.alive) {
      p.held = null;
      if (S.cart.driver === p.id) { S.cart.driver = null; S.cart.driverIdx = -1; }
      // revive: a living teammate holds E next to the body
      let reviving = false;
      for (const o of all) if (o.alive && o.use && Math.hypot(o.x - p.x, o.z - p.z) < BAL.reviveRange) { reviving = true; break; }
      p.rev = reviving ? p.rev + dt : Math.max(0, p.rev - dt * 2);
      if (p.rev >= BAL.reviveSeconds) {
        p.alive = true; p.hp = Math.round(maxHealth() * 0.5); p.rev = 0; p.inv = 2.5;
        say(`Player ${p.idx + 1} was revived!`, 'revive');
      }
      continue;
    }
    dirFrom(p.yaw, p.pitch, _dir);
    _eye.set(p.x, EYE, p.z);

    if (p.flN !== p.lastFl) {
      p.lastFl = p.flN;
      if (S.flares > 0 && S.phase === 'play') fireFlare(p);
    }
    if (p.cartN !== p.lastCart) {
      p.lastCart = p.cartN;
      if (S.cart.driver === p.id) {
        S.cart.driver = null; S.cart.driverIdx = -1;
      } else if (!S.cart.driver && Math.hypot(S.cart.x - p.x, S.cart.z - p.z) < 2.6) {
        S.cart.driver = p.id; S.cart.driverIdx = p.idx;
      }
    }
    if (p.thrN !== p.lastThr) {
      p.lastThr = p.thrN;
      if (p.held && p.held.state === 0 && p.held.body) {
        const b = p.held.body;
        const sp = (14 * str) / (1 + b.mass * 0.25);
        b.velocity.set(_dir.x * sp, _dir.y * sp + 1, _dir.z * sp);
        p.held = null;
        p.grab = false;
      }
    }
    if (p.grab && !p.wasGrab && !p.held) {
      const r = pickItem(_eye, _dir, 4);
      if (r && !held.has(r.it)) { p.held = r.it; p.held.cartSlot = -1; p.hd = clamp(r.t, 1.4, 2.6); }
    }
    if (!p.grab) p.held = null;
    p.wasGrab = p.grab;
    if (p.held && (p.held.state !== 0 || !p.held.body)) p.held = null;
    if (p.held && p.held.body) {
      const b = p.held.body;
      const tx = _eye.x + _dir.x * p.hd, ty = Math.max(0.35, _eye.y + _dir.y * p.hd), tz = _eye.z + _dir.z * p.hd;
      let vx = (tx - b.position.x) * 10, vy = (ty - b.position.y) * 10, vz = (tz - b.position.z) * 10;
      const maxV = (7 * str) / (1 + b.mass * 0.12);
      const len = Math.hypot(vx, vy, vz);
      if (len > maxV) { const k = maxV / len; vx *= k; vy *= k; vz *= k; }
      b.velocity.set(vx, vy, vz);
      b.angularVelocity.scale(0.85, b.angularVelocity);
    }

    if (p.mv > 0) {
      p.nt -= dt;
      if (p.nt <= 0) { addNoise(p.x, p.z, p.mv === 2 ? BAL.sprintNoise : BAL.walkNoise); p.nt = 0.5; }
    }
    for (const it of S.items) {            // walking into loose items nudges them
      if (it.state !== 0 || p.held === it || it.cartSlot >= 0 || it.pos.y > 1.6 || !it.body) continue;
      const dx = it.pos.x - p.x, dz = it.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.8 && d > 0.001) {
        const k = ((0.8 - d) * 8) / (1 + it.def.mass * 0.2);
        it.body.velocity.x += (dx / d) * k;
        it.body.velocity.z += (dz / d) * k;
      }
    }
  }

  /* ---- carriage vehicle movement & item loading ---- */
  if (S.cart.driver) {
    const dp = S.players.get(S.cart.driver);
    if (!dp || !dp.alive) {
      S.cart.driver = null; S.cart.driverIdx = -1;
    } else {
      const tx = dp.x - Math.sin(dp.yaw) * 1.45;
      const tz = dp.z - Math.cos(dp.yaw) * 1.45;
      [S.cart.x, S.cart.z] = nav.collide(tx, tz, 0.65);
      S.cart.yaw = dp.yaw;
    }
  }
  const usedSlots = new Set<number>();
  for (const it of S.items) if (it.state === 0 && it.cartSlot >= 0) usedSlots.add(it.cartSlot);
  const cy = Math.cos(S.cart.yaw), sy = Math.sin(S.cart.yaw);
  for (const it of S.items) {
    if (it.state !== 0 || !it.body) continue;
    if (it.cartSlot < 0 && !held.has(it) && it.pos.y < 1.5 && Math.hypot(it.pos.x - S.cart.x, it.pos.z - S.cart.z) < 0.95) {
      for (let slot = 0; slot < CART_SLOTS; slot++) {
        if (!usedSlots.has(slot)) { it.cartSlot = slot; usedSlots.add(slot); break; }
      }
    }
    if (it.cartSlot >= 0) {
      const [ox, oz] = CART_OFFSETS[it.cartSlot];
      const sx = S.cart.x + ox * cy + oz * sy;
      const sz = S.cart.z - ox * sy + oz * cy;
      const syPos = 0.36 + it.def.size[1] / 2;
      it.pos.set(sx, syPos, sz);
      it.quat.setFromEuler(new THREE.Euler(0, S.cart.yaw, 0));
      it.body.position.set(sx, syPos, sz);
      it.body.velocity.set(0, 0, 0);
      it.body.angularVelocity.scale(0, it.body.angularVelocity);
      it.body.quaternion.setFromEuler(0, S.cart.yaw, 0);
    }
  }

  for (const m of S.monsters) updateMonster(m, nav, dt);

  if (S.phase === 'play') {
    if (S.banked >= S.quota) {
      S.phase = 'clear';
      const alive = all.filter(p => p.alive).length;
      const pay = 300 + Math.max(0, S.banked - S.quota) + 50 * alive;
      S.wallet += pay;
      say(`QUOTA MET! +$${pay} team bonus - visit the shop`);
    } else if (all.every(p => !p.alive)) { S.phase = 'dead'; say('EVERYONE IS DEAD'); }
  }
}

/* ====================================================================== */
/*  Snapshots                                                              */
/* ====================================================================== */
export function snapshot(): SnapMsg {
  return {
    t: 's', ph: S.phase, b: S.banked, q: S.quota, L: S.level, up: S.upg, w: S.wallet, fl: S.flares,
    p: [...S.players.values()].map(p => [
      p.id === 'host' ? S.hostPeerId : p.id, r2(p.x), r2(p.z), r2(p.yaw), Math.round(p.hp), p.alive ? 1 : 0, p.idx, r2(p.rev),
    ]),
    i: S.items.map(it => [
      r2(it.pos.x), r2(it.pos.y), r2(it.pos.z),
      r3(it.quat.x), r3(it.quat.y), r3(it.quat.z), r3(it.quat.w), r2(it.frac), it.state,
    ]),
    m: S.monsters.map(m => [
      r2(m.x), r2(m.z), r2(m.yaw), m.state === 'chase' ? 1 : 0, MONSTER_KIND_INDEX.indexOf(m.kind), m.stun > 0 ? 1 : 0,
    ]),
    c: [r2(S.cart.x), r2(S.cart.z), r2(S.cart.yaw), S.cart.driverIdx],
  };
}

let snapT = 0;
export function hostBroadcast(dt: number): void {
  snapT += dt;
  if (snapT < 1 / 15 || conns.length === 0) return;
  snapT = 0;
  sendAll(snapshot());
}
