import { makeCode, normalizeCode, peerIdFor, isValidCode, ROOM_PREFIX } from '../src/roomcode';

let bad = 0;
const ok = (c: boolean, m: string): void => { if (!c) { console.log('FAIL:', m); bad++; } };

// codes are short and never contain look-alike characters
const seen = new Set<string>();
for (let i = 0; i < 5000; i++) {
  const c = makeCode(); seen.add(c);
  ok(/^[A-HJKMNP-Z2-9]{5}$/.test(c), `clean 5-char code: ${c}`);
}
ok(seen.size > 4900, `codes are well spread (${seen.size} unique of 5000)`);

// forgiving input
ok(normalizeCode(' k7qp2 ') === 'K7QP2', 'lower case + spaces');
ok(normalizeCode('k7-qp 2') === 'K7QP2', 'dashes and spaces');
ok(normalizeCode('HAUL-K7QP2') === 'K7QP2', 'pasted prefix');
ok(normalizeCode('https://haul.onrender.com/?room=k7qp2') === 'K7QP2', 'pasted invite link');
ok(peerIdFor('K7QP2') === ROOM_PREFIX + 'k7qp2', 'peer id is prefixed lower case');
ok(peerIdFor('k7 qp2') === peerIdFor('K7QP2'), 'same room however it is typed');
ok(isValidCode('K7QP2') && !isValidCode('') && !isValidCode('AB'), 'validation');
console.log(bad === 0 ? 'ALL ROOM CODE TESTS PASSED' : `FAILURES: ${bad}`);
if (bad) process.exit(1);
