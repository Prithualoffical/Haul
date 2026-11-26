import type { ItemDef, MonsterKind } from './types';

export const ROOM = 13;
export const WALL_H = 3.5;
export const WALL_T = 0.6;
export const DOOR_W = 3;
export const PAD = { x1: 2, z1: 2, x2: 8, z2: 8 };
export const EYE = 1.55;
export const MAX_PLAYERS = 8;

export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export const ITEM_DEFS: ItemDef[] = [
  { kind: 'vase',     name: 'Ming Vase',     size: [0.4, 0.6, 0.4], mass: 1.5, value: 150, hp: 25,  color: 0x4a90d9 },
  { kind: 'painting', name: 'Oil Painting',  size: [0.9, 0.7, 0.1], mass: 2,   value: 250, hp: 35,  color: 0xc9a227 },
  { kind: 'radio',    name: 'Antique Radio', size: [0.6, 0.4, 0.3], mass: 3,   value: 200, hp: 50,  color: 0x8a5a3a },
  { kind: 'monitor',  name: 'CRT Monitor',   size: [0.8, 0.6, 0.4], mass: 6,   value: 400, hp: 40,  color: 0x6a707c },
  { kind: 'statue',   name: 'Marble Statue', size: [0.5, 1.0, 0.5], mass: 14,  value: 600, hp: 70,  color: 0xd8d4cc },
  { kind: 'safe',     name: 'Steel Safe',    size: [0.9, 0.9, 0.9], mass: 30,  value: 900, hp: 140, color: 0x3a5a5a },
];

export const AV_COLORS = [0x3a7bd5, 0xd5703a, 0x3ad58a, 0xd53a8a, 0xd5c93a, 0x8a3ad5, 0x3ad5d0, 0xd5453a];

/* ------------------------------------------------------------------ */
/*  Monster balance. The first version was far too deadly: chase speed */
/*  beat walking, damage was 25 and they sensed you from 18 m.         */
/*  Now: slower than a walk (except runners), weaker bites, shorter    */
/*  senses, a grace period at level start, and flares stun them.       */
/* ------------------------------------------------------------------ */
export interface MonsterDef {
  name: string; chase: number; investigate: number; patrol: number;
  vision: number;      // sight range (m) with a clear line
  hearing: number;     // multiplier on noise radius
  damage: number; cooldown: number; reach: number; scale: number;
}
export const MONSTER_DEFS: Record<MonsterKind, MonsterDef> = {
  stalker:  { name: 'Stalker',  chase: 3.2, investigate: 2.2, patrol: 1.4, vision: 13, hearing: 1.0, damage: 15, cooldown: 1.5, reach: 1.3, scale: 1.0 },
  runner:   { name: 'Runner',   chase: 4.3, investigate: 3.0, patrol: 2.1, vision: 10, hearing: 0.9, damage: 8,  cooldown: 1.1, reach: 1.2, scale: 0.88 },
  brute:    { name: 'Brute',    chase: 2.6, investigate: 1.8, patrol: 1.1, vision: 11, hearing: 0.8, damage: 30, cooldown: 2.2, reach: 1.6, scale: 1.3 },
  listener: { name: 'Listener', chase: 3.4, investigate: 2.8, patrol: 1.6, vision: 3,  hearing: 1.9, damage: 18, cooldown: 1.6, reach: 1.3, scale: 1.05 },
};
export const MONSTER_ORDER: MonsterKind[] = ['stalker', 'listener', 'runner', 'brute', 'stalker', 'listener'];
export const MONSTER_KIND_INDEX: MonsterKind[] = ['stalker', 'runner', 'brute', 'listener'];

export const BAL = {
  graceSeconds: 28,        // monsters only wander slowly at level start
  loseTrack: 2.0,          // seconds without sight before giving up the chase
  walkNoise: 2.5,          // metres at which a walking player is heard
  sprintNoise: 7,          // ... and a sprinting one
  crashNoise: 1.6,         // metres per m/s of item impact speed
  invuln: 0.9,             // seconds of immunity after being bitten
  stunSeconds: 3.5,        // flare stun
  flareRange: 9,
  reviveSeconds: 3,
  reviveRange: 1.9,
};

/* ------------------------------------------------------------------ */
/*  Shop                                                               */
/* ------------------------------------------------------------------ */
export type UpgradeKey = 'sta' | 'str' | 'spd' | 'lamp' | 'vit';
export type ShopKey = UpgradeKey | 'flare';
export interface ShopItem { key: ShopKey; name: string; desc: string; base: number }
export const SHOP: ShopItem[] = [
  { key: 'sta',   name: 'Stamina',    desc: '+30 stamina, sprint longer',            base: 300 },
  { key: 'str',   name: 'Strength',   desc: 'carry heavy items faster, throw harder', base: 350 },
  { key: 'spd',   name: 'Speed',      desc: '+10% move speed',                        base: 350 },
  { key: 'lamp',  name: 'Flashlight', desc: 'brighter, wider beam',                   base: 300 },
  { key: 'vit',   name: 'Vitality',   desc: '+25 max health',                         base: 400 },
  { key: 'flare', name: 'Flares x2',  desc: 'press F: stun nearby monsters for 3.5s', base: 200 },
];
