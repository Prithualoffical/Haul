import type { Sfx } from './types';

let ctx: AudioContext | null = null;
let drone: GainNode | null = null;
let pulse: GainNode | null = null;

export function audioStart(): void {
  if (ctx) return;
  try {
    ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 46;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 150;
    drone = ctx.createGain();
    drone.gain.value = 0;
    o.connect(f); f.connect(drone); drone.connect(ctx.destination);
    o.start();

    const hb = ctx.createOscillator();
    hb.type = 'sine';
    hb.frequency.value = 55;
    pulse = ctx.createGain();
    pulse.gain.value = 0;
    hb.connect(pulse); pulse.connect(ctx.destination);
    hb.start();
  } catch {
    ctx = null; // audio is optional
  }
}

/** nearest: distance to closest monster (m). danger: 0..1 while being hunted. */
export function audioUpdate(nearest: number, danger: number, t: number): void {
  if (!ctx || !drone || !pulse) return;
  drone.gain.value = Math.max(0, 1 - nearest / 24) * 0.3;
  const beat = Math.pow(Math.max(0, Math.sin(t * (6 + danger * 6))), 8);
  pulse.gain.value = danger * 0.35 * beat;
}

function blip(freq: number, dur: number, gain: number, type: OscillatorType, slideTo = freq): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

export function playSfx(s: Sfx): void {
  if (s === 'extract') { blip(660, 0.18, 0.12, 'sine'); setTimeout(() => blip(990, 0.25, 0.12, 'sine'), 110); }
  else if (s === 'break') blip(400, 0.35, 0.18, 'square', 60);
  else if (s === 'death') blip(160, 0.9, 0.25, 'sawtooth', 30);
  else blip(120, 0.25, 0.25, 'sawtooth', 40);
}
