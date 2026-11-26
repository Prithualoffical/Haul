import * as THREE from 'three';
import { PAD, WALL_H, WALL_T } from './config';
import { applyAtmosphere, scene } from './gfx';
import { cullDistance, LOOKS } from './looks';
import { buildProp } from './props';
import { rng } from './rng';
import { bloodTexture, getTextures, padTexture, type Textures } from './textures';
import type { MapData, Rect, ThemeId } from './types';

/** Lamps are emissive fixtures only; real lighting comes from a small POOL of point lights that follow
 *  the player to the nearest lamps. A constant light count keeps shaders cheap and stable on big maps. */
export interface LampRT {
  x: number; z: number; fixture: THREE.MeshBasicMaterial; color: THREE.Color; hex: number;
  base: number; flicker: boolean; phase: number;
}
export interface RoomRT { group: THREE.Group; x1: number; z1: number; x2: number; z2: number }
export interface LevelScene { group: THREE.Group; lamps: LampRT[]; pool: THREE.PointLight[]; rooms: RoomRT[]; cull: number }
export const LIGHT_POOL = 6;

let current: LevelScene | null = null;

export function getLevelGroup(): THREE.Group {
  if (!current) throw new Error('no level scene');
  return current.group;
}
export function getLamps(): LampRT[] { return current ? current.lamps : []; }
export function getPool(): THREE.PointLight[] { return current ? current.pool : []; }
export function getRooms(): RoomRT[] { return current ? current.rooms : []; }
export function getCull(): number { return current ? current.cull : 40; }

const FLOOR: Record<ThemeId, { tex: keyof Textures; tint: number; rough: number }> = {
  dock:      { tex: 'concrete', tint: 0xb0b0a8, rough: 0.95 },
  kitchen:   { tex: 'tile',     tint: 0xffffff, rough: 0.35 },
  boiler:    { tex: 'concrete', tint: 0x80736a, rough: 0.9 },
  library:   { tex: 'wood',     tint: 0xffffff, rough: 0.6 },
  hall:      { tex: 'wood',     tint: 0xa08060, rough: 0.45 },
  bedroom:   { tex: 'carpet',   tint: 0xffffff, rough: 1.0 },
  gallery:   { tex: 'tile',     tint: 0xd8d0e0, rough: 0.25 },
  server:    { tex: 'metal',    tint: 0xffffff, rough: 0.5 },
  vault:     { tex: 'concrete', tint: 0x7a6060, rough: 0.8 },
  reception: { tex: 'wood',     tint: 0xc0a080, rough: 0.5 },
  airlock:   { tex: 'metal',    tint: 0xc0d0e0, rough: 0.4 },
  ward:      { tex: 'tile',     tint: 0xb8d0c8, rough: 0.35 },
  morgue:    { tex: 'tile',     tint: 0x8aa0aa, rough: 0.3 },
  chapel:    { tex: 'wood',     tint: 0x7a5a3c, rough: 0.5 },
  cafeteria: { tex: 'tile',     tint: 0xe0d0a8, rough: 0.4 },
  office:    { tex: 'carpet',   tint: 0x6a7c8c, rough: 1.0 },
  cellar:    { tex: 'concrete', tint: 0x55504a, rough: 0.95 },
  storage:   { tex: 'concrete', tint: 0x9a9488, rough: 0.9 },
  lab:       { tex: 'tile',     tint: 0xa8d0e0, rough: 0.25 },
  freezer:   { tex: 'tile',     tint: 0x9ab8d0, rough: 0.2 },
  locker:    { tex: 'concrete', tint: 0x8a9098, rough: 0.8 },
  garage:    { tex: 'concrete', tint: 0x686560, rough: 0.9 },
  lobby:     { tex: 'carpet',   tint: 0xe0b0b0, rough: 1.0 },
  suite:     { tex: 'carpet',   tint: 0xd8c0a0, rough: 1.0 },
  ballroom:  { tex: 'wood',     tint: 0xc0a078, rough: 0.3 },
  bar:       { tex: 'wood',     tint: 0x7a5535, rough: 0.5 },
  laundry:   { tex: 'tile',     tint: 0xc0c8c0, rough: 0.35 },
};
const PIPED: ReadonlySet<ThemeId> = new Set<ThemeId>(['boiler', 'cellar', 'lab', 'storage', 'morgue', 'server', 'freezer', 'garage', 'laundry', 'locker']);
const GORY: ReadonlySet<ThemeId> = new Set<ThemeId>(['ward', 'morgue', 'cellar', 'chapel', 'vault', 'boiler', 'freezer', 'laundry']);

/** Scale a BoxGeometry's UVs so one texture tile covers `tile` metres on every face. */
function tileBoxUV(geo: THREE.BoxGeometry, w: number, h: number, d: number, tile: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  uv.needsUpdate = true;
}
function tilePlaneUV(geo: THREE.PlaneGeometry, w: number, h: number, tile: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  uv.needsUpdate = true;
}

