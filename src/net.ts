import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { InputMsg, ServerMsg } from './types';

export const conns: DataConnection[] = [];
let peer: Peer | null = null;
let hostConn: DataConnection | null = null;

export interface HostHandlers {
  onCode(id: string): void;
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

/** Host side: open a PeerJS endpoint; friends join with the printed code (WebRTC, no game server needed). */
export function startHostPeer(h: HostHandlers): void {
  peer = new Peer();
  peer.on('open', id => h.onCode(id));
  peer.on('error', e => h.onError(errText(e)));
  peer.on('connection', c => {
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
}

export function startClientPeer(code: string, h: ClientHandlers): void {
  peer = new Peer();
  peer.on('error', e => h.onError(errText(e)));
  peer.on('open', id => {
    h.onOpen(id);
    hostConn = peer!.connect(code.trim(), { reliable: true });
    hostConn.on('data', (d: unknown) => h.onData(d));
    hostConn.on('close', () => h.onClose());
    hostConn.on('error', e => h.onError(errText(e)));
  });
}
