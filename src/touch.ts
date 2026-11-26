import { fireFlareInput, keys, lookBy, touchBtn, touchMove } from './input';
import { settings } from './settings';
import { S } from './state';

/**
 * On-screen controls for phones / tablets: a left-thumb joystick, a right-thumb look area, and buttons.
 * Everything feeds the same state as the keyboard and mouse, so nothing else in the game needs to know.
 */
const R = 52;   // joystick radius in px

export function initTouch(): void {
  const root = document.getElementById('touch');
  if (!root) return;
  root.style.display = 'block';
  const stick = document.getElementById('stick') as HTMLElement;
  const knob = document.getElementById('knob') as HTMLElement;

  let stickId = -1, sx = 0, sy = 0;
  let lookId = -1, lx = 0, ly = 0;

  const resetStick = (): void => { stickId = -1; touchMove.f = 0; touchMove.s = 0; knob.style.transform = 'translate(0px,0px)'; };

  stick.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    stickId = t.identifier;
    const r = stick.getBoundingClientRect();
    sx = r.left + r.width / 2; sy = r.top + r.height / 2;
  }, { passive: false });

  const look = document.getElementById('lookzone') as HTMLElement;
  look.addEventListener('touchstart', e => {
    e.preventDefault();
    if (lookId !== -1) return;
    const t = e.changedTouches[0];
    lookId = t.identifier; lx = t.clientX; ly = t.clientY;
  }, { passive: false });

  addEventListener('touchmove', e => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId) {
        let dx = t.clientX - sx, dy = t.clientY - sy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        touchMove.s = dx / R;
        touchMove.f = -dy / R;
        keys['ShiftLeft'] = d > R * 0.95;               // push the stick all the way out to sprint
      } else if (t.identifier === lookId) {
        const k = 0.0045 * settings.sens;
        lookBy((t.clientX - lx) * k, (t.clientY - ly) * k);
        lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: true });

  const end = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId) { resetStick(); keys['ShiftLeft'] = false; }
      if (t.identifier === lookId) lookId = -1;
    }
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);

  const bind = (id: string, down: () => void, up?: () => void): void => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); down(); }, { passive: false });
    if (up) {
      el.addEventListener('touchend', e => { e.preventDefault(); up(); }, { passive: false });
      el.addEventListener('touchcancel', () => up());
    }
  };
  bind('tb-grab', () => { if (S.me) S.me.grab = true; }, () => { if (S.me) S.me.grab = false; });
  bind('tb-throw', () => { if (S.me) S.me.thrN++; });
  bind('tb-use', () => { touchBtn.use = true; }, () => { touchBtn.use = false; });
  bind('tb-flare', () => fireFlareInput());
  bind('tb-map', () => { S.showMap = !S.showMap; });
}
