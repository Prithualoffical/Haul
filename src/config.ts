import type { ItemDef } from './types';

export const W = 39;          // arena is W x W metres (3x3 rooms)
export const ROOM = 13;
export const WALL_H = 3.5;
export const WALL_T = 0.6;
export const DOOR_W = 3;
export const PAD = { x1: 2, z1: 2, x2: 8, z2: 8 };
export const EYE = 1.55;

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

export const AV_COLORS = [0x3a7bd5, 0xd5703a, 0x3ad58a, 0xd53a8a, 0xd5c93a, 0x8a3ad5];
