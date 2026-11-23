import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { Nav } from './nav';

export type Phase = 'play' | 'clear' | 'dead';
export type Sfx = 'extract' | 'break' | 'death' | 'hit';

export type ThemeId =
  | 'dock' | 'kitchen' | 'boiler' | 'library' | 'hall'
  | 'bedroom' | 'gallery' | 'server' | 'vault';

export type PropKind =
  | 'crate' | 'barrel' | 'counter' | 'table' | 'shelf' | 'pillar' | 'rack'
  | 'bed' | 'wardrobe' | 'pedestal' | 'boiler' | 'couch';

export interface Rect { x1: number; z1: number; x2: number; z2: number; h: number }

/** axis 'x' = the wall runs along z at x=line; axis 'z' = the wall runs along x at z=line. c = doorway centre. */
export interface Door { axis: 'x' | 'z'; line: number; c: number }

export interface Room {
  id: number; name: string; theme: ThemeId;
  rx: number; rz: number; x1: number; z1: number; x2: number; z2: number; tier: number;
}
export interface Prop { kind: PropKind; x: number; z: number; w: number; d: number; h: number; seed: number }
export interface Lamp { x: number; z: number; color: number; on: boolean; flicker: boolean; roomId: number }
export interface MapData {
  seed: number; walls: Rect[]; props: Prop[]; solids: Rect[];
  rooms: Room[]; doors: Door[]; lamps: Lamp[];
}

export type ItemKind = 'vase' | 'painting' | 'radio' | 'monitor' | 'statue' | 'safe';
export interface ItemDef {
  kind: ItemKind; name: string; size: [number, number, number];
  mass: number; value: number; hp: number; color: number;
}
export interface ItemView {
  group: THREE.Group;
  tint: THREE.MeshStandardMaterial[];
  screen: THREE.MeshBasicMaterial | null;
}
export interface Item {
  i: number; type: number; def: ItemDef;
  pos: THREE.Vector3; quat: THREE.Quaternion;
  state: 0 | 1 | 2;          // 0 active, 1 extracted, 2 destroyed
  frac: number; hp: number; zt: number; r: number;
  body: CANNON.Body | null; broke: boolean; lastHit: number;
  view: ItemView | null; seen: boolean;
}

export interface Upgrades { sta: number; str: number; spd: number }

export interface Player {
  id: string; idx: number;
  x: number; z: number; yaw: number; pitch: number;
  hp: number; alive: boolean; stam: number;
  grab: boolean; thrN: number; lastThr: number; wasGrab: boolean;
  held: Item | null; hd: number; mv: number; nt: number;
}
export interface RemotePlayer { x: number; z: number; yaw: number; alive: boolean; idx: number }

export type MonsterMode = 'patrol' | 'investigate' | 'chase';
export interface Monster {
  x: number; z: number; yaw: number; state: MonsterMode;
  path: { x: number; z: number }[] | null; pi: number; rp: number; has: boolean;
  wait: number; tx: number; tz: number; lost: number; atk: number;
}
export interface MonsterView { x: number; z: number; yaw: number; chasing: boolean }

export interface GameState {
  started: boolean; isHost: boolean; myId: string; me: Player | null;
  players: Map<string, Player>; remote: Map<string, RemotePlayer>;
  monsters: Monster[]; mview: MonsterView[]; items: Item[];
  map: MapData | null; nav: Nav | null; world: CANNON.World | null;
  level: number; quota: number; banked: number; phase: Phase; upg: Upgrades;
  armTime: number; lastSeed: number; explored: Set<number>; showMap: boolean;
}

/* ---------- network messages ---------- */
export interface LvlMsg {
  t: 'lvl'; seed: number; L: number; q: number; up: Upgrades;
  items: number[]; you: string | null; sp: [number, number] | null; idx: number;
}
export type SnapPlayer = [string, number, number, number, number, number, number];
export interface SnapMsg {
  t: 's'; ph: Phase; b: number; q: number; L: number; up: Upgrades;
  p: SnapPlayer[]; i: number[][]; m: number[][];
}
export interface TextMsg { t: 'msg'; m: string; sfx?: Sfx }
export type ServerMsg = LvlMsg | SnapMsg | TextMsg;
export interface InputMsg {
  t: 'in'; x: number; z: number; yaw: number; pitch: number; grab: boolean; thrN: number; mv: number;
}
