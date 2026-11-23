import * as THREE from 'three';
import { rng } from './rng';
import type { Prop } from './types';

const std = (color: number, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Shared materials (never disposed with a level). */
const M = {
  woodDark: std(0x3a2515), woodMid: std(0x5c3d22), woodLight: std(0x8a6a44),
  metal: std(0x555a60, 0.45, 0.7), rust: std(0x6b3f26, 0.9, 0.4), steel: std(0xb4bac0, 0.35, 0.8),
  marble: std(0xcfcac2, 0.35), white: std(0xd8d6cc, 0.5), black: std(0x15161a, 0.6, 0.3),
  fabric: std(0x5a2a2a, 1), fabric2: std(0x2a3a52, 1), sheet: std(0xcfc9b8, 1), stone: std(0x8a867c, 0.95),
  ledG: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40ff70).multiplyScalar(2.2) }),
  ledR: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3030).multiplyScalar(2.2) }),
  ledB: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4090ff).multiplyScalar(2.2) }),
};
const BOOKS = [0x7a2a2a, 0x2a4a7a, 0x2f6a3f, 0x8a6a2a, 0x4a2a5a, 0x6a6a6a].map(c => std(c, 0.9));
const bgeo = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d);

function add(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** Visual for a furniture / clutter prop. The group is centred on (p.x, 0, p.z); p.w/p.d are final world sizes. */
export function buildProp(p: Prop): THREE.Group {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  const { w, d, h } = p;
  const R = rng(p.seed);

  switch (p.kind) {
    case 'crate': {
      add(g, bgeo(w, h, d), M.woodMid, 0, h / 2, 0);
      for (const y of [0.12 * h, 0.88 * h]) add(g, bgeo(w + 0.04, 0.1 * h, d + 0.04), M.woodDark, 0, y, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, bgeo(0.1, h + 0.02, 0.1), M.woodDark, sx * (w / 2 - 0.04), h / 2, sz * (d / 2 - 0.04));
      break;
    }
    case 'barrel': {
      add(g, new THREE.CylinderGeometry(w / 2, w / 2 * 0.92, h, 14), M.rust, 0, h / 2, 0);
      for (const y of [0.15 * h, 0.85 * h]) add(g, new THREE.CylinderGeometry(w / 2 + 0.02, w / 2 + 0.02, 0.06, 14), M.metal, 0, y, 0);
      break;
    }
    case 'counter': {
      add(g, bgeo(w, h - 0.06, d), M.white, 0, (h - 0.06) / 2, 0);
      add(g, bgeo(w + 0.06, 0.06, d + 0.06), M.black, 0, h - 0.03, 0);
      for (let i = -1; i <= 1; i++) add(g, bgeo(0.02, h * 0.6, 0.02), M.black, i * (w / 3.2), h * 0.45, (d > w ? 1 : -1) * 0, false);
      break;
    }
    case 'table': {
      add(g, bgeo(w, 0.08, d), M.woodLight, 0, h - 0.04, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, bgeo(0.1, h - 0.08, 0.1), M.woodDark, sx * (w / 2 - 0.12), (h - 0.08) / 2, sz * (d / 2 - 0.12));
      break;
    }
    case 'shelf': {
      const longX = w >= d;
      const L = longX ? w : d, T = longX ? d : w;
      const root = new THREE.Group();
      g.add(root);
      add(root, bgeo(L, h, 0.04), M.woodDark, 0, h / 2, -T / 2 + 0.02);
      for (const sx of [-1, 1]) add(root, bgeo(0.05, h, T), M.woodDark, sx * (L / 2 - 0.025), h / 2, 0);
      const levels = 5;
      for (let i = 0; i <= levels; i++) {
        const y = 0.05 + (i * (h - 0.1)) / levels;
        add(root, bgeo(L - 0.05, 0.04, T), M.woodMid, 0, y, 0);
        if (i === levels) break;
        let x = -L / 2 + 0.12;
        while (x < L / 2 - 0.2) {
          const bw = 0.04 + R() * 0.06, bh = 0.22 + R() * 0.16;
          if (R() < 0.12) { x += 0.15; continue; }
          add(root, bgeo(bw, bh, T * 0.7), BOOKS[Math.floor(R() * BOOKS.length)], x + bw / 2, y + 0.02 + bh / 2, -0.02, false);
          x += bw + 0.005;
        }
      }
      // the open side faces into the room: root's back is -Z; rotate so the back sits against the wall
      root.rotation.y = longX ? 0 : Math.PI / 2;
      break;
    }
    case 'pillar': {
      add(g, new THREE.CylinderGeometry(w * 0.42, w * 0.46, h, 14), M.stone, 0, h / 2, 0);
      add(g, bgeo(w, 0.25, d), M.stone, 0, 0.125, 0);
      add(g, bgeo(w, 0.25, d), M.stone, 0, h - 0.125, 0);
      break;
    }
    case 'rack': {
      add(g, bgeo(w, h, d), M.black, 0, h / 2, 0);
      const longX = w >= d;
      for (let i = 0; i < 9; i++) {
        const y = 0.2 + i * 0.2;
        const mat = R() < 0.6 ? M.ledG : R() < 0.5 ? M.ledB : M.ledR;
        const off = (R() - 0.5) * 0.4;
        if (longX) add(g, bgeo(0.06, 0.03, 0.01), mat, off, y, d / 2 + 0.006, false);
        else add(g, bgeo(0.01, 0.03, 0.06), mat, w / 2 + 0.006, y, off, false);
      }
      break;
    }
    case 'bed': {
      add(g, bgeo(w, 0.3, d), M.woodDark, 0, 0.15, 0);
      add(g, bgeo(w - 0.1, 0.22, d - 0.1), M.sheet, 0, 0.41, 0);
      const longX = w >= d;
      if (longX) { add(g, bgeo(0.1, h + 0.3, d), M.woodDark, -w / 2 + 0.05, (h + 0.3) / 2, 0); add(g, bgeo(0.4, 0.12, d * 0.7), M.white, -w / 2 + 0.35, 0.58, 0); }
      else { add(g, bgeo(w, h + 0.3, 0.1), M.woodDark, 0, (h + 0.3) / 2, -d / 2 + 0.05); add(g, bgeo(w * 0.7, 0.12, 0.4), M.white, 0, 0.58, -d / 2 + 0.35); }
      break;
    }
    case 'wardrobe': {
      add(g, bgeo(w, h, d), M.woodDark, 0, h / 2, 0);
      const longX = w >= d;
      if (longX) { add(g, bgeo(0.02, h * 0.9, 0.01), M.black, 0, h / 2, d / 2 + 0.006, false); add(g, bgeo(0.03, 0.2, 0.02), M.steel, -0.1, h / 2, d / 2 + 0.01, false); add(g, bgeo(0.03, 0.2, 0.02), M.steel, 0.1, h / 2, d / 2 + 0.01, false); }
      break;
    }
    case 'pedestal': {
      add(g, bgeo(w, h, d), M.marble, 0, h / 2, 0);
      add(g, bgeo(w + 0.1, 0.08, d + 0.1), M.marble, 0, h + 0.04, 0);
      break;
    }
    case 'boiler': {
      add(g, new THREE.CylinderGeometry(w * 0.45, w * 0.45, h, 16), M.rust, 0, h / 2, 0);
      add(g, new THREE.SphereGeometry(w * 0.45, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.rust, 0, h, 0);
      for (const y of [0.3, h - 0.3]) add(g, new THREE.CylinderGeometry(w * 0.47, w * 0.47, 0.1, 16), M.metal, 0, y, 0);
      add(g, new THREE.CylinderGeometry(0.09, 0.09, 1.2, 8), M.metal, w * 0.3, h + 0.5, 0);
      add(g, new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), M.steel, 0, h * 0.55, d * 0.46, false).rotation.x = Math.PI / 2;
      break;
    }
    case 'couch': {
      const longX = w >= d;
      const L = longX ? w : d, T = longX ? d : w;
      const root = new THREE.Group();
      g.add(root);
      add(root, bgeo(L, 0.4, T), M.fabric2, 0, 0.2, 0);
      add(root, bgeo(L, 0.5, 0.22), M.fabric2, 0, 0.55, -T / 2 + 0.11);
      for (const sx of [-1, 1]) add(root, bgeo(0.2, 0.55, T), M.fabric2, sx * (L / 2 - 0.1), 0.38, 0);
      root.rotation.y = longX ? 0 : Math.PI / 2;
      break;
    }
  }
  return g;
}
