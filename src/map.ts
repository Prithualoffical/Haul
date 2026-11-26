import { DOOR_W, PAD, ROOM, WALL_H, WALL_T } from './config';
import { Nav } from './nav';
import { rng, type Rand } from './rng';
import type { Door, Lamp, MapData, MapKind, Prop, PropKind, Rect, Room, ThemeId } from './types';

interface Theme { name: string; lamp: number; lampOn: number; flicker: number }

export const THEMES: Record<ThemeId, Theme> = {
  dock:      { name: 'Loading Dock',   lamp: 0xffe2b0, lampOn: 1.0,  flicker: 0.15 },
  kitchen:   { name: 'Kitchen',        lamp: 0xfff0d0, lampOn: 0.7,  flicker: 0.5 },
  boiler:    { name: 'Boiler Room',    lamp: 0xffa060, lampOn: 0.5,  flicker: 0.3 },
  library:   { name: 'Library',        lamp: 0xffc880, lampOn: 0.6,  flicker: 0.2 },
  hall:      { name: 'Grand Hall',     lamp: 0xffe0a0, lampOn: 0.75, flicker: 0.4 },
  bedroom:   { name: 'Bedroom Suite',  lamp: 0xffb0a0, lampOn: 0.45, flicker: 0.3 },
  gallery:   { name: 'Gallery',        lamp: 0xe8f0ff, lampOn: 0.8,  flicker: 0.2 },
  server:    { name: 'Server Room',    lamp: 0x80b0ff, lampOn: 0.6,  flicker: 0.5 },
  vault:     { name: 'Vault',          lamp: 0xff6a58, lampOn: 0.45, flicker: 0.6 },
  reception: { name: 'Reception',      lamp: 0xffe8c0, lampOn: 1.0,  flicker: 0.15 },
  airlock:   { name: 'Airlock',        lamp: 0xd0e8ff, lampOn: 1.0,  flicker: 0.1 },
  ward:      { name: 'Patient Ward',   lamp: 0xd8ffe8, lampOn: 0.55, flicker: 0.55 },
  morgue:    { name: 'Morgue',         lamp: 0xb0e0ff, lampOn: 0.5,  flicker: 0.45 },
  chapel:    { name: 'Chapel',         lamp: 0xffd890, lampOn: 0.5,  flicker: 0.3 },
  cafeteria: { name: 'Cafeteria',      lamp: 0xfff4d8, lampOn: 0.7,  flicker: 0.4 },
  office:    { name: 'Offices',        lamp: 0xf0ffe0, lampOn: 0.65, flicker: 0.35 },
  cellar:    { name: 'Cellar',         lamp: 0xff9a50, lampOn: 0.4,  flicker: 0.4 },
  storage:   { name: 'Storage',        lamp: 0xffe8c0, lampOn: 0.55, flicker: 0.3 },
  lab:       { name: 'Laboratory',     lamp: 0xa8ffd8, lampOn: 0.65, flicker: 0.45 },
  freezer:   { name: 'Cold Storage',   lamp: 0xc0e8ff, lampOn: 0.6,  flicker: 0.5 },
  locker:    { name: 'Locker Room',    lamp: 0xf0f0d8, lampOn: 0.6,  flicker: 0.4 },
  garage:    { name: 'Garage Bay',     lamp: 0xffd890, lampOn: 0.6,  flicker: 0.35 },
  lobby:     { name: 'Hotel Lobby',    lamp: 0xffe0b8, lampOn: 1.0,  flicker: 0.1 },
  suite:     { name: 'Guest Suite',    lamp: 0xffc8b0, lampOn: 0.45, flicker: 0.4 },
  ballroom:  { name: 'Ballroom',       lamp: 0xffe8c0, lampOn: 0.6,  flicker: 0.45 },
  bar:       { name: 'Lounge Bar',     lamp: 0xff9a60, lampOn: 0.55, flicker: 0.3 },
  laundry:   { name: 'Laundry',        lamp: 0xe8f4ff, lampOn: 0.5,  flicker: 0.5 },
};

