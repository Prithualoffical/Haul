import { DOOR_W, PAD, ROOM, W, WALL_H, WALL_T } from './config';
import { Nav } from './nav';
import { rng, type Rand } from './rng';
import type { Door, Lamp, MapData, Prop, PropKind, Rect, Room, ThemeId } from './types';

interface Theme { name: string; lamp: number; lampOn: number; flicker: number }

export const THEMES: Record<ThemeId, Theme> = {
  dock:    { name: 'Loading Dock',  lamp: 0xffe2b0, lampOn: 1.0,  flicker: 0.15 },
  kitchen: { name: 'Kitchen',       lamp: 0xfff0d0, lampOn: 0.7,  flicker: 0.5 },
  boiler:  { name: 'Boiler Room',   lamp: 0xffa060, lampOn: 0.5,  flicker: 0.3 },
  library: { name: 'Library',       lamp: 0xffc880, lampOn: 0.6,  flicker: 0.2 },
  hall:    { name: 'Grand Hall',    lamp: 0xffe0a0, lampOn: 0.75, flicker: 0.4 },
  bedroom: { name: 'Bedroom Suite', lamp: 0xffb0a0, lampOn: 0.45, flicker: 0.3 },
  gallery: { name: 'Gallery',       lamp: 0xe8f0ff, lampOn: 0.8,  flicker: 0.2 },
  server:  { name: 'Server Room',   lamp: 0x80b0ff, lampOn: 0.6,  flicker: 0.5 },
  vault:   { name: 'Vault',         lamp: 0xff6a58, lampOn: 0.45, flicker: 0.6 },
};

/** LAYOUT[rx][rz]. Dock (start) is the south-west corner of the plan, Vault is the far corner. */
const LAYOUT: ThemeId[][] = [
  ['dock', 'library', 'gallery'],
  ['kitchen', 'hall', 'server'],
  ['boiler', 'bedroom', 'vault'],
];

/** [w (x), d (z), h] before rotation / scaling. */
const PROP_SIZE: Record<PropKind, [number, number, number]> = {
  crate: [1.1, 1.1, 1.1], barrel: [0.9, 0.9, 1.1], counter: [3.6, 0.9, 0.95], table: [2.2, 1.1, 0.85],
  shelf: [3.0, 0.55, 2.3], pillar: [0.9, 0.9, WALL_H], rack: [0.9, 1.0, 2.1], bed: [2.0, 1.1, 0.7],
  wardrobe: [1.5, 0.65, 2.2], pedestal: [0.9, 0.9, 1.0], boiler: [1.8, 1.8, 2.6], couch: [2.2, 0.95, 0.85],
};

type Mode = 'wall' | 'free' | 'corners' | 'center';
interface Spec { kind: PropKind; n: [number, number]; mode: Mode }

const SPECS: Record<ThemeId, Spec[]> = {
  dock:    [{ kind: 'crate', n: [3, 5], mode: 'free' }, { kind: 'barrel', n: [2, 3], mode: 'wall' }],
  kitchen: [{ kind: 'counter', n: [2, 3], mode: 'wall' }, { kind: 'table', n: [1, 2], mode: 'free' }, { kind: 'barrel', n: [1, 2], mode: 'wall' }],
  boiler:  [{ kind: 'boiler', n: [2, 3], mode: 'free' }, { kind: 'barrel', n: [2, 4], mode: 'wall' }, { kind: 'crate', n: [1, 2], mode: 'free' }],
  library: [{ kind: 'shelf', n: [4, 6], mode: 'wall' }, { kind: 'table', n: [1, 1], mode: 'center' }, { kind: 'couch', n: [1, 1], mode: 'free' }],
  hall:    [{ kind: 'pillar', n: [4, 4], mode: 'corners' }, { kind: 'table', n: [1, 1], mode: 'center' }, { kind: 'couch', n: [1, 2], mode: 'wall' }],
  bedroom: [{ kind: 'bed', n: [2, 2], mode: 'wall' }, { kind: 'wardrobe', n: [1, 2], mode: 'wall' }, { kind: 'couch', n: [1, 1], mode: 'free' }],
  gallery: [{ kind: 'pedestal', n: [4, 6], mode: 'free' }, { kind: 'couch', n: [1, 1], mode: 'wall' }],
  server:  [{ kind: 'rack', n: [4, 6], mode: 'wall' }, { kind: 'rack', n: [1, 2], mode: 'free' }],
  vault:   [{ kind: 'pillar', n: [3, 3], mode: 'free' }, { kind: 'crate', n: [2, 4], mode: 'free' }, { kind: 'barrel', n: [1, 2], mode: 'wall' }],
};

