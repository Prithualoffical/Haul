import { SHOP } from './config';
import { renderer } from './gfx';
import { hostBuy, hostContinue, hostRestart } from './sim';
import { isTouch, settings } from './settings';
import { S, maxStamina } from './state';
import { toggleMic } from './voice';

export const keys: Record<string, boolean> = {};
/** Virtual joystick (touch): f = forward/back, s = strafe, both -1..1. */
export const touchMove = { f: 0, s: 0 };
export const touchBtn = { use: false };
let locked = false;

export const isLocked = (): boolean => locked || (isTouch && S.started);

export function lockPointer(): void {
  if (isTouch) {
    try { void document.documentElement.requestFullscreen(); } catch { /* optional */ }
    return;
  }
  void renderer.domElement.requestPointerLock();
}

export function lookBy(dx: number, dy: number): void {
  const me = S.me;
  if (!me || !isLocked()) return;
  me.yaw -= dx;
  me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - dy));
}

export function fireFlareInput(): void {
  if (S.me && S.me.alive) S.me.flN++;
}

export function initInput(): void {
  addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (!S.started) return;
    if (e.code === 'KeyM') S.showMap = !S.showMap;
    if (e.code === 'KeyV') toggleMic();
    if (e.code === 'KeyF') fireFlareInput();
    if (S.isHost) {
      if (S.phase === 'clear') {
        const m = /^Digit([1-9])$/.exec(e.code);
        if (m) {
          const item = SHOP[Number(m[1]) - 1];
          if (item) hostBuy(item.key);
        }
        if (e.code === 'Enter' || e.code === 'Space') hostContinue();
      }
      if (e.code === 'KeyR') hostRestart();
    }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });

  addEventListener('mousemove', e => {
    if (!locked) return;
    const k = 0.0022 * settings.sens;
    lookBy(e.movementX * k, e.movementY * k);
  });
  addEventListener('mousedown', e => {
    const me = S.me;
    if (!locked || !me) return;
    if (e.button === 0) me.grab = true;
    if (e.button === 2) me.thrN++;
  });
  addEventListener('mouseup', e => {
    if (S.me && e.button === 0) S.me.grab = false;
  });
  addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
    const pause = document.getElementById('resume');
    if (pause) pause.style.display = S.started && !locked && !isTouch ? 'flex' : 'none';
    if (!locked && S.me) { S.me.grab = false; S.me.use = false; }
  });
  document.getElementById('resumebtn')?.addEventListener('click', () => { void renderer.domElement.requestPointerLock(); });
}

/** Local first-person movement. The host's own player is authoritative here; clients send their position to the host. */
export function moveLocal(dt: number): void {
  const me = S.me, nav = S.nav;
  if (!me || !nav) return;
  me.mv = 0;
  me.use = isLocked() && (!!keys['KeyE'] || touchBtn.use);
  if (!me.alive) return;
  const f = Math.max(-1, Math.min(1, (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0) + touchMove.f));
  const s = Math.max(-1, Math.min(1, (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0) + touchMove.s));
  const moving = (Math.abs(f) > 0.08 || Math.abs(s) > 0.08) && isLocked();
  const sprint = moving && !!keys['ShiftLeft'] && me.stam > 0;
  if (moving) {
    const spd = (sprint ? 6.2 : 3.6) * (1 + 0.1 * S.upg.spd);
    const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
    let dx = -sy * f + cy * s, dz = -cy * f - sy * s;
    const l = Math.hypot(dx, dz);
    if (l > 1) { dx /= l; dz /= l; }
    [me.x, me.z] = nav.collide(me.x + dx * spd * dt, me.z + dz * spd * dt, 0.4);
    me.mv = sprint ? 2 : 1;
  }
  me.stam = sprint ? Math.max(0, me.stam - 22 * dt) : Math.min(maxStamina(), me.stam + 12 * dt);
}
