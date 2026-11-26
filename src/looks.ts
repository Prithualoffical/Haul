import type { Textures } from './textures';
import type { MapKind } from './types';

/** Each location has its own atmosphere, so levels feel like different places and not re-skins of one. */
export interface Look {
  fog: number; density: number;          // distance fog colour + thickness
  ambient: number; ambientI: number;     // the faint fill light
  wall: keyof Textures; wallTint: number;
  ceilTint: number; base: number; frame: number;
  lampI: number;                         // brightness of ceiling lamps
}

export const LOOKS: Record<MapKind, Look> = {
  manor:     { fog: 0x020304, density: 0.048, ambient: 0x9098b0, ambientI: 0.40, wall: 'plaster',   wallTint: 0xffffff, ceilTint: 0x9a9a92, base: 0x1a1410, frame: 0x24160d, lampI: 7 },
  asylum:    { fog: 0x020a07, density: 0.052, ambient: 0x90b8a8, ambientI: 0.36, wall: 'whitetile', wallTint: 0xb8c8c0, ceilTint: 0xa0aaa4, base: 0x203028, frame: 0x2a3a30, lampI: 7 },
  facility:  { fog: 0x02060d, density: 0.044, ambient: 0x90a8d8, ambientI: 0.42, wall: 'panel',     wallTint: 0xc0d0e0, ceilTint: 0x8896a8, base: 0x1c2530, frame: 0x303a48, lampI: 8 },
  warehouse: { fog: 0x0b0602, density: 0.040, ambient: 0xb8a088, ambientI: 0.36, wall: 'brick',     wallTint: 0xffffff, ceilTint: 0x7a6a5a, base: 0x2a1a10, frame: 0x3a2a18, lampI: 9 },
  hotel:     { fog: 0x0c0306, density: 0.047, ambient: 0xb89098, ambientI: 0.38, wall: 'plaster',   wallTint: 0xd0a0a0, ceilTint: 0xa89090, base: 0x2a1015, frame: 0x3a1c14, lampI: 7 },
};

/** Rooms further than this (metres, nearest edge) are fully lost in the fog, so they are not drawn at all. */
export const cullDistance = (look: Look): number => 1.75 / look.density;
