import { generateMap, roomAt } from '../src/map';
import { Nav } from '../src/nav';
import { PAD } from '../src/config';

let bad = 0, fallback = 0, totalProps = 0, maxMs = 0;
for (let s = 1; s <= 300; s++) {
  const t0 = performance.now();
  const m = generateMap(s * 104729);
  maxMs = Math.max(maxMs, performance.now() - t0);
  const m2 = generateMap(s * 104729);
  if (JSON.stringify(m) !== JSON.stringify(m2)) { console.log('NON-DETERMINISTIC', s); bad++; }
  if (m.props.length === 0) fallback++;
  totalProps += m.props.length;
  const nav = new Nav(m.solids);
  const cx = (PAD.x1 + PAD.x2) / 2, cz = (PAD.z1 + PAD.z2) / 2;
  const ratio = nav.reachableRatio(cx, cz);
  if (ratio < 0.96 && m.props.length) { console.log('LOW REACH', s, ratio); bad++; }
  // every room should have a reachable free spot
  for (const r of m.rooms) {
    const p = nav.findPath(cx, cz, (r.x1 + r.x2) / 2, (r.z1 + r.z2) / 2);
    if (!p && nav.isFree((r.x1 + r.x2) / 2, (r.z1 + r.z2) / 2)) { console.log('ROOM UNREACHABLE', s, r.name); bad++; }
  }
  if (!roomAt(m, 5, 5) || roomAt(m, 5, 5)!.theme !== 'dock') { console.log('dock wrong'); bad++; }
}
console.log({ maps: 300, bad, fallback, avgProps: totalProps / 300, maxGenMs: Math.round(maxMs) });
