import { renderer } from './gfx';
import { hostChooseUpgrade, hostRestart } from './sim';
import { S, maxStamina } from './state';

const keys: Record<string, boolean> = {};
let locked = false;
export const isLocked = (): boolean => locked;

export function initInput(): void {
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (!S.started) return;
    if (e.code === 'KeyM') S.showMap = !S.showMap;
    if (S.isHost) {
      if (e.code === 'Digit1') hostChooseUpgrade('sta');
      else if (e.code === 'Digit2') hostChooseUpgrade('str');
      else if (e.code === 'Digit3') hostChooseUpgrade('spd');
      else if (e.code === 'KeyR') hostRestart();
    }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });

  addEventListener('mousemove', e => {
    const me = S.me;
    if (!locked || !me) return;
    me.yaw -= e.movementX * 0.0022;
    me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - e.movementY * 0.0022));
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
    const resume = document.getElementById('resume');
    if (resume) resume.style.display = S.started && !locked ? 'flex' : 'none';
    if (!locked && S.me) S.me.grab = false;
  });
  document.getElementById('resume')?.addEventListener('click', () => { void renderer.domElement.requestPointerLock(); });
}

export function lockPointer(): void {
  void renderer.domElement.requestPointerLock();
}

/** Local first-person movement. The host's own player is authoritative here; clients send their position to the host. */
export function moveLocal(dt: number): void {
  const me = S.me, nav = S.nav;
  if (!me || !nav) return;
  me.mv = 0;
  if (!me.alive) return;
  const f = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const s = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const moving = (f !== 0 || s !== 0) && locked;
  const sprint = moving && !!keys['ShiftLeft'] && me.stam > 0;
  if (moving) {
    const spd = (sprint ? 6.2 : 3.6) * (1 + 0.1 * S.upg.spd);
    const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
    let dx = -sy * f + cy * s, dz = -cy * f - sy * s;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    [me.x, me.z] = nav.collide(me.x + dx * spd * dt, me.z + dz * spd * dt, 0.4);
    me.mv = sprint ? 2 : 1;
  }
  me.stam = sprint ? Math.max(0, me.stam - 22 * dt) : Math.min(maxStamina(), me.stam + 12 * dt);
}