interface KindDef {
  name: string; tag: string; layout: ThemeId[][];
  /** chance that an inner wall opening is a wide 7 m arch instead of a 3 m door: open halls vs. tight corridors */
  wide: number;
}

/** layout[rx][rz]; the start room is always [0][0] (the extraction pad sits in its corner). All maps are 5x5 rooms = 65 m. */
export const MAP_KINDS: Record<MapKind, KindDef> = {
  manor: {
    name: 'Blackwood Manor', tag: 'A century-old estate. Something still lives here.', wide: 0.2,
    layout: [
      ['dock', 'library', 'gallery', 'bedroom', 'server'],
      ['kitchen', 'hall', 'library', 'gallery', 'bedroom'],
      ['boiler', 'bedroom', 'hall', 'kitchen', 'cellar'],
      ['storage', 'gallery', 'bedroom', 'library', 'boiler'],
      ['cellar', 'server', 'boiler', 'hall', 'vault'],
    ],
  },
  asylum: {
    name: 'Saint Mercy Asylum', tag: 'The patients never left.', wide: 0.15,
    layout: [
      ['reception', 'ward', 'office', 'ward', 'morgue'],
      ['cafeteria', 'hall', 'ward', 'library', 'cellar'],
      ['ward', 'chapel', 'hall', 'ward', 'storage'],
      ['office', 'ward', 'cafeteria', 'chapel', 'boiler'],
      ['morgue', 'cellar', 'ward', 'storage', 'vault'],
    ],
  },
  facility: {
    name: 'Kepler Research Facility', tag: 'Containment failed. Nobody is answering the radio.', wide: 0.35,
    layout: [
      ['airlock', 'lab', 'storage', 'lab', 'server'],
      ['office', 'lab', 'server', 'lab', 'cellar'],
      ['boiler', 'hall', 'lab', 'server', 'storage'],
      ['storage', 'server', 'office', 'lab', 'lab'],
      ['cellar', 'storage', 'lab', 'server', 'vault'],
    ],
  },
  warehouse: {
    name: 'Port 9 Cargo Terminal', tag: 'Endless aisles. Plenty of places to hide - for both of you.', wide: 0.75,
    layout: [
      ['dock', 'garage', 'storage', 'storage', 'freezer'],
      ['locker', 'storage', 'garage', 'storage', 'storage'],
      ['storage', 'garage', 'storage', 'freezer', 'boiler'],
      ['office', 'storage', 'locker', 'storage', 'garage'],
      ['freezer', 'storage', 'garage', 'boiler', 'vault'],
    ],
  },
  hotel: {
    name: 'Grand Ostara Hotel', tag: 'Checkout time was 1987.', wide: 0.08,
    layout: [
      ['lobby', 'bar', 'suite', 'suite', 'laundry'],
      ['ballroom', 'kitchen', 'suite', 'suite', 'suite'],
      ['bar', 'ballroom', 'hall', 'suite', 'laundry'],
      ['kitchen', 'suite', 'suite', 'ballroom', 'suite'],
      ['laundry', 'suite', 'bar', 'suite', 'vault'],
    ],
  },
};
export const MAP_KIND_LIST: MapKind[] = ['manor', 'asylum', 'facility', 'warehouse', 'hotel'];

/** [w (x), d (z), h] before rotation / scaling. */
const PROP_SIZE: Record<PropKind, [number, number, number]> = {
  crate: [1.1, 1.1, 1.1], barrel: [0.9, 0.9, 1.1], counter: [3.6, 0.9, 0.95], table: [2.2, 1.1, 0.85],
  shelf: [3.0, 0.55, 2.3], pillar: [0.9, 0.9, WALL_H], rack: [0.9, 1.0, 2.1], bed: [2.0, 1.1, 0.7],
  wardrobe: [1.5, 0.65, 2.2], pedestal: [0.9, 0.9, 1.0], boiler: [1.8, 1.8, 2.6], couch: [2.2, 0.95, 0.85],
};

