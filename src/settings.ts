export interface Settings {
  sens: number;        // mouse / touch look sensitivity multiplier
  volume: number;      // master volume 0..1
  voiceVol: number;    // teammates' voice volume 0..1.5
  voice: boolean;      // voice chat on (needs mic permission at game start)
  fov: number;
  quality: 'high' | 'low';
}

const KEY = 'haul.settings.v1';
const DEFAULTS: Settings = { sens: 1, volume: 0.8, voiceVol: 1, voice: true, fov: 72, quality: 'high' };

export const isTouch: boolean =
  typeof window !== 'undefined' && ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0) &&
  !new URLSearchParams(location.search).has('desktop');

function load(): Settings {
  const s: Settings = { ...DEFAULTS, quality: isTouch ? 'low' : 'high' };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<Settings>;
      if (typeof j.sens === 'number') s.sens = Math.min(3, Math.max(0.2, j.sens));
      if (typeof j.volume === 'number') s.volume = Math.min(1, Math.max(0, j.volume));
      if (typeof j.voiceVol === 'number') s.voiceVol = Math.min(1.5, Math.max(0, j.voiceVol));
      if (typeof j.voice === 'boolean') s.voice = j.voice;
      if (typeof j.fov === 'number') s.fov = Math.min(100, Math.max(55, j.fov));
      if (j.quality === 'high' || j.quality === 'low') s.quality = j.quality;
    }
  } catch { /* storage unavailable: use defaults */ }
  return s;
}

export const settings: Settings = load();
const listeners: Array<() => void> = [];
export const onSettingsChange = (fn: () => void): void => { listeners.push(fn); };

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  for (const fn of listeners) fn();
}
