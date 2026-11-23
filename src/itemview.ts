import * as THREE from 'three';
import { paintingTexture } from './textures';
import type { ItemDef, ItemView } from './types';

function mesh(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** Detailed visuals for each valuable. Local origin = centre of the collision box. */
export function buildItemView(def: ItemDef, index: number): ItemView {
  const group = new THREE.Group();
  const tint: THREE.MeshStandardMaterial[] = [];
  let screen: THREE.MeshBasicMaterial | null = null;
  const std = (color: number, roughness = 0.6, metalness = 0.1): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    tint.push(m);
    return m;
  };
  const [sx, sy, sz] = def.size;

  switch (def.kind) {
    case 'vase': {
      const pts = [[0, -0.3], [0.13, -0.3], [0.19, -0.2], [0.21, -0.02], [0.14, 0.14], [0.08, 0.22], [0.1, 0.3], [0.0, 0.3]]
        .map(([x, y]) => new THREE.Vector2(x, y));
      mesh(group, new THREE.LatheGeometry(pts, 20), std(def.color, 0.25, 0.1));
      mesh(group, new THREE.TorusGeometry(0.12, 0.012, 6, 20), std(0xe0c060, 0.3, 0.8), 0, 0.02, 0).rotation.x = Math.PI / 2;
      break;
    }
    case 'painting': {
      const frame = std(0x8a6a24, 0.4, 0.5);
      mesh(group, new THREE.BoxGeometry(sx, sy, sz), frame);
      const tex = paintingTexture(index + 3);
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(sx - 0.14, sy - 0.14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      canvas.position.z = sz / 2 + 0.002;
      group.add(canvas);
      break;
    }
    case 'radio': {
      mesh(group, new THREE.BoxGeometry(sx, sy, sz), std(def.color, 0.55, 0.05));
      const grille = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 }));
      grille.position.set(-0.12, 0, sz / 2 + 0.002);
      group.add(grille);
      mesh(group, new THREE.BoxGeometry(0.16, 0.08, 0.02), std(0xe8dcb0, 0.5), 0.15, 0.08, sz / 2 + 0.005);
      for (const x of [0.1, 0.22]) mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), std(0x201810, 0.5, 0.4), x, -0.08, sz / 2 + 0.02).rotation.x = Math.PI / 2;
      const ant = mesh(group, new THREE.CylinderGeometry(0.008, 0.008, 0.35, 5), std(0xc0c0c0, 0.3, 0.9), 0.22, sy / 2 + 0.12, 0);
      ant.rotation.z = -0.4;
      break;
    }
    case 'monitor': {
      mesh(group, new THREE.BoxGeometry(0.72, 0.5, 0.34), std(0xb6b2a2, 0.6), 0, 0.03, -0.03);
      mesh(group, new THREE.BoxGeometry(0.2, 0.06, 0.28), std(0xa8a496, 0.6), 0, -0.27, 0);
      screen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.1, 1.6) });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.4), screen);
      scr.position.set(0, 0.03, 0.141);
      group.add(scr);
      break;
    }
    case 'statue': {
      const marble = std(def.color, 0.3, 0.05);
      mesh(group, new THREE.BoxGeometry(sx, 0.2, sz), marble, 0, -sy / 2 + 0.1, 0);
      mesh(group, new THREE.CylinderGeometry(0.1, 0.18, 0.5, 12), marble, 0, -0.15, 0);
      mesh(group, new THREE.SphereGeometry(0.13, 14, 10), marble, 0, 0.2, 0);
      for (const s of [-1, 1]) mesh(group, new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), marble, s * 0.2, -0.1, 0).rotation.z = s * 0.2;
      mesh(group, new THREE.ConeGeometry(0.1, 0.15, 10), marble, 0, 0.4, 0);
      break;
    }
    case 'safe': {
      const steel = std(def.color, 0.35, 0.85);
      mesh(group, new THREE.BoxGeometry(sx, sy, sz), steel);
      mesh(group, new THREE.BoxGeometry(sx - 0.14, sy - 0.14, 0.03), std(0x2a3f3f, 0.4, 0.85), 0, 0, sz / 2 + 0.005);
      const wheel = mesh(group, new THREE.TorusGeometry(0.11, 0.018, 8, 18), std(0xd0d0c0, 0.3, 0.9), 0, 0.02, sz / 2 + 0.04);
      wheel.rotation.z = 0.3;
      mesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), std(0xd0d0c0, 0.3, 0.9), 0, 0.02, sz / 2 + 0.03).rotation.x = Math.PI / 2;
      for (const y of [-0.3, 0.3]) mesh(group, new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8), std(0x1a1a1a, 0.5, 0.6), -sx / 2 + 0.02, y, sz / 2);
      break;
    }
  }
  return { group, tint, screen };
}
