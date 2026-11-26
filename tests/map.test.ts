import { generateMap, roomAt, MAP_KIND_LIST } from '../src/map';
import { Nav } from '../src/nav';
import { PAD } from '../src/config';

let bad = 0;
for (const kind of MAP_KIND_LIST) {
  let fallback = 0, totalProps = 0, maxMs = 0, minReach = 1;
  const N = 150;
  for (let s = 1; s <= N; s++) {
    const seed = s * 104729;
    const t0 = performance.now();
    const m = generateMap(seed, kind);
    maxMs = Math.max(maxMs, performance.now() - t0);
    if (JSON.stringify(m) !== JSON.stringify(generateMap(seed, kind))) { console.log('NON-DETERMINISTIC', kind, s); bad++; }
    if (m.props.length === 0) fallback++;
    totalProps += m.props.length;
    const nav = new Nav(m.solids, m.size);
    const cx = (PAD.x1 + PAD.x2) / 2, cz = (PAD.z1 + PAD.z2) / 2;
    const ratio = nav.reachableRatio(cx, cz);
    minReach = Math.min(minReach, ratio);
    if (ratio < 0.99 && m.props.length) { console.log('LOW REACH', kind, s, ratio); bad++; }
    for (const r of m.rooms) {
      const mx = (r.x1 + r.x2) / 2, mz = (r.z1 + r.z2) / 2;
      if (nav.isFree(mx, mz) && !nav.findPath(cx, cz, mx, mz)) { console.log('ROOM UNREACHABLE', kind, s, r.name); bad++; }
    }
    const start = roomAt(m, 5, 5);
    if (!start || start.rx !== 0 || start.rz !== 0) { console.log('start room wrong', kind); bad++; }
    if (m.rooms.length !== m.n * m.n || m.size !== m.n * 13) { console.log('size mismatch', kind); bad++; }
    // pad area must be free of solids so the extraction zone is usable
    for (const s2 of m.solids) {
      if (s2.x1 < PAD.x2 && s2.x2 > PAD.x1 && s2.z1 < PAD.z2 && s2.z2 > PAD.z1 && s2.h < 3) { console.log('prop on pad', kind, s); bad++; break; }
    }
  }
  console.log(kind, { maps: N, size: generateMap(1, kind).size, fallback, avgProps: Math.round(totalProps / N), minReach: +minReach.toFixed(3), maxGenMs: Math.round(maxMs) });
}
console.log(bad === 0 ? 'ALL MAP TESTS PASSED' : `FAILURES: ${bad}`);
if (bad) process.exit(1);
