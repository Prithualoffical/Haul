import * as THREE from 'three';
import { EYE } from './config';
import { pickItem } from './items';
import { roomAt } from './map';
import { drawMap, markExplored } from './minimap';
import { playSfx } from './audio';
import { maxStamina, S } from './state';
import { dirFrom } from './util';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export function feed(text: string): void {
  const box = $('feed');
  const d = document.createElement('div');
  d.textContent = text;
  box.appendChild(d);
  setTimeout(() => d.remove(), 7000);
  while (box.children.length > 7 && box.firstChild) box.firstChild.remove();
}

let lastHp = 100;
let hurt = 0;
let frameN = 0;
export const getHurt = (): number => hurt;

const eye = new THREE.Vector3();
const dir = new THREE.Vector3();

export function updateHUD(dt: number): void {
  const me = S.me;
  if (!me) return;

  if (me.hp < lastHp - 0.5) { hurt = 1; playSfx('hit'); }
  lastHp = me.hp;
  hurt = Math.max(0, hurt - dt * 2.5);
  $('hit').style.opacity = String(hurt * 0.7);

  $('lvl').textContent = `LEVEL ${S.level}`;
  $('quota').textContent = `$${S.banked} / $${S.quota}`;
  $('qb').style.width = `${Math.min(100, (S.banked / S.quota) * 100)}%`;
  $('hpb').style.width = `${Math.max(0, me.hp)}%`;
  $('stb').style.width = `${(me.stam / maxStamina()) * 100}%`;
  const n = S.isHost ? S.players.size : S.remote.size + 1;
  $('plist').textContent = `${n} player${n > 1 ? 's' : ''}`;

  const room = S.map ? roomAt(S.map, me.x, me.z) : null;
  $('room').textContent = room ? room.name.toUpperCase() : '';

  dirFrom(me.yaw, me.pitch, dir);
  eye.set(me.x, EYE, me.z);
  const r = me.alive ? pickItem(eye, dir, 4) : null;
  $('info').textContent = r
    ? `${r.it.def.name}   $${Math.round(r.it.def.value * r.it.frac)}   (${Math.round(r.it.frac * 100)}% intact, ${r.it.def.mass} kg)`
    : '';

  let banner = '';
  if (S.phase === 'clear') {
    banner = S.isHost
      ? 'QUOTA MET!<br><small>Press 1 = +Stamina - 2 = +Strength - 3 = +Speed to descend</small>'
      : 'QUOTA MET!<br><small>Host is choosing an upgrade...</small>';
  } else if (S.phase === 'dead') {
    banner = S.isHost ? 'EVERYONE DIED<br><small>Press R to restart</small>' : 'EVERYONE DIED<br><small>Waiting for the host to restart...</small>';
  } else if (!me.alive) {
    banner = 'YOU DIED<br><small>Your team has to finish without you</small>';
  }
  $('banner').innerHTML = banner;

  markExplored();
  frameN++;
  if (frameN % 3 === 0) {
    const mini = $<HTMLCanvasElement>('mini').getContext('2d');
    if (mini) drawMap(mini, 190, false);
  }
  $('bigmap').style.display = S.showMap ? 'flex' : 'none';
  if (S.showMap) {
    const big = $<HTMLCanvasElement>('bigcv').getContext('2d');
    if (big) drawMap(big, 640, true);
  }
}
