import * as THREE from 'three';
import { playSfx } from './audio';
import { BAL, EYE, SHOP, type ShopKey } from './config';
import { pickItem } from './items';
import { roomAt } from './map';
import { drawMap, markExplored } from './minimap';
import { ownedOf, priceOf } from './shop';
import { maxHealth, maxStamina, S } from './state';
import { dirFrom } from './util';
import { micStatus, speakingNow } from './voice';

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
let flashA = 0;
let frameN = 0;
let shopBuilt = false;
let titleTimer = 0;
export const getHurt = (): number => hurt;
export function screenFlash(a: number): void { flashA = Math.max(flashA, a); }

/** Big location card shown for a few seconds at the start of every level. */
export function showTitle(level: number, name: string, tagline: string): void {
  const el = $('title');
  el.innerHTML = `<small>LEVEL ${level}</small>${name}<em>${tagline}</em>`;
  el.style.opacity = '1';
  window.clearTimeout(titleTimer);
  titleTimer = window.setTimeout(() => { el.style.opacity = '0'; }, 5200);
}

/** The host wires these so the HUD doesn't have to import the simulation. */
let handlers: { buy: (k: ShopKey) => void; next: () => void } = { buy: () => undefined, next: () => undefined };
export function setShopHandlers(h: typeof handlers): void { handlers = h; }

const eye = new THREE.Vector3();
const dir = new THREE.Vector3();

function buildShop(): void {
  const box = $('shopitems');
  box.innerHTML = '';
  SHOP.forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'shopitem';
    b.dataset['key'] = it.key;
    b.innerHTML = `<span class="sk">${i + 1}</span><span class="sn">${it.name}<small>${it.desc}</small></span><span class="sp"></span>`;
    b.addEventListener('click', () => handlers.buy(it.key));
    box.appendChild(b);
  });
  $('shopnext').addEventListener('click', () => handlers.next());
  shopBuilt = true;
}

function updateShop(): void {
  if (!shopBuilt) buildShop();
  $('wallet').textContent = `Team wallet: $${S.wallet}`;
  for (const b of Array.from($('shopitems').children) as HTMLElement[]) {
    const key = b.dataset['key'] as ShopKey;
    const price = priceOf(key);
    const sp = b.querySelector('.sp');
    if (sp) sp.textContent = `$${price}  (${ownedOf(key)})`;
    b.classList.toggle('poor', S.wallet < price);
    (b as HTMLButtonElement).disabled = !S.isHost;
  }
  const next = $('shopnext') as HTMLButtonElement;
  next.disabled = !S.isHost;
  next.textContent = S.isHost ? 'START NEXT LEVEL  [Enter]' : 'Waiting for the host to start the next level...';
}

export function updateHUD(dt: number): void {
  const me = S.me;
  if (!me) return;

  if (me.hp < lastHp - 0.5) { hurt = 1; playSfx('hit'); }
  lastHp = me.hp;
  hurt = Math.max(0, hurt - dt * 2.5);
  flashA = Math.max(0, flashA - dt * 1.6);
  $('hit').style.opacity = String(hurt * 0.7);
  $('flashfx').style.opacity = String(flashA);

  $('lvl').textContent = `LEVEL ${S.level}${S.map ? '  -  ' + S.map.name.toUpperCase() : ''}`;
  $('quota').textContent = `$${S.banked} / $${S.quota}`;
  $('qb').style.width = `${Math.min(100, (S.banked / S.quota) * 100)}%`;
  $('hpb').style.width = `${Math.max(0, (me.hp / maxHealth()) * 100)}%`;
  $('stb').style.width = `${(me.stam / maxStamina()) * 100}%`;
  $('flares').textContent = `FLARES [F]: ${S.flares}`;
  const n = S.isHost ? S.players.size : S.remote.size + 1;
  $('plist').textContent = `${n} player${n > 1 ? 's' : ''}`;

  const room = S.map ? roomAt(S.map, me.x, me.z) : null;
  $('room').textContent = room ? room.name.toUpperCase() : '';

  // grace period countdown so the player knows the early game is safe-ish
  const grace = S.isHost && S.phase === 'play' ? Math.ceil(BAL.graceSeconds - S.levelTime) : 0;
  $('grace').textContent = grace > 0 ? `Monsters are still asleep... ${grace}s` : '';

  const mic = micStatus();
  $('mic').textContent = mic.state === 'ok' ? (mic.on ? 'MIC ON [V]' : 'MIC MUTED [V]') : mic.state === 'denied' ? 'NO MIC (listening only)' : mic.state === 'pending' ? 'MIC...' : '';
  const talking = speakingNow();
  $('speak').textContent = talking.length ? `Talking: ${talking.map(i => `P${i}`).join(' ')}` : '';

  dirFrom(me.yaw, me.pitch, dir);
  eye.set(me.x, EYE, me.z);
  const r = me.alive ? pickItem(eye, dir, 4) : null;

  // revive prompt: nearest dead teammate in reach
  let prompt = '';
  if (me.alive) {
    const bodies = S.isHost
      ? [...S.players.values()].filter(p => !p.alive).map(p => ({ x: p.x, z: p.z, idx: p.idx, rev: p.rev }))
      : [...S.remote.values()].filter(p => !p.alive).map(p => ({ x: p.x, z: p.z, idx: p.idx, rev: p.rev }));
    for (const b of bodies) {
      if (Math.hypot(b.x - me.x, b.z - me.z) < BAL.reviveRange * 1.5) {
        const pct = Math.round((b.rev / BAL.reviveSeconds) * 100);
        prompt = `Hold E to revive Player ${b.idx + 1}${pct > 0 ? `  ${pct}%` : ''}`;
        break;
      }
    }
  }
  $('prompt').textContent = prompt;
  $('info').textContent = !prompt && r
    ? `${r.it.def.name}   $${Math.round(r.it.def.value * r.it.frac)}   (${Math.round(r.it.frac * 100)}% intact, ${r.it.def.mass} kg)`
    : '';

  let banner = '';
  if (S.phase === 'dead') {
    banner = S.isHost ? 'EVERYONE DIED<br><small>Press R to restart</small>' : 'EVERYONE DIED<br><small>Waiting for the host to restart...</small>';
  } else if (S.phase === 'play' && !me.alive) {
    banner = 'YOU DIED<br><small>Spectating - a teammate can revive you (hold E at your body)</small>';
  }
  $('banner').innerHTML = banner;
  $('restartbtn').style.display = S.phase === 'dead' && S.isHost ? 'block' : 'none';

  const showShop = S.phase === 'clear';
  $('shop').style.display = showShop ? 'flex' : 'none';
  if (showShop) updateShop();

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
