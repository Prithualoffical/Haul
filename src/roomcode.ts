/**
 * Short, easy-to-type room codes. The real PeerJS id is "haul-" + code (lower case), so a friend only types
 * the 5 characters. The alphabet leaves out look-alikes (0/O, 1/I/L) so codes survive being read out loud.
 */
export const ROOM_PREFIX = 'haul-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeCode(len = 5, rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

/** Forgiving input: any case, spaces/dashes ignored, and a pasted "HAUL-" prefix or invite link is fine. */
export function normalizeCode(input: string): string {
  let t = input.trim();
  const m = /[?&]room=([^&#\s]+)/i.exec(t);       // a whole invite link was pasted
  if (m) t = decodeURIComponent(m[1]);
  t = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.startsWith('HAUL') && t.length > 4) t = t.slice(4);
  return t;
}

export const peerIdFor = (code: string): string => ROOM_PREFIX + normalizeCode(code).toLowerCase();

export function isValidCode(input: string): boolean {
  const c = normalizeCode(input);
  return c.length >= 4 && c.length <= 8;
}

export const inviteLink = (code: string): string => `${location.origin}${location.pathname}?room=${code}`;
