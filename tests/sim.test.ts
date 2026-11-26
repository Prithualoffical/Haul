// Logic checks for balance + shop + revive rules that don't need a browser.
import { BAL, MONSTER_DEFS, SHOP } from '../src/config';
import { S } from '../src/state';
import { priceOf, tryBuy } from '../src/shop';

let bad = 0;
const ok = (c: boolean, m: string) => { if (!c) { console.log('FAIL', m); bad++; } };

// --- balance: nobody except the Runner outpaces a walking player (3.6 m/s); everyone is slower than a sprint (6.2)
const WALK = 3.6, SPRINT = 6.2;
for (const [k, d] of Object.entries(MONSTER_DEFS)) {
  const chaseAtL10 = d.chase + 0.08 * 10;
  ok(chaseAtL10 < SPRINT, `${k} is slower than sprint even at level 10 (${chaseAtL10})`);
  if (k !== 'runner' && k !== 'listener') ok(d.chase + 0.08 * 3 < WALK, `${k} slower than a walk early`);
  ok(d.damage <= 30, `${k} damage sane`);
}
// time for a stalker to kill a 100hp player standing next to it, with the invulnerability window
const st = MONSTER_DEFS.stalker;
const perHit = Math.max(st.cooldown, BAL.invuln);
const secondsToKill = Math.ceil(100 / st.damage) * perHit;
console.log('stalker needs', secondsToKill.toFixed(1), 's of continuous contact to kill (was 3.6s)');
ok(secondsToKill > 8, 'stalker needs more than 8s of contact');
ok(BAL.graceSeconds >= 20, 'grace period at level start');

// --- shop
S.upg = { sta: 0, str: 0, spd: 0, lamp: 0, vit: 0 }; S.wallet = 1000; S.flares = 1;
const p0 = priceOf('sta'); ok(p0 === 300, `base price ${p0}`);
ok(tryBuy('sta') && S.wallet === 700 && S.upg.sta === 1, 'buy stamina');
ok(priceOf('sta') === 450, `price escalates: ${priceOf('sta')}`);
ok(tryBuy('flare') && S.flares === 3 && S.wallet === 500, 'buy flares gives 2');
S.wallet = 10; ok(!tryBuy('vit') && S.upg.vit === 0 && S.wallet === 10, 'cannot overspend');
ok(SHOP.length === 6, 'six shop items');

console.log(bad === 0 ? 'ALL SIM TESTS PASSED' : `FAILURES: ${bad}`);
if (bad) process.exit(1);
