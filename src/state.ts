import type { GameState, Player } from './types';

export const S: GameState = {
  started: false, isHost: false, myId: 'host', me: null,
  players: new Map(), remote: new Map(),
  monsters: [], mview: [], items: [],
  map: null, nav: null, world: null,
  level: 1, quota: 1000, banked: 0, phase: 'play', upg: { sta: 0, str: 0, spd: 0 },
  armTime: 0, lastSeed: 0, explored: new Set(), showMap: false,
};

export function newPlayer(id: string, idx: number): Player {
  return {
    id, idx, x: 5, z: 5, yaw: -2.36, pitch: 0, hp: 100, alive: true, stam: 100,
    grab: false, thrN: 0, lastThr: 0, wasGrab: false, held: null, hd: 2, mv: 0, nt: 0,
  };
}

export const maxStamina = (): number => 100 + 30 * S.upg.sta;