function disposeCurrent(): void {
  if (!current) return;
  scene.remove(current.group);
  current.group.traverse((o: THREE.Object3D) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      // per-level materials are rebuilt each time; free their GPU memory (shared prop materials live in props.ts)
      if (!Array.isArray(mat) && (mat as THREE.Material & { userData: Record<string, unknown> }).userData['perLevel']) mat.dispose();
    }
  });
  current = null;
}

export function buildLevelScene(map: MapData): LevelScene {
  disposeCurrent();
  const look = LOOKS[map.kind];
  applyAtmosphere(look.fog, look.density, look.ambient, look.ambientI);

  const tx = getTextures();
  const group = new THREE.Group();
  const lamps: LampRT[] = [];
  const rooms: RoomRT[] = [];
  const roomGroups = new Map<number, THREE.Group>();
  const lvl = <T extends THREE.Material>(m: T): T => { m.userData['perLevel'] = true; return m; };

  /* ---- one group per room: floor, ceiling, furniture, fixtures, pipes, blood. Far rooms are hidden each frame. ---- */
  for (const room of map.rooms) {
    const rg = new THREE.Group();
    group.add(rg);
    roomGroups.set(room.id, rg);
    rooms.push({ group: rg, x1: room.x1, z1: room.z1, x2: room.x2, z2: room.z2 });

    const f = FLOOR[room.theme];
    const w = room.x2 - room.x1, d = room.z2 - room.z1;
    const fg = new THREE.PlaneGeometry(w, d);
    tilePlaneUV(fg, w, d, 2);
    const floor = new THREE.Mesh(fg, lvl(new THREE.MeshStandardMaterial({
      map: tx[f.tex], bumpMap: tx[f.tex], bumpScale: 1.2, color: f.tint, roughness: f.rough, metalness: f.tex === 'metal' ? 0.5 : 0,
    })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((room.x1 + room.x2) / 2, 0, (room.z1 + room.z2) / 2);
    floor.receiveShadow = true;
    rg.add(floor);

    const cg = new THREE.PlaneGeometry(w, d);
    tilePlaneUV(cg, w, d, 3);
    const ceil = new THREE.Mesh(cg, lvl(new THREE.MeshStandardMaterial({ map: tx.ceiling, color: look.ceilTint, roughness: 1 })));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(floor.position.x, WALL_H, floor.position.z);
    ceil.receiveShadow = true;
    rg.add(ceil);
  }

  /* ---- walls (always drawn: there are few, and they hide the room boundaries) ---- */
  const wallTex = tx[look.wall];
  const wallMat = lvl(new THREE.MeshStandardMaterial({ map: wallTex, bumpMap: wallTex, bumpScale: 0.8, color: look.wallTint, roughness: 0.95 }));
  const baseMat = lvl(new THREE.MeshStandardMaterial({ color: look.base, roughness: 0.7 }));
  const frameMat = lvl(new THREE.MeshStandardMaterial({ color: look.frame, roughness: 0.6 }));
  const wallRect = (s: Rect): void => {
    const w = s.x2 - s.x1, d = s.z2 - s.z1, cx = (s.x1 + s.x2) / 2, cz = (s.z1 + s.z2) / 2;
    const g = new THREE.BoxGeometry(w, WALL_H, d);
    tileBoxUV(g, w, WALL_H, d, 2.5);
    const m = new THREE.Mesh(g, wallMat);
    m.position.set(cx, WALL_H / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.22, d + 0.05), baseMat);
    b.position.set(cx, 0.11, cz);
    b.receiveShadow = true;
    group.add(b);
  };
  map.walls.forEach(wallRect);

  /* ---- door frames: posts + lintel (+ a centre pillar on the wide arches) ---- */
  for (const dr of map.doors) {
    const alongZ = dr.axis === 'x';
    const post = (off: number, h = 2.6): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? WALL_T + 0.12 : 0.22, h, alongZ ? 0.22 : WALL_T + 0.12), frameMat);
      m.position.set(alongZ ? dr.line : dr.c + off, h / 2, alongZ ? dr.c + off : dr.line);
      m.castShadow = true;
      group.add(m);
    };
    post(-dr.w / 2); post(dr.w / 2);
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(alongZ ? WALL_T : dr.w + 0.22, WALL_H - 2.6, alongZ ? dr.w + 0.22 : WALL_T), wallMat);
    lintel.position.set(alongZ ? dr.line : dr.c, 2.6 + (WALL_H - 2.6) / 2, alongZ ? dr.c : dr.line);
    lintel.castShadow = true;
    group.add(lintel);
  }

  /* ---- furniture, into the room that contains it ---- */
  const roomOf = (x: number, z: number): THREE.Group => {
    for (const r of map.rooms) if (x >= r.x1 && x < r.x2 && z >= r.z1 && z < r.z2) return roomGroups.get(r.id) as THREE.Group;
    return group;
  };
  for (const p of map.props) roomOf(p.x, p.z).add(buildProp(p));

  /* ---- lamp fixtures (emissive only) + a fixed pool of real lights ---- */
  for (const l of map.lamps) {
    const col = new THREE.Color(l.color);
    const hdr = col.clone().multiplyScalar(2.4);
    const fixMat = lvl(new THREE.MeshBasicMaterial({ color: l.on ? hdr : new THREE.Color(0x0d0d0d) }));
    const fix = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.35), fixMat);
    fix.position.set(l.x, WALL_H - 0.04, l.z);
    (roomGroups.get(l.roomId) ?? group).add(fix);
    if (l.on) lamps.push({ x: l.x, z: l.z, fixture: fixMat, color: hdr, hex: l.color, base: look.lampI, flicker: l.flicker, phase: l.x * 3.1 + l.z });
  }
  const pool: THREE.PointLight[] = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const light = new THREE.PointLight(0xffe0b0, 0, 17, 2);
    light.position.set(-50, WALL_H - 0.4, -50);
    group.add(light);
    pool.push(light);
  }

  /* ---- ceiling pipes, to break up the flat ceilings ---- */
  const pipeMat = lvl(new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.7, metalness: 0.6 }));
  const R = rng(map.seed + 99);
  for (const room of map.rooms) {
    if (!PIPED.has(room.theme)) continue;
    const rg = roomGroups.get(room.id) as THREE.Group;
    const lines = 1 + Math.floor(R() * 2);
    for (let k = 0; k < lines; k++) {
      const along = R() < 0.5;
      const off = 2.5 + R() * (room.x2 - room.x1 - 5);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, room.x2 - room.x1, 8), pipeMat);
      pipe.position.set(along ? (room.x1 + room.x2) / 2 : room.x1 + off, WALL_H - 0.35, along ? room.z1 + off : (room.z1 + room.z2) / 2);
      pipe.rotation.z = along ? Math.PI / 2 : 0;
      if (!along) pipe.rotation.x = Math.PI / 2;
      pipe.castShadow = true;
      rg.add(pipe);
    }
  }

  /* ---- blood on the floor: more of it in the grisly rooms ---- */
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  const padClear = { x1: PAD.x1 - 1.5, x2: PAD.x2 + 1.5, z1: PAD.z1 - 1.5, z2: PAD.z2 + 1.5 };
  for (const room of map.rooms) {
    const rg = roomGroups.get(room.id) as THREE.Group;
    const count = (GORY.has(room.theme) ? 2 + Math.floor(R() * 3) : Math.floor(R() * 1.6)) - (room.rx === 0 && room.rz === 0 ? 5 : 0);
    for (let k = 0; k < count; k++) {
      const x = room.x1 + 1.5 + R() * (room.x2 - room.x1 - 3), z = room.z1 + 1.5 + R() * (room.z2 - room.z1 - 3);
      if (x > padClear.x1 && x < padClear.x2 && z > padClear.z1 && z < padClear.z2) continue;
      const size = 1.2 + R() * 2.2;
      const m = new THREE.Mesh(decalGeo, lvl(new THREE.MeshBasicMaterial({
        map: bloodTexture(Math.floor(R() * 4)), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
        opacity: 0.55 + R() * 0.4, color: 0x9a9a9a,
      })));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = R() * Math.PI * 2;
      m.scale.set(size, size, 1);
      m.position.set(x, 0.012, z);
      rg.add(m);
    }
  }

  /* ---- extraction pad (lives in the start room's group) ---- */
  const startGroup = roomGroups.get(0) ?? group;
  const pw = PAD.x2 - PAD.x1, pd = PAD.z2 - PAD.z1, pcx = (PAD.x1 + PAD.x2) / 2, pcz = (PAD.z1 + PAD.z2) / 2;
  const padMesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), lvl(new THREE.MeshBasicMaterial({
    map: padTexture(), transparent: true, opacity: 0.9, depthWrite: false,
  })));
  padMesh.rotation.x = -Math.PI / 2;
  padMesh.position.set(pcx, 0.02, pcz);
  startGroup.add(padMesh);
  const beamMat = lvl(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30ff90).multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false }));
  for (const [bx, bz] of [[PAD.x1, PAD.z1], [PAD.x2, PAD.z1], [PAD.x1, PAD.z2], [PAD.x2, PAD.z2]]) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, WALL_H, 8), beamMat);
    beam.position.set(bx, WALL_H / 2, bz);
    startGroup.add(beam);
  }
  const padLight = new THREE.PointLight(0x33ff99, 6, 13, 2);
  padLight.position.set(pcx, 2.6, pcz);
  group.add(padLight);

  scene.add(group);
  current = { group, lamps, pool, rooms, cull: cullDistance(look) };
  return current;
}
