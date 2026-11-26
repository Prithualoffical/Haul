import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import { makeCode, peerIdFor } from './roomcode';
import type { InputMsg, ServerMsg } from './types';

export const conns: DataConnection[] = [];
let peer: Peer | null = null;
let hostConn: DataConnection | null = null;

export const getPeer = (): Peer | null => peer;

export interface HostHandlers {
  /** id = the full peer id (used for voice); code = the short code players type */
  onCode(id: string, code: string): void;
  onJoin(c: DataConnection): void;
  onData(c: DataConnection, d: unknown): void;
  onLeave(c: DataConnection): void;
  onError(msg: string): void;
}
export interface ClientHandlers {
  onOpen(myId: string): void;
  onData(d: unknown): void;
  onClose(): void;
  onError(msg: string): void;
}

const errText = (e: { type?: string; message?: string }): string => e.type ?? e.message ?? 'unknown error';

export function sendAll(m: ServerMsg): void {
  for (const c of conns) if (c.open) c.send(m);
}
export function sendTo(c: DataConnection, m: ServerMsg): void {
  if (c.open) c.send(m);
}
export function sendToHost(m: InputMsg): void {
  if (hostConn && hostConn.open) hostConn.send(m);
}

/** Host side: open a PeerJS endpoint under a short room code; friends join by typing that code (WebRTC, no game server). */
export function startHostPeer(h: HostHandlers): void {
  let tries = 0;
  const open = (): void => {
    const code = makeCode();
    const p = new Peer(peerIdFor(code));
    peer = p;
    p.on('open', (id: string) => h.onCode(id, code));
    p.on('error', (e: { type?: string; message?: string }) => {
      if (e.type === 'unavailable-id' && tries++ < 8) { p.destroy(); open(); return; }   // code already taken: roll a new one
      h.onError(errText(e));
    });
    p.on('connection', (c: DataConnection) => {
      c.on('open', () => { conns.push(c); h.onJoin(c); });
      c.on('data', (d: unknown) => h.onData(c, d));
      const gone = (): void => {
        const i = conns.indexOf(c);
        if (i >= 0) conns.splice(i, 1);
        h.onLeave(c);
      };
      c.on('close', gone);
      c.on('error', gone);
    });
  };
  open();
}

export function startClientPeer(code: string, h: ClientHandlers): void {
  peer = new Peer();
  peer.on('error', (e: { type?: string; message?: string }) => h.onError(errText(e)));
  peer.on('open', (id: string) => {
    h.onOpen(id);
    hostConn = peer!.connect(peerIdFor(code), { reliable: true });
    hostConn.on('data', (d: unknown) => h.onData(d));
    hostConn.on('close', () => h.onClose());
    hostConn.on('error', (e: { type?: string; message?: string }) => h.onError(errText(e)));
  });
}
