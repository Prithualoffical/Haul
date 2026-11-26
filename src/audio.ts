import { onSettingsChange, settings } from './settings';
import type { MonsterKind, Sfx } from './types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let drone: GainNode | null = null;
let pulse: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let nextAmbient = 4;

export const getAudioCtx = (): AudioContext | null => ctx;
export const getMaster = (): GainNode | null => master;

export function audioStart(): void {
  if (ctx) { void ctx.resume(); return; }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    onSettingsChange(() => { if (master) master.gain.value = settings.volume; });

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 46;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 150;
    drone = ctx.createGain();
    drone.gain.value = 0;
    o.connect(f); f.connect(drone); drone.connect(master);
    o.start();

    const hb = ctx.createOscillator();
    hb.type = 'sine';
    hb.frequency.value = 55;
    pulse = ctx.createGain();
    pulse.gain.value = 0;
    hb.connect(pulse); pulse.connect(master);
    hb.start();

    // constant faint room tone so silence never feels "safe"
    const room = ctx.createBufferSource();
    room.buffer = noiseBuf;
    room.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 220;
    const rg = ctx.createGain();
    rg.gain.value = 0.035;
    room.connect(rf); rf.connect(rg); rg.connect(master);
    room.start();
  } catch {
    ctx = null; // audio is optional
  }
}

/** Keep the 3D audio listener on the camera so monsters and voices are heard from the right direction. */
export function setListener(x: number, y: number, z: number, yaw: number): void {
  if (!ctx) return;
  const l = ctx.listener;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (l.positionX) {
    l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
    l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else {
    l.setPosition(x, y, z);
    l.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

/* ------------------------------------------------------------------ */
/*  Monster voices: one positional growl per monster                   */
/* ------------------------------------------------------------------ */
interface Voice { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode; panner: PannerNode }
const voices: Voice[] = [];
const BASE_PITCH: Record<MonsterKind, number> = { stalker: 70, runner: 120, brute: 42, listener: 95 };

function makeVoice(): Voice | null {
  if (!ctx || !master) return null;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const bp = ctx.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = 380;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 14;
  lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 2;
  panner.rolloffFactor = 1.4;
  panner.maxDistance = 45;
  osc.connect(bp); bp.connect(gain); gain.connect(panner); panner.connect(master);
  osc.start(); lfo.start();
  return { osc, lfo, gain, panner };
}

export interface MonsterAudio { kind: MonsterKind; x: number; z: number; chasing: boolean; stunned: boolean }
export function audioMonsters(list: MonsterAudio[]): void {
  if (!ctx) return;
  while (voices.length < list.length) { const v = makeVoice(); if (!v) return; voices.push(v); }
  while (voices.length > list.length) {
    const v = voices.pop();
    if (v) { v.osc.stop(); v.lfo.stop(); v.panner.disconnect(); }
  }
  const now = ctx.currentTime;
  list.forEach((m, i) => {
    const v = voices[i];
    v.panner.positionX.setTargetAtTime(m.x, now, 0.05);
    v.panner.positionY.setTargetAtTime(1.5, now, 0.05);
    v.panner.positionZ.setTargetAtTime(m.z, now, 0.05);
    const pitch = BASE_PITCH[m.kind] * (m.chasing ? 1.35 : 1);
    v.osc.frequency.setTargetAtTime(pitch, now, 0.2);
    v.lfo.frequency.setTargetAtTime(m.chasing ? 9 : 4, now, 0.3);
    v.gain.gain.setTargetAtTime(m.stunned ? 0 : m.chasing ? 0.55 : 0.22, now, 0.15);
  });
}

/* ------------------------------------------------------------------ */
/*  One-shots                                                          */
/* ------------------------------------------------------------------ */
function burst(dur: number, gain: number, type: BiquadFilterType, f0: number, f1 = f0, pan?: { x: number; y: number; z: number }): void {
  if (!ctx || !master || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f0, ctx.currentTime);
  fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  src.connect(fl); fl.connect(g);
  if (pan) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.positionX.value = pan.x; p.positionY.value = pan.y; p.positionZ.value = pan.z;
    g.connect(p); p.connect(master);
  } else g.connect(master);
  src.start();
  src.stop(ctx.currentTime + dur);
}

function blip(freq: number, dur: number, gain: number, type: OscillatorType, slideTo = freq, delay = 0): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0);
  o.stop(t0 + dur);
}

export function playSfx(s: Sfx): void {
  if (s === 'extract') { blip(660, 0.18, 0.12, 'sine'); blip(990, 0.25, 0.12, 'sine', 990, 0.11); }
  else if (s === 'break') { blip(400, 0.35, 0.18, 'square', 60); burst(0.3, 0.3, 'highpass', 2500, 800); }
  else if (s === 'death') { blip(160, 0.9, 0.25, 'sawtooth', 30); burst(0.5, 0.25, 'lowpass', 900, 100); }
  else if (s === 'flare') { burst(0.9, 0.35, 'bandpass', 600, 5000); blip(1400, 0.5, 0.08, 'sine', 300); }
  else if (s === 'revive') { blip(440, 0.25, 0.14, 'sine'); blip(554, 0.25, 0.14, 'sine', 554, 0.14); blip(659, 0.45, 0.14, 'sine', 659, 0.28); }
  else if (s === 'buy') { blip(1320, 0.12, 0.1, 'triangle'); blip(1760, 0.3, 0.1, 'triangle', 1760, 0.09); }
  else { blip(120, 0.25, 0.25, 'sawtooth', 40); burst(0.18, 0.3, 'lowpass', 700, 150); }
}

let stepToggle = false;
export function footstep(sprint: boolean): void {
  stepToggle = !stepToggle;
  burst(0.07, sprint ? 0.22 : 0.1, 'lowpass', stepToggle ? 520 : 420, 120);
}

/** nearest: distance to closest monster (m). danger: 0..1 while being hunted. */
export function audioUpdate(nearest: number, danger: number, t: number, px: number, pz: number): void {
  if (!ctx || !drone || !pulse) return;
  drone.gain.value = Math.max(0, 1 - nearest / 24) * 0.3;
  const beat = Math.pow(Math.max(0, Math.sin(t * (6 + danger * 6))), 8);
  pulse.gain.value = danger * 0.35 * beat;

  if (t > nextAmbient) {
    nextAmbient = t + 7 + Math.random() * 12;
    const a = Math.random() * Math.PI * 2, d = 7 + Math.random() * 9;
    const pos = { x: px + Math.cos(a) * d, y: 1.4, z: pz + Math.sin(a) * d };
    const r = Math.random();
    if (r < 0.4) burst(1.1, 0.18, 'bandpass', 900, 260, pos);                       // creaking timber
    else if (r < 0.75) burst(0.25, 0.4, 'lowpass', 220, 60, pos);                    // distant thud
    else burst(1.6, 0.1, 'bandpass', 1800, 700, pos);                                // faint whisper of air
  }
}
