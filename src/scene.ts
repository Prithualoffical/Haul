import * as THREE from 'three';
import { DOOR_W, PAD, WALL_H, WALL_T } from './config';
import { scene } from './gfx';
import { buildProp } from './props';
import { getTextures, padTexture, type Textures } from './textures';
import type { MapData, Rect, ThemeId } from './types';

export interface LampRT {
  light: THREE.PointLight; fixture: THREE.MeshBasicMaterial; color: THREE.Color;
  base: number; flicker: boolean; phase: number;
}
export interface LevelScene { group: THREE.Group; lamps: LampRT[] }

let current: LevelScene | null = null;

export function getLevelGroup(): THREE.Group {
  if (!current) throw new Error('no level scene');
  return current.group;
}
export function getLamps(): LampRT[] { return current ? current.lamps : []; }

const FLOOR: Record<ThemeId, { tex: keyof Textures; tint: number; rough: number }> = {
  dock:    { tex: 'concrete', tint: 0xb0b0a8, rough: 0.95 },
  kitchen: { tex: 'tile',     tint: 0xffffff, rough: 0.35 },
  boiler:  { tex: 'concrete', tint: 0x80736a, rough: 0.9 },
  library: { tex: 'wood',     tint: 0xffffff, rough: 0.6 },
  hall:    { tex: 'wood',     tint: 0xa08060, rough: 0.45 },
  bedroom: { tex: 'carpet',   tint: 0xffffff, rough: 1.0 },
  gallery: { tex: 'tile',     tint: 0xd8d0e0, rough: 0.25 },
  server:  { tex: 'metal',    tint: 0xffffff, rough: 0.5 },
  vault:   { tex: 'concrete', tint: 0x7a6060, rough: 0.8 },
};

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
    if (m.isMesh) m.geometry.dispose();
  });
  current = null;
}

export function buildLevelScene(map: MapData): LevelScene {
  disposeCurrent();
  const tx = getTextures();
  const group = new THREE.Group();
  const lamps: LampRT[] = [];

  /* ---- floors & ceilings per room ---- */
  for (const room of map.rooms) {
    const f = FLOOR[room.theme];
    const w = room.x2 - room.x1, d = room.z2 - room.z1;
    const fg = new THREE.PlaneGeometry(w, d);
    tilePlaneUV(fg, w, d, 2);
    const floor = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({
      map: tx[f.tex], bumpMap: tx[f.tex], bumpScale: 1.2, color: f.tint, roughness: f.rough, metalness: f.tex === 'metal' ? 0.5 : 0,
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((room.x1 + room.x2) / 2, 0, (room.z1 + room.z2) / 2);
    floor.receiveShadow = true;
    group.add(floor);

    const cg = new THREE.PlaneGeometry(w, d);
    tilePlaneUV(cg, w, d, 3);
    const ceil = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: tx.ceiling, color: 0x9a9a92, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(floor.position.x, WALL_H, floor.position.z);
    ceil.receiveShadow = true;
    group.add(ceil);
  }

  /* ---- walls ---- */
  const wallMat = new THREE.MeshStandardMaterial({ map: tx.plaster, bumpMap: tx.plaster, bumpScale: 0.8, roughness: 0.95 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.7 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x24160d, roughness: 0.6 });
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

  /* ---- door frames: posts + lintel make the openings read as doorways ---- */
  const g2 = DOOR_W / 2;
  for (const dr of map.doors) {
    const alongZ = dr.axis === 'x';
    const post = (off: number): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? WALL_T + 0.12 : 0.22, 2.6, alongZ ? 0.22 : WALL_T + 0.12), frameMat);
      m.position.set(alongZ ? dr.line : dr.c + off, 1.3, alongZ ? dr.c + off : dr.line);
      m.castShadow = true;
      group.add(m);
    };
    post(-g2); post(g2);
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(alongZ ? WALL_T : DOOR_W + 0.22, WALL_H - 2.6, alongZ ? DOOR_W + 0.22 : WALL_T), wallMat);
    lintel.position.set(alongZ ? dr.line : dr.c, 2.6 + (WALL_H - 2.6) / 2, alongZ ? dr.c : dr.line);
    lintel.castShadow = true;
    group.add(lintel);
  }

  /* ---- furniture ---- */
  for (const p of map.props) group.add(buildProp(p));

  /* ---- lamps ---- */
  for (const l of map.lamps) {
    const col = new THREE.Color(l.color);
    const hdr = col.clone().multiplyScalar(2.4);
    const fixMat = new THREE.MeshBasicMaterial({ color: l.on ? hdr : new THREE.Color(0x0d0d0d) });
    const fix = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.35), fixMat);
    fix.position.set(l.x, WALL_H - 0.04, l.z);
    group.add(fix);
    if (l.on) {
      const light = new THREE.PointLight(l.color, 7, 17, 2);
      light.position.set(l.x, WALL_H - 0.4, l.z);
      group.add(light);
      lamps.push({ light, fixture: fixMat, color: hdr, base: 7, flicker: l.flicker, phase: l.x * 3.1 + l.z });
    }
  }

  /* ---- extraction pad ---- */
  const pw = PAD.x2 - PAD.x1, pd = PAD.z2 - PAD.z1, pcx = (PAD.x1 + PAD.x2) / 2, pcz = (PAD.z1 + PAD.z2) / 2;
  const padMesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), new THREE.MeshBasicMaterial({
    map: padTexture(), transparent: true, opacity: 0.9, depthWrite: false,
  }));
  padMesh.rotation.x = -Math.PI / 2;
  padMesh.position.set(pcx, 0.02, pcz);
  group.add(padMesh);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30ff90).multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false });
  for (const [bx, bz] of [[PAD.x1, PAD.z1], [PAD.x2, PAD.z1], [PAD.x1, PAD.z2], [PAD.x2, PAD.z2]]) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, WALL_H, 8), beamMat);
    beam.position.set(bx, WALL_H / 2, bz);
    group.add(beam);
  }
  const padLight = new THREE.PointLight(0x33ff99, 6, 13, 2);
  padLight.position.set(pcx, 2.6, pcz);
  group.add(padLight);

  scene.add(group);
  current = { group, lamps };
  return current;
}
