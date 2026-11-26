import { DIRS } from './config';
import type { Rect } from './types';

/** 1 m navigation grid over the arena + collision / line-of-sight helpers. Pure logic, no rendering. */
export class Nav {
  readonly blocked: Uint8Array;

  constructor(readonly solids: Rect[], readonly size: number) {
    const W = size;
    this.blocked = new Uint8Array(W * W);
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < W; j++) {
        const cx = i + 0.5, cz = j + 0.5;
        for (const s of solids) {
          if (cx > s.x1 - 0.5 && cx < s.x2 + 0.5 && cz > s.z1 - 0.5 && cz < s.z2 + 0.5) {
            this.blocked[j * W + i] = 1;
            break;
          }
        }
      }
    }
  }

  cell(v: number): number { return Math.max(0, Math.min(this.size - 1, Math.floor(v))); }

  isFree(x: number, z: number): boolean {
    return x > 0 && z > 0 && x < this.size && z < this.size && this.blocked[this.cell(z) * this.size + this.cell(x)] === 0;
  }

  private neighbours(c: number, out: number[]): void {
    const W = this.size;
    out.length = 0;
    const cx = c % W, cz = (c / W) | 0;
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
      const n = nz * W + nx;
      if (this.blocked[n]) continue;
      if (dx !== 0 && dz !== 0 && (this.blocked[cz * W + nx] || this.blocked[nz * W + cx])) continue;
      out.push(n);
    }
  }

  /** Shortest 8-way path (BFS) between two world positions, as cell-centre waypoints. */
  findPath(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] | null {
    const W = this.size;
    const s = this.cell(sz) * W + this.cell(sx), t = this.cell(tz) * W + this.cell(tx);
    if (this.blocked[t]) return null;
    const prev = new Int16Array(W * W).fill(-2);
    const q: number[] = [s];
    const nb: number[] = [];
    prev[s] = -1;
    let found = s === t;
    for (let h = 0; h < q.length && !found; h++) {
      this.neighbours(q[h], nb);
      for (const n of nb) {
        if (prev[n] !== -2) continue;
        prev[n] = q[h];
        q.push(n);
        if (n === t) { found = true; break; }
      }
    }
    if (!found) return null;
    const path: { x: number; z: number }[] = [];
    for (let c = t; c !== -1 && c !== s; c = prev[c]) path.push({ x: (c % W) + 0.5, z: Math.floor(c / W) + 0.5 });
    return path.reverse();
  }

  /** 1 for every cell reachable on foot from the start point, else 0. */
  reachMap(sx: number, sz: number): Uint8Array {
    const W = this.size;
    const seen = new Uint8Array(W * W);
    const s = this.cell(sz) * W + this.cell(sx);
    if (this.blocked[s]) return seen;
    const q: number[] = [s];
    const nb: number[] = [];
    seen[s] = 1;
    for (let h = 0; h < q.length; h++) {
      this.neighbours(q[h], nb);
      for (const n of nb) if (!seen[n]) { seen[n] = 1; q.push(n); }
    }
    return seen;
  }

  /** True if the cell under (x, z) can be walked to from the reach map's start. */
  reachable(reach: Uint8Array, x: number, z: number): boolean {
    return reach[this.cell(z) * this.size + this.cell(x)] === 1;
  }

  /** Fraction of all free cells reachable from a start point (used to reject maps with sealed pockets). */
  reachableRatio(sx: number, sz: number): number {
    const W = this.size;
    const seen = this.reachMap(sx, sz);
    let free = 0, got = 0;
    for (let i = 0; i < W * W; i++) {
      if (!this.blocked[i]) { free++; if (seen[i]) got++; }
    }
    return got / Math.max(1, free);
  }

  /** Line of sight; only tall obstacles (walls, pillars, shelves) block it - tables and crates don't. */
  lineClear(x1: number, z1: number, x2: number, z2: number): boolean {
    const d = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.ceil(d / 0.4);
    for (let k = 1; k < n; k++) {
      const x = x1 + ((x2 - x1) * k) / n, z = z1 + ((z2 - z1) * k) / n;
      for (const s of this.solids) {
        if (s.h < 1.5) continue;
        if (x > s.x1 && x < s.x2 && z > s.z1 && z < s.z2) return false;
      }
    }
    return true;
  }

  /** Push a circle out of every solid rectangle. */
  collide(x: number, z: number, r: number): [number, number] {
    for (let pass = 0; pass < 2; pass++) {
      for (const s of this.solids) {
        const cx = Math.max(s.x1, Math.min(x, s.x2));
        const cz = Math.max(s.z1, Math.min(z, s.z2));
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          const l = x - s.x1, rr = s.x2 - x, t = z - s.z1, b = s.z2 - z;
          const m = Math.min(l, rr, t, b);
          if (m === l) x = s.x1 - r;
          else if (m === rr) x = s.x2 + r;
          else if (m === t) z = s.z1 - r;
          else z = s.z2 + r;
        }
      }
    }
    return [x, z];
  }
}