const overlap = (a: Rect, b: Rect, m: number): boolean =>
  a.x1 < b.x2 + m && a.x2 > b.x1 - m && a.z1 < b.z2 + m && a.z2 > b.z1 - m;

function tryPlace(R: Rand, room: Room, spec: Spec, doorClear: Rect[], placed: Prop[], seed: number): Prop | null {
  const [bw, bd, bh] = PROP_SIZE[spec.kind];
  const sc = spec.kind === 'crate' ? 0.8 + R() * 0.6 : 1;
  const cx = (room.x1 + room.x2) / 2, cz = (room.z1 + room.z2) / 2;
  const padRect: Rect = { ...PAD, h: 1 };

  for (let attempt = 0; attempt < 30; attempt++) {
    let w = bw * sc, d = bd * sc, x = cx, z = cz;
    const h = bh * (spec.kind === 'crate' ? sc : 1);
    if (spec.mode === 'wall') {
      const side = Math.floor(R() * 4);
      if (side >= 2) { const t = w; w = d; d = t; }          // long side parallel to the wall
      if (side === 0) { z = room.z1 + 0.4 + d / 2; x = room.x1 + 1.5 + w / 2 + R() * (ROOM - 3 - w); }
      else if (side === 1) { z = room.z2 - 0.4 - d / 2; x = room.x1 + 1.5 + w / 2 + R() * (ROOM - 3 - w); }
      else if (side === 2) { x = room.x1 + 0.4 + w / 2; z = room.z1 + 1.5 + d / 2 + R() * (ROOM - 3 - d); }
      else { x = room.x2 - 0.4 - w / 2; z = room.z1 + 1.5 + d / 2 + R() * (ROOM - 3 - d); }
    } else if (spec.mode === 'free') {
      if (R() < 0.5) { const t = w; w = d; d = t; }
      x = room.x1 + 2.2 + R() * (ROOM - 4.4);
      z = room.z1 + 2.2 + R() * (ROOM - 4.4);
    } else if (spec.mode === 'center') {
      x = cx + (R() - 0.5) * 1.5; z = cz + (R() - 0.5) * 1.5;
    } else {
      return null; // 'corners' handled by caller
    }
    const rect: Rect = { x1: x - w / 2, z1: z - d / 2, x2: x + w / 2, z2: z + d / 2, h };
    if (doorClear.some(r => overlap(rect, r, 0.9))) continue;
    if (room.theme === 'dock' && overlap(rect, padRect, 0.8)) continue;
    if (placed.some(p => overlap(rect, { x1: p.x - p.w / 2, z1: p.z - p.d / 2, x2: p.x + p.w / 2, z2: p.z + p.d / 2, h: p.h }, spec.mode === 'wall' ? 0.5 : 0.9))) continue;
    return { kind: spec.kind, x, z, w, d, h, seed: seed + placed.length * 131 };
  }
  return null;
}

