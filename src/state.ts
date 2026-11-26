import type { GameState, Player } from './types';

export const S: GameState = {
  started: false, isHost: false, myId: 'host', hostPeerId: 'host', me: null,
  players: new Map(), remote: new Map(),
  monsters: [], mview: [], items: [],
  cart: { x: 6.4, z: 4.5, yaw: -2.36, driver: null, driverIdx: -1 },
  map: null, nav: null, world: null,
  level: 1, quota: 1000, banked: 0, phase: 'play',
  upg: { sta: 0, str: 0, spd: 0, lamp: 0, vit: 0 },
  wallet: 0, flares: 1, mapChoice: 'random', difficulty: 'easy', levelTime: 0,
  armTime: 0, lastSeed: 0, explored: new Set(), showMap: false,
};

export function newPlayer(id: string, idx: number): Player {
  return {
    id, idx, x: 5, z: 5, yaw: -2.36, pitch: 0, hp: 100, alive: true, stam: 100,
    grab: false, thrN: 0, lastThr: 0, wasGrab: false, use: false, flN: 0, lastFl: 0,
    cartN: 0, lastCart: 0,
    held: null, hd: 2, mv: 0, nt: 0, inv: 0, rev: 0,
  };
}

export const maxStamina = (): number => 100 + 30 * S.upg.sta;
export const maxHealth = (): number => 100 + 25 * S.upg.vit;
