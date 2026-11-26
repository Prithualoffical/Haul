import { audioStart, audioUpdate } from './audio';
import { clientSend, onServerMsg } from './client';
import { DIFFICULTIES } from './config';
import { render, updateDust } from './gfx';
import { feed, setShopHandlers, updateHUD } from './hud';
import { initInput, lockPointer, moveLocal } from './input';
import { startClientPeer, startHostPeer } from './net';
import { inviteLink, isValidCode, normalizeCode } from './roomcode';
import { saveSettings, isTouch, settings } from './settings';
import { hostBroadcast, hostBuy, hostContinue, hostLoadLevel, hostRestart, hostStep, onPlayerData, onPlayerJoin, onPlayerLeave } from './sim';
import { newPlayer, S } from './state';
import { initTouch } from './touch';
import type { Difficulty, MapChoice } from './types';
import { updateVisuals } from './visuals';
import { initVoice, updateVoice } from './voice';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function begin(): void {
  S.started = true;
  $('lobby').style.display = 'none';
  $('hud').style.display = 'block';
  $('resume').style.display = 'none';
  audioStart();
  lockPointer();
  if (isTouch) initTouch();
}

function startHost(online: boolean): void {
  audioStart();                                       // created inside the click so the browser allows sound
  S.isHost = true;
  S.myId = 'host';
  S.mapChoice = $<HTMLSelectElement>('mapsel').value as MapChoice;
  S.difficulty = $<HTMLSelectElement>('diffsel').value as Difficulty;
  S.flares = DIFFICULTIES[S.difficulty].startFlares;
  const me = newPlayer('host', 0);
  S.me = me;
  S.players.set('host', me);
  begin();
  hostLoadLevel(1);
  if (!online) return;
  $('codeShow').textContent = 'connecting...';
  startHostPeer({
    onCode: (id, code) => {
      S.hostPeerId = id;
      $('codeShow').textContent = `ROOM CODE: ${code}`;
      $('invcode').textContent = code;
      $('inviterow').style.display = 'block';
      $('copylink').onclick = () => {
        const done = (): void => { $('copylink').textContent = 'Copied!'; setTimeout(() => { $('copylink').textContent = 'Copy invite link'; }, 1800); };
        navigator.clipboard.writeText(inviteLink(code)).then(done, () => { $('copylink').textContent = inviteLink(code); });
      };
    },
    onJoin: onPlayerJoin,
    onData: onPlayerData,
    onLeave: onPlayerLeave,
    onError: msg => feed(`Network error: ${msg}`),
  });
  void initVoice();
}

function startClient(code: string): void {
  audioStart();
  $('status').textContent = 'Connecting...';
  startClientPeer(code, {
    onOpen: id => { S.myId = id; },
    onData: d => onServerMsg(d, begin),
    onClose: () => feed('Disconnected from host'),
    onError: msg => {
      const text = msg === 'peer-unavailable' ? 'No room with that code. Check it and try again.' : `Error: ${msg}`;
      $('status').textContent = text; feed(text);
    },
  });
  void initVoice();
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
    audioUpdate(info.nearest, info.danger, t, S.me.x, S.me.z);
    updateVoice(dt);
    updateDust(dt, t);
    updateHUD(dt);
  }
  render(dt, t, danger);
}

/* ---- settings panel (shown on the pause screen) ---- */
function bindSettings(): void {
  const range = (id: string, get: () => number, set: (v: number) => void): void => {
    const el = $<HTMLInputElement>(id);
    el.value = String(get());
    el.addEventListener('input', () => { set(Number(el.value)); saveSettings(); });
  };
  range('set-sens', () => settings.sens, v => { settings.sens = v; });
  range('set-vol', () => settings.volume, v => { settings.volume = v; });
  range('set-voice', () => settings.voiceVol, v => { settings.voiceVol = v; });
  range('set-fov', () => settings.fov, v => { settings.fov = v; });
  const q = $<HTMLSelectElement>('set-quality');
  q.value = settings.quality;
  q.addEventListener('change', () => { settings.quality = q.value === 'low' ? 'low' : 'high'; saveSettings(); $('qnote').style.display = 'block'; });
  const vc = $<HTMLInputElement>('set-voiceon');
  vc.checked = settings.voice;
  vc.addEventListener('change', () => { settings.voice = vc.checked; saveSettings(); });
}

initInput();
bindSettings();
setShopHandlers({ buy: hostBuy, next: hostContinue });
$('restartbtn').addEventListener('click', () => hostRestart());
$('solo').onclick = () => startHost(false);
$('host').onclick = () => startHost(true);
const codeBox = $<HTMLInputElement>('code');
const join = (): void => {
  if (!isValidCode(codeBox.value)) { $('status').textContent = 'Type the room code your friend sees (about 5 letters/numbers).'; return; }
  startClient(codeBox.value);
};
$('join').onclick = join;
codeBox.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
codeBox.addEventListener('input', () => { codeBox.value = normalizeCode(codeBox.value).slice(0, 8); });
{ // invite link: ?room=K7QP2 fills the box so a friend only has to press JOIN
  const fromUrl = new URLSearchParams(location.search).get('room');
  if (fromUrl) { codeBox.value = normalizeCode(fromUrl).slice(0, 8); $('status').textContent = 'Room code filled in from the invite link. Press JOIN.'; }
}
$('howbtn').onclick = () => { const h = $('how'); h.style.display = h.style.display === 'block' ? 'none' : 'block'; };
if (isTouch) $('lobbytip').textContent = 'Touch controls detected. Left thumb moves (push to the edge to sprint), right side looks.';
requestAnimationFrame(frame);
