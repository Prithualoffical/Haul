import { LOOKS, cullDistance } from '../src/looks';
import { MAP_KIND_LIST, MAP_KINDS, THEMES } from '../src/map';

let bad = 0;
const ok = (c: boolean, m: string): void => { if (!c) { console.log('FAIL:', m); bad++; } };

// every location has its own atmosphere (no two share fog colour AND wall style)
const sigs = new Set(MAP_KIND_LIST.map(k => `${LOOKS[k].fog}|${LOOKS[k].wall}|${LOOKS[k].wallTint}`));
ok(sigs.size === MAP_KIND_LIST.length, 'each location has a unique look');
// each location has a distinct room line-up
const layouts = new Set(MAP_KIND_LIST.map(k => JSON.stringify(MAP_KINDS[k].layout)));
ok(layouts.size === MAP_KIND_LIST.length, 'each location has a unique layout');
for (const k of MAP_KIND_LIST) {
  const l = MAP_KINDS[k].layout;
  ok(l.length === 5 && l.every(r => r.length === 5), `${k} is 5x5`);
  ok(l.flat().every(t => t in THEMES), `${k} only uses defined themes`);
  const cull = cullDistance(LOOKS[k]);
  // fog transmittance at the cull distance should be tiny (so popping is invisible)
  const tr = Math.exp(-((cull * LOOKS[k].density) ** 2));
  ok(tr < 0.06, `${k} cull distance hides at ${(tr * 100).toFixed(1)}% visibility`);
}
// the wide-opening setting really differs: warehouse is open, hotel is tight
ok(MAP_KINDS.warehouse.wide > 0.5 && MAP_KINDS.hotel.wide < 0.15, 'warehouse open / hotel tight');
console.log(bad === 0 ? 'ALL LOOK TESTS PASSED' : `FAILURES: ${bad}`);
if (bad) process.exit(1);
