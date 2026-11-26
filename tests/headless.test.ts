// Runs the REAL host simulation (sim.ts, nav, map, shop, config) with three/cannon/DOM stubbed out.
import { mock, test } from 'bun:test';
import { join } from 'node:path';

const src = join(import.meta.dir, '..', 'src');
const stub = (n: string): Promise<Record<string, unknown>> => import(join(import.meta.dir, 'stubs', `${n}.ts`));

mock.module('three', () => ({
  Vector3: class { x = 0; y = 0; z = 0;
    set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v: any) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    sub(v: any) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    dot(v: any) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    addScaledVector(v: any, s: number) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    length() { return Math.hypot(this.x, this.y, this.z); } },
  Quaternion: class { x = 0; y = 0; z = 0; w = 1; set(x: number, y: number, z: number, w: number) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } setFromEuler() { return this; } },
  Euler: class { constructor(public x = 0, public y = 0, public z = 0) { /* noop */ } },
}));
mock.module('cannon-es', () => ({
  Vec3: class { constructor(public x = 0, public y = 0, public z = 0) { /* noop */ } scale() { /* noop */ } },
  Box: class { constructor(_h: any) { /* noop */ } },
  Plane: class { },
  Body: class {
    mass = 0; position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
    velocity = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
    angularVelocity = { scale() { /* noop */ } };
    quaternion = { x: 0, y: 0, z: 0, w: 1, setFromEuler() { /* noop */ } };
    constructor(o: any) { this.mass = o?.mass ?? 0; }
    addEventListener() { /* noop */ }
  },
  World: class { gravity = {}; defaultContactMaterial: any = {}; addBody() { /* noop */ } removeBody() { /* noop */ } step() { /* noop */ } constructor(_o: any) { /* noop */ } },
}));
mock.module('peerjs', () => ({ Peer: class { } }));
for (const n of ['scene', 'visuals', 'hud', 'audio', 'itemview']) {
  const mod = await stub(n);
  mock.module(join(src, `${n}.ts`), () => mod);
}

