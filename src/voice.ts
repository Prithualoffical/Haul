import type { MediaConnection } from 'peerjs';
import { getAudioCtx, getMaster } from './audio';
import { getPeer } from './net';
import { onSettingsChange, settings } from './settings';
import { S } from './state';

/**
 * Proximity voice chat. Every pair of players opens one WebRTC media call (the player with the smaller
 * peer id dials, so exactly one call exists per pair). Each incoming stream is played through a 3D
 * PannerNode placed on that player, so teammates sound like they're really standing where they are:
 * quieter with distance, and coming from the right direction.
 */
interface Playback {
  call: MediaConnection; el: HTMLAudioElement; src: MediaStreamAudioSourceNode;
  gain: GainNode; panner: PannerNode; analyser: AnalyserNode; buf: Uint8Array; speaking: boolean;
}

let stream: MediaStream | null = null;
let micOn = true;
let ready = false;
let micState: 'off' | 'pending' | 'ok' | 'denied' = 'off';
const calls = new Map<string, MediaConnection>();
const plays = new Map<string, Playback>();
let syncT = 0, levelT = 0;

export const micStatus = (): { state: typeof micState; on: boolean } => ({ state: micState, on: micOn });

export async function initVoice(): Promise<void> {
  if (ready || !settings.voice) return;
  ready = true;
  micState = 'pending';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
    });
    micState = 'ok';
  } catch {
    stream = null;
    micState = 'denied';          // still lets you HEAR teammates
  }
  const peer = getPeer();
  if (!peer) return;
  peer.on('call', (call: MediaConnection) => {
    call.answer(stream ?? new MediaStream());
    attach(call);
  });
  onSettingsChange(() => { for (const p of plays.values()) p.gain.gain.value = settings.voiceVol; });
}

export function toggleMic(): boolean {
  micOn = !micOn;
  if (stream) for (const t of stream.getAudioTracks()) t.enabled = micOn;
  return micOn;
}

function attach(call: MediaConnection): void {
  const old = calls.get(call.peer);
  if (old && old !== call) old.close();
  calls.set(call.peer, call);
  call.on('stream', (remote: MediaStream) => build(call, remote));
  const drop = (): void => {
    if (calls.get(call.peer) === call) calls.delete(call.peer);
    const p = plays.get(call.peer);
    if (p && p.call === call) {
      p.src.disconnect(); p.gain.disconnect(); p.panner.disconnect();
      p.el.srcObject = null;
      plays.delete(call.peer);
    }
  };
  call.on('close', drop);
  call.on('error', drop);
}

function build(call: MediaConnection, remote: MediaStream): void {
  const ctx = getAudioCtx(), master = getMaster();
  if (!ctx || !master) return;
  // Chrome only delivers WebRTC audio into Web Audio if the stream is also attached to a media element.
  const el = new Audio();
  el.srcObject = remote;
  el.muted = true;
  void el.play().catch(() => { /* needs a gesture; the stream still flows once the context runs */ });
  const src = ctx.createMediaStreamSource(remote);
  const gain = ctx.createGain();
  gain.gain.value = settings.voiceVol;
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 2;
  panner.rolloffFactor = 1.7;
  panner.maxDistance = 40;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(gain); gain.connect(panner); panner.connect(master);
  src.connect(analyser);
  plays.set(call.peer, { call, el, src, gain, panner, analyser, buf: new Uint8Array(analyser.fftSize), speaking: false });
}

/** peerId -> where that player currently is. The host's own snapshot id is S.hostPeerId. */
function whereIs(id: string): { x: number; z: number; idx: number; alive: boolean } | null {
  if (S.isHost) {
    const p = S.players.get(id === S.hostPeerId ? 'host' : id);
    return p ? { x: p.x, z: p.z, idx: p.idx, alive: p.alive } : null;
  }
  const r = S.remote.get(id);
  return r ? { x: r.x, z: r.z, idx: r.idx, alive: r.alive } : null;
}

export function updateVoice(dt: number): void {
  const ctx = getAudioCtx(), peer = getPeer();
  if (!ctx || !peer || !ready) return;

  syncT -= dt;
  if (syncT <= 0 && peer.id) {
    syncT = 1.5;
    const ids = S.isHost ? [...S.players.keys()].filter(k => k !== 'host') : [...S.remote.keys()];
    if (!S.isHost && S.hostPeerId && S.hostPeerId !== 'host' && !ids.includes(S.hostPeerId)) ids.push(S.hostPeerId);
    for (const id of ids) {
      if (id === peer.id || calls.has(id) || peer.id > id) continue;     // smaller id dials
      try { attach(peer.call(id, stream ?? new MediaStream())); } catch { /* retry next sync */ }
    }
  }

  const now = ctx.currentTime;
  levelT -= dt;
  const measure = levelT <= 0;
  if (measure) levelT = 0.12;
  for (const [id, p] of plays) {
    const w = whereIs(id);
    if (w) {
      p.panner.positionX.setTargetAtTime(w.x, now, 0.05);
      p.panner.positionY.setTargetAtTime(1.6, now, 0.05);
      p.panner.positionZ.setTargetAtTime(w.z, now, 0.05);
      p.gain.gain.setTargetAtTime(settings.voiceVol * (w.alive ? 1 : 0.5), now, 0.1);
    } else p.gain.gain.setTargetAtTime(0, now, 0.1);
    if (measure) {
      // cast: TS 5.7+ types buffers as Uint8Array<ArrayBuffer>; older TS has no such generic
      p.analyser.getByteTimeDomainData(p.buf as any);
      let peak = 0;
      for (let i = 0; i < p.buf.length; i++) peak = Math.max(peak, Math.abs(p.buf[i] - 128));
      p.speaking = peak > 10;
    }
  }
}

/** Player numbers (1-based) currently talking, for the HUD. */
export function speakingNow(): number[] {
  const out: number[] = [];
  for (const [id, p] of plays) {
    if (!p.speaking) continue;
    const w = whereIs(id);
    if (w) out.push(w.idx + 1);
  }
  return out.sort((a, b) => a - b);
}
