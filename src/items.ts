import * as THREE from 'three';
import { ITEM_DEFS } from './config';
import { buildItemView } from './itemview';
import { getLevelGroup } from './scene';
import { S } from './state';
import type { Item } from './types';

/** Create an item (visual only). The host additionally gives it a physics body. */
export function makeItem(i: number, type: number): Item {
  const def = ITEM_DEFS[type];
  const view = buildItemView(def, i);
  view.group.visible = false;
  getLevelGroup().add(view.group);
  const it: Item = {
    i, type, def, pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
    state: 0, frac: 1, hp: def.hp, zt: 0, r: Math.max(...def.size) / 2 + 0.1,
    body: null, broke: false, lastHit: 0, view, seen: false,
  };
  S.items.push(it);
  return it;
}

const v = new THREE.Vector3();
/** Closest active item along a look ray (used by the host to grab, and by the HUD to label what you're aiming at). */
export function pickItem(eye: THREE.Vector3, dir: THREE.Vector3, maxD = 4): { it: Item; t: number } | null {
  let best: Item | null = null;
  let bt = Infinity;
  for (const it of S.items) {
    if (it.state !== 0 || !it.seen) continue;
    v.copy(it.pos).sub(eye);
    const t = v.dot(dir);
    if (t < 0 || t > maxD) continue;
    const perp = v.addScaledVector(dir, -t).length();
    if (perp < it.r + 0.25 && t < bt) { bt = t; best = it; }
  }
  return best ? { it: best, t: bt } : null;
}