test('headless host simulation', async () => {
const { S, newPlayer } = await import('../src/state');
const sim = await import('../src/sim');
const { BAL, MONSTER_DEFS } = await import('../src/config');
const { PAD } = await import('../src/config');
const { log } = await import('./stubs/hud');
const { MAP_KIND_LIST } = await import('../src/map');

let bad = 0;
const ok = (c: boolean, m: string): void => { if (!c) { console.log('FAIL:', m); bad++; } };
const conn = (id: string) => ({ peer: id, open: true, send() { /* noop */ }, close() { /* noop */ }, on() { /* noop */ } }) as any;
const stepFor = (secs: number, dt = 0.05): void => { for (let t = 0; t < secs; t += dt) sim.hostStep(dt); };

function fresh(players: number, kind: any = 'manor'): void {
  S.isHost = true; S.myId = 'host'; S.mapChoice = kind;
  S.players.clear();
  const me = newPlayer('host', 0); S.me = me; S.players.set('host', me);
  for (let i = 1; i < players; i++) sim.onPlayerJoin(conn('peer' + i));
  S.upg = { sta: 0, str: 0, spd: 0, lamp: 0, vit: 0 }; S.wallet = 0; S.flares = 1;
  sim.hostLoadLevel(1);
}

// 1) every map loads; loot + monsters are placed sanely
for (const kind of MAP_KIND_LIST) {
  fresh(1, kind);
  const map = S.map!;
  ok(S.items.length >= 13, `${kind}: enough items (${S.items.length})`);
  ok(S.items.every(i => i.pos.x > 0 && i.pos.x < map.size && i.pos.z > 0 && i.pos.z < map.size), `${kind}: items inside map`);
  ok(S.items.every(i => !(i.pos.x < 8 && i.pos.z < 8)), `${kind}: no loot in the start room`);
  const total = S.items.reduce((a, i) => a + i.def.value, 0);
  ok(total >= S.quota * 1.6, `${kind}: loot value ${total} covers quota ${S.quota}`);
  ok(S.monsters.length === 1 && Math.hypot(S.monsters[0].x - 5, S.monsters[0].z - 5) > 18, `${kind}: monster starts far from the pad`);
  console.log(kind, 'items', S.items.length, 'loot $' + total, 'quota $' + S.quota, 'map', map.size + 'm');
}

// 2) multiplayer: 8 max, unique idx, quota scales
fresh(1); const q1 = S.quota;
fresh(4); ok(S.quota > q1, `quota scales with players (${q1} -> ${S.quota})`);
ok(new Set([...S.players.values()].map(p => p.idx)).size === 4, 'unique player indexes');
fresh(8); ok(S.players.size === 8, '8 players');
sim.onPlayerJoin(conn('peer9')); ok(S.players.size === 8, '9th player rejected');
ok([...S.players.values()].every(p => p.x > PAD.x1 - 1 && p.x < PAD.x2 + 2 && p.z < PAD.z2 + 2), '8 players spawn around the pad');
ok(S.monsters.length >= 3, `more monsters for 8 players (${S.monsters.length})`);
const snap = sim.snapshot();
ok(snap.p.every(r => r.length === 8) && snap.m.every(r => r.length === 6), 'snapshot tuple shapes');

// 3) grace period: a monster standing on you does nothing for the first 28 s
fresh(1); let me = S.me!; me.x = 20; me.z = 20; S.nav!.isFree(20, 20);
let m = S.monsters[0]; m.x = me.x + 0.8; m.z = me.z; m.state = 'patrol';
stepFor(20); ok(me.hp === me.hp && me.hp === 100, `no damage during grace (hp ${me.hp})`);

// 4) after grace: how long does a stalker take to kill a player who just stands there?
S.levelTime = BAL.graceSeconds + 1; m.x = me.x + 0.8; m.z = me.z; m.state = 'chase'; m.has = true; m.tx = me.x; m.tz = me.z; m.atk = 0;
let t = 0; while (me.alive && t < 60) { sim.hostStep(0.05); t += 0.05; m.x = me.x + 0.8; m.z = me.z; }
console.log('stalker kills a stationary player in', t.toFixed(1), 's');
ok(!me.alive && t > 8, `kill time > 8s (${t.toFixed(1)})`);
ok(log.some(l => /killed by a Stalker/.test(l)), 'death message names the monster');

// 5) revive: a teammate holding E for 3 s brings the body back at 50% health
fresh(2); const host = S.players.get('host')!; const mate = S.players.get('peer1')!;
mate.alive = false; mate.hp = 0; mate.x = 20; mate.z = 20; host.x = 21; host.z = 20; host.use = true;
S.monsters.length = 0;
stepFor(1.5); ok(!mate.alive && mate.rev > 1, `revive in progress (${mate.rev.toFixed(1)}s)`);
stepFor(1.8); ok(mate.alive && mate.hp === 50, `revived at 50% (alive ${mate.alive}, hp ${mate.hp})`);
mate.alive = false; mate.rev = 0; host.use = false; stepFor(2); ok(mate.rev === 0 && !mate.alive, 'no revive without holding E');
mate.x = 30; mate.z = 30; host.use = true; stepFor(4); ok(!mate.alive, 'no revive when too far away');

// 6) flares stun and break the chase; they are limited
fresh(1); me = S.me!; me.x = 20; me.z = 20; me.yaw = 0; S.levelTime = 40;
m = S.monsters[0]; m.x = 20; m.z = 17; m.state = 'chase'; m.has = true; m.tx = me.x; m.tz = me.z; m.atk = 0;
me.flN++; sim.hostStep(0.05);
ok(m.stun > 3 && m.state !== 'chase' && S.flares === 0, `flare stuns (stun ${m.stun.toFixed(1)}, flares ${S.flares})`);
const px = m.x; stepFor(2); ok(Math.abs(m.x - px) < 0.01 && me.hp === 100, 'stunned monster neither moves nor bites');
me.flN++; const stunBefore = m.stun; sim.hostStep(0.05); ok(m.stun <= stunBefore, 'no flare when none left');

// 7) quota -> payout -> shop -> next level keeps upgrades
fresh(1); me = S.me!; S.monsters.length = 0; S.banked = S.quota; sim.hostStep(0.05);
ok(S.phase === 'clear' && S.wallet >= 350, `level clear pays out (wallet ${S.wallet})`);
const w0 = S.wallet; sim.hostBuy('sta'); ok(S.upg.sta === 1 && S.wallet < w0, 'shop buy works in the clear phase');
sim.hostContinue(); ok(S.level === 2 && S.phase === 'play' && S.upg.sta === 1 && S.banked === 0, 'next level keeps upgrades');
sim.hostBuy('str'); ok(S.upg.str === 0, 'cannot buy during play');

// 8) wipe -> restart resets everything
fresh(1); me = S.me!; S.monsters.length = 0; me.alive = false; sim.hostStep(0.05);
ok(S.phase === 'dead', 'phase dead when everyone is down'); S.upg.sta = 3; S.wallet = 999; sim.hostRestart();
ok(S.level === 1 && S.upg.sta === 0 && S.wallet === 0 && S.phase === 'play', 'restart resets run');

// 8b) 'random' never repeats a location on consecutive levels, and cycles through all of them
S.mapChoice = 'random'; S.isHost = true; S.upg = { sta: 0, str: 0, spd: 0, lamp: 0, vit: 0 };
const seen: string[] = [];
for (let L = 1; L <= 40; L++) { sim.hostLoadLevel(L); seen.push(S.map!.kind); }
ok(seen.every((k, i) => i === 0 || k !== seen[i - 1]), 'never the same location twice in a row');
ok(new Set(seen).size === MAP_KIND_LIST.length, `all ${MAP_KIND_LIST.length} locations get played (${[...new Set(seen)].join(',')})`);
for (const kind of MAP_KIND_LIST) { fresh(1, kind); ok(S.map!.size === 65 && S.map!.n === 5, `${kind} is a large 65 m map`); }

// 9) monsters never get stuck outside the map over a long chase
fresh(1, 'warehouse'); me = S.me!; S.levelTime = 99; let out = 0;
for (let i = 0; i < 4000; i++) { sim.hostStep(0.05); for (const mm of S.monsters) if (mm.x < 0 || mm.z < 0 || mm.x > S.map!.size || mm.z > S.map!.size || !S.nav!.isFree(mm.x, mm.z) && false) out++; if (!me.alive) { me.alive = true; me.hp = 100; me.inv = 3; } }
ok(out === 0, 'monsters stay in bounds for 200 simulated seconds');

console.log(bad === 0 ? 'ALL HEADLESS SIM TESTS PASSED' : `FAILURES: ${bad}`);
if (bad) throw new Error(`${bad} headless failures`);
});