type Mode = 'wall' | 'free' | 'corners' | 'center';
interface Spec { kind: PropKind; n: [number, number]; mode: Mode }

const SPECS: Record<ThemeId, Spec[]> = {
  dock:      [{ kind: 'crate', n: [3, 5], mode: 'free' }, { kind: 'barrel', n: [2, 3], mode: 'wall' }],
  kitchen:   [{ kind: 'counter', n: [2, 3], mode: 'wall' }, { kind: 'table', n: [1, 2], mode: 'free' }, { kind: 'barrel', n: [1, 2], mode: 'wall' }],
  boiler:    [{ kind: 'boiler', n: [2, 3], mode: 'free' }, { kind: 'barrel', n: [2, 4], mode: 'wall' }, { kind: 'crate', n: [1, 2], mode: 'free' }],
  library:   [{ kind: 'shelf', n: [4, 6], mode: 'wall' }, { kind: 'table', n: [1, 1], mode: 'center' }, { kind: 'couch', n: [1, 1], mode: 'free' }],
  hall:      [{ kind: 'pillar', n: [4, 4], mode: 'corners' }, { kind: 'table', n: [1, 1], mode: 'center' }, { kind: 'couch', n: [1, 2], mode: 'wall' }],
  bedroom:   [{ kind: 'bed', n: [2, 2], mode: 'wall' }, { kind: 'wardrobe', n: [1, 2], mode: 'wall' }, { kind: 'couch', n: [1, 1], mode: 'free' }],
  gallery:   [{ kind: 'pedestal', n: [4, 6], mode: 'free' }, { kind: 'couch', n: [1, 1], mode: 'wall' }],
  server:    [{ kind: 'rack', n: [4, 6], mode: 'wall' }, { kind: 'rack', n: [1, 2], mode: 'free' }],
  vault:     [{ kind: 'pillar', n: [3, 3], mode: 'free' }, { kind: 'crate', n: [2, 4], mode: 'free' }, { kind: 'barrel', n: [1, 2], mode: 'wall' }],
  reception: [{ kind: 'counter', n: [1, 2], mode: 'wall' }, { kind: 'couch', n: [2, 3], mode: 'wall' }, { kind: 'table', n: [1, 1], mode: 'free' }],
  airlock:   [{ kind: 'crate', n: [3, 4], mode: 'free' }, { kind: 'barrel', n: [1, 2], mode: 'wall' }, { kind: 'rack', n: [1, 2], mode: 'wall' }],
  ward:      [{ kind: 'bed', n: [3, 5], mode: 'wall' }, { kind: 'wardrobe', n: [1, 1], mode: 'wall' }, { kind: 'table', n: [0, 1], mode: 'free' }],
  morgue:    [{ kind: 'table', n: [2, 3], mode: 'free' }, { kind: 'rack', n: [3, 4], mode: 'wall' }, { kind: 'counter', n: [1, 1], mode: 'wall' }],
  chapel:    [{ kind: 'couch', n: [4, 6], mode: 'free' }, { kind: 'pillar', n: [4, 4], mode: 'corners' }, { kind: 'pedestal', n: [1, 1], mode: 'center' }],
  cafeteria: [{ kind: 'table', n: [4, 5], mode: 'free' }, { kind: 'counter', n: [2, 2], mode: 'wall' }, { kind: 'barrel', n: [0, 1], mode: 'wall' }],
  office:    [{ kind: 'table', n: [3, 4], mode: 'free' }, { kind: 'shelf', n: [2, 3], mode: 'wall' }, { kind: 'couch', n: [1, 1], mode: 'wall' }],
  cellar:    [{ kind: 'barrel', n: [4, 6], mode: 'free' }, { kind: 'crate', n: [3, 4], mode: 'free' }, { kind: 'boiler', n: [0, 1], mode: 'free' }],
  storage:   [{ kind: 'shelf', n: [3, 5], mode: 'wall' }, { kind: 'crate', n: [3, 5], mode: 'free' }],
  lab:       [{ kind: 'table', n: [2, 3], mode: 'free' }, { kind: 'rack', n: [3, 4], mode: 'wall' }, { kind: 'counter', n: [1, 2], mode: 'wall' }],
  freezer:   [{ kind: 'rack', n: [3, 4], mode: 'wall' }, { kind: 'crate', n: [3, 4], mode: 'free' }, { kind: 'barrel', n: [1, 2], mode: 'wall' }],
  locker:    [{ kind: 'wardrobe', n: [4, 6], mode: 'wall' }, { kind: 'rack', n: [1, 2], mode: 'wall' }, { kind: 'table', n: [1, 1], mode: 'free' }],
  garage:    [{ kind: 'crate', n: [2, 4], mode: 'free' }, { kind: 'barrel', n: [2, 3], mode: 'wall' }, { kind: 'boiler', n: [0, 1], mode: 'free' }, { kind: 'table', n: [1, 1], mode: 'free' }],
  lobby:     [{ kind: 'pillar', n: [4, 4], mode: 'corners' }, { kind: 'counter', n: [1, 2], mode: 'wall' }, { kind: 'couch', n: [2, 3], mode: 'wall' }, { kind: 'table', n: [1, 1], mode: 'center' }],
  suite:     [{ kind: 'bed', n: [1, 2], mode: 'wall' }, { kind: 'wardrobe', n: [1, 1], mode: 'wall' }, { kind: 'table', n: [1, 1], mode: 'free' }, { kind: 'couch', n: [0, 1], mode: 'free' }],
  ballroom:  [{ kind: 'pillar', n: [4, 4], mode: 'corners' }, { kind: 'table', n: [3, 5], mode: 'free' }, { kind: 'couch', n: [1, 2], mode: 'wall' }],
  bar:       [{ kind: 'counter', n: [2, 3], mode: 'wall' }, { kind: 'table', n: [3, 4], mode: 'free' }, { kind: 'barrel', n: [1, 2], mode: 'wall' }],
  laundry:   [{ kind: 'barrel', n: [2, 3], mode: 'wall' }, { kind: 'counter', n: [1, 2], mode: 'wall' }, { kind: 'crate', n: [1, 2], mode: 'free' }, { kind: 'boiler', n: [1, 2], mode: 'free' }],
};

