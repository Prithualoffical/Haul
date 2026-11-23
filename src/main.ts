import { audioStart, audioUpdate } from './audio';
import { clientSend, onServerMsg } from './client';
import { render, updateDust } from './gfx';
import { feed, updateHUD } from './hud';
import { initInput, lockPointer, moveLocal } from './input';
import { startClientPeer, startHostPeer } from './net';
import { hostBroadcast, hostLoadLevel, hostStep, onPlayerData, onPlayerJoin, onPlayerLeave } from './sim';
import { newPlayer, S } from './state';
import { updateVisuals } from './visuals';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function begin(): void {
  S.started = true;
  $('lobby').style.display = 'none';
  $('hud').style.display = 'block';
  $('resume').style.display = 'none';
  audioStart();
  lockPointer();
}

function startHost(online: boolean): void {
  S.isHost = true;
  S.myId = 'host';
  const me = newPlayer('host', 0);
  S.me = me;
  S.players.set('host', me);
  begin();
  hostLoadLevel(1);
  if (!online) return;
  $('codeShow').textContent = 'connecting...';
  startHostPeer({
    onCode: id => { $('codeShow').textContent = `CODE: ${id}`; },
    onJoin: onPlayerJoin,
    onData: onPlayerData,
    onLeave: onPlayerLeave,
    onError: msg => feed(`Network error: ${msg}`),
  });
}

function startClient(code: string): void {
  $('status').textContent = 'Connecting...';
  startClientPeer(code, {
    onOpen: id => { S.myId = id; },
    onData: d => onServerMsg(d, begin),
    onClose: () => feed('Disconnected from host'),
    onError: msg => { $('status').textContent = `Error: ${msg}`; feed(`Network error: ${msg}`); },
  });
  setTimeout(() => { if (!S.started) $('status').textContent = 'No response from host. Check the code.'; }, 9000);
}

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  let danger = 0;
  if (S.started && S.me) {
    moveLocal(dt);
    if (S.isHost) { hostStep(dt); hostBroadcast(dt); } else clientSend(dt);
    const info = updateVisuals(dt, t);
    danger = info.danger;
    audioUpdate(info.nearest, info.danger, t);
    updateDust(dt, t);
    updateHUD(dt);
  }
  render(dt, t, danger);
}

initInput();
$('solo').onclick = () => startHost(false);
$('host').onclick = () => startHost(true);
$('join').onclick = () => {
  const code = $<HTMLInputElement>('code').value.trim();
  if (code) startClient(code);
};
requestAnimationFrame(frame);
