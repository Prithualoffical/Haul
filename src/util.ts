import * as THREE from 'three';

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const r2 = (v: number): number => Math.round(v * 100) / 100;
export const r3 = (v: number): number => Math.round(v * 1000) / 1000;
export const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Look direction for a camera with rotation order YXZ (forward = -Z at yaw 0). */
export function dirFrom(yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}