function tryGenerate(seed: number, withProps: boolean): MapData | null {
  const R = rng(seed);
  const walls: Rect[] = [];
  const doors: Door[] = [];
  const add = (x1: number, z1: number, x2: number, z2: number): void => { walls.push({ x1, z1, x2, z2, h: WALL_H }); };
  const t = WALL_T / 2, g = DOOR_W / 2;

  add(-WALL_T, -WALL_T, W + WALL_T, 0);
  add(-WALL_T, W, W + WALL_T, W + WALL_T);
  add(-WALL_T, 0, 0, W);
  add(W, 0, W + WALL_T, W);
  for (const d of [ROOM, ROOM * 2]) {
    for (let r = 0; r < 3; r++) {
      const a = ROOM * r, b = a + ROOM;
      const c = a + 3 + R() * 7, c2 = a + 3 + R() * 7;
      add(d - t, a, d + t, c - g); add(d - t, c + g, d + t, b);
      doors.push({ axis: 'x', line: d, c });
      add(a, d - t, c2 - g, d + t); add(c2 + g, d - t, b, d + t);
      doors.push({ axis: 'z', line: d, c: c2 });
    }
  }

  const rooms: Room[] = [];
  for (let rx = 0; rx < 3; rx++) {
    for (let rz = 0; rz < 3; rz++) {
      const theme = LAYOUT[rx][rz];
      rooms.push({
        id: rooms.length, name: THEMES[theme].name, theme, rx, rz,
        x1: rx * ROOM, z1: rz * ROOM, x2: rx * ROOM + ROOM, z2: rz * ROOM + ROOM, tier: rx + rz,
      });
    }
  }

  const doorClear: Rect[] = doors.map(dr => dr.axis === 'x'
    ? { x1: dr.line - 1.8, x2: dr.line + 1.8, z1: dr.c - g - 0.1, z2: dr.c + g + 0.1, h: 0 }
    : { x1: dr.c - g - 0.1, x2: dr.c + g + 0.1, z1: dr.line - 1.8, z2: dr.line + 1.8, h: 0 });

  const props: Prop[] = [];
  if (withProps) {
    for (const room of rooms) {
      const mine: Prop[] = [];
      for (const spec of SPECS[room.theme]) {
        if (spec.mode === 'corners') {
          const cx = (room.x1 + room.x2) / 2, cz = (room.z1 + room.z2) / 2;
          const [w, d, h] = PROP_SIZE[spec.kind];
          for (const [ox, oz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
            mine.push({ kind: spec.kind, x: cx + ox, z: cz + oz, w, d, h, seed: seed + mine.length });
          }
          continue;
        }
        const n = spec.n[0] + Math.floor(R() * (spec.n[1] - spec.n[0] + 1));
        for (let k = 0; k < n; k++) {
          const p = tryPlace(R, room, spec, doorClear, mine, seed);
          if (p) mine.push(p);
        }
      }
      props.push(...mine);
    }
  }

  const propRects: Rect[] = props.map(p => ({ x1: p.x - p.w / 2, z1: p.z - p.d / 2, x2: p.x + p.w / 2, z2: p.z + p.d / 2, h: p.h }));
  const solids = walls.concat(propRects);
  if (withProps) {
    const nav = new Nav(solids);
    if (nav.reachableRatio((PAD.x1 + PAD.x2) / 2, (PAD.z1 + PAD.z2) / 2) < 0.96) return null;
  }

  const lamps: Lamp[] = rooms.map(room => {
    const th = THEMES[room.theme];
    return {
      x: (room.x1 + room.x2) / 2, z: (room.z1 + room.z2) / 2, color: th.lamp, roomId: room.id,
      on: room.theme === 'dock' || R() < th.lampOn, flicker: R() < th.flicker,
    };
  });

  return { seed, walls, props, solids, rooms, doors, lamps };
}

/** Deterministic: the same seed always yields the same map on every machine. */
export function generateMap(seed: number): MapData {
  for (let attempt = 0; attempt < 40; attempt++) {
    const m = tryGenerate(seed + attempt * 7919, true);
    if (m) return m;
  }
  const bare = tryGenerate(seed, false);
  if (!bare) throw new Error('map generation failed');
  return bare;
}

export function roomAt(map: MapData, x: number, z: number): Room | null {
  for (const r of map.rooms) if (x >= r.x1 && x < r.x2 && z >= r.z1 && z < r.z2) return r;
  return null;
}