const WIDE_W = 7;

const overlap = (a: Rect, b: Rect, m: number): boolean =>
  a.x1 < b.x2 + m && a.x2 > b.x1 - m && a.z1 < b.z2 + m && a.z2 > b.z1 - m;

const isStart = (room: Room): boolean => room.rx === 0 && room.rz === 0;

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
    if (isStart(room) && overlap(rect, padRect, 0.8)) continue;
    if (placed.some(p => overlap(rect, { x1: p.x - p.w / 2, z1: p.z - p.d / 2, x2: p.x + p.w / 2, z2: p.z + p.d / 2, h: p.h }, spec.mode === 'wall' ? 0.5 : 0.9))) continue;
    return { kind: spec.kind, x, z, w, d, h, seed: seed + placed.length * 131 };
  }
  return null;
}

function tryGenerate(seed: number, kind: MapKind, withProps: boolean): MapData | null {
  const def = MAP_KINDS[kind];
  const n = def.layout.length;
  const size = n * ROOM;
  const R = rng(seed);
  const walls: Rect[] = [];
  const doors: Door[] = [];
  const add = (x1: number, z1: number, x2: number, z2: number): void => { walls.push({ x1, z1, x2, z2, h: WALL_H }); };
  const t = WALL_T / 2;

  add(-WALL_T, -WALL_T, size + WALL_T, 0);
  add(-WALL_T, size, size + WALL_T, size + WALL_T);
  add(-WALL_T, 0, 0, size);
  add(size, 0, size + WALL_T, size);
  const opening = (a: number): { c: number; w: number } => {
    const w = R() < def.wide ? WIDE_W : DOOR_W;
    return { w, c: a + w / 2 + 0.8 + R() * (ROOM - w - 1.6) };
  };
  for (let k = 1; k < n; k++) {
    const d = ROOM * k;
    for (let r = 0; r < n; r++) {
      const a = ROOM * r, b = a + ROOM;
      const o1 = opening(a), o2 = opening(a);
      add(d - t, a, d + t, o1.c - o1.w / 2); add(d - t, o1.c + o1.w / 2, d + t, b);
      doors.push({ axis: 'x', line: d, c: o1.c, w: o1.w });
      add(a, d - t, o2.c - o2.w / 2, d + t); add(o2.c + o2.w / 2, d - t, b, d + t);
      doors.push({ axis: 'z', line: d, c: o2.c, w: o2.w });
    }
  }

  const rooms: Room[] = [];
  for (let rx = 0; rx < n; rx++) {
    for (let rz = 0; rz < n; rz++) {
      const theme = def.layout[rx][rz];
      rooms.push({
        id: rooms.length, name: THEMES[theme].name, theme, rx, rz,
        x1: rx * ROOM, z1: rz * ROOM, x2: rx * ROOM + ROOM, z2: rz * ROOM + ROOM, tier: rx + rz,
      });
    }
  }

  const doorClear: Rect[] = doors.map(dr => dr.axis === 'x'
    ? { x1: dr.line - 1.8, x2: dr.line + 1.8, z1: dr.c - dr.w / 2 - 0.1, z2: dr.c + dr.w / 2 + 0.1, h: 0 }
    : { x1: dr.c - dr.w / 2 - 0.1, x2: dr.c + dr.w / 2 + 0.1, z1: dr.line - 1.8, z2: dr.line + 1.8, h: 0 });

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
        const count = spec.n[0] + Math.floor(R() * (spec.n[1] - spec.n[0] + 1));
        for (let k = 0; k < count; k++) {
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
    const nav = new Nav(solids, size);
    const px = (PAD.x1 + PAD.x2) / 2, pz = (PAD.z1 + PAD.z2) / 2;
    if (nav.reachableRatio(px, pz) < 0.99) return null;
    // every room's middle must be walkable from the start, so loot and monsters never end up sealed in
    const reach = nav.reachMap(px, pz);
    for (const room of rooms) {
      const mx = (room.x1 + room.x2) / 2, mz = (room.z1 + room.z2) / 2;
      if (nav.isFree(mx, mz) && !nav.reachable(reach, mx, mz)) return null;
    }
  }

  const lamps: Lamp[] = rooms.map(room => {
    const th = THEMES[room.theme];
    return {
      x: (room.x1 + room.x2) / 2, z: (room.z1 + room.z2) / 2, color: th.lamp, roomId: room.id,
      on: isStart(room) || R() < th.lampOn, flicker: R() < th.flicker,
    };
  });

  return { seed, kind, name: def.name, size, n, maxTier: 2 * (n - 1), walls, props, solids, rooms, doors, lamps };
}

/** Deterministic: the same (seed, kind) always yields the same map on every machine. */
export function generateMap(seed: number, kind: MapKind): MapData {
  for (let attempt = 0; attempt < 40; attempt++) {
    const m = tryGenerate(seed + attempt * 7919, kind, true);
    if (m) return m;
  }
  const bare = tryGenerate(seed, kind, false);
  if (!bare) throw new Error('map generation failed');
  return bare;
}

export function roomAt(map: MapData, x: number, z: number): Room | null {
  for (const r of map.rooms) if (x >= r.x1 && x < r.x2 && z >= r.z1 && z < r.z2) return r;
  return null;
}
