import { SHOP, type ShopKey } from './config';
import { S } from './state';

/** Price grows with how many times the team already bought that upgrade. Flares are a flat price. */
export function priceOf(key: ShopKey): number {
  const item = SHOP.find(s => s.key === key);
  if (!item) return Infinity;
  if (key === 'flare') return item.base;
  return Math.round((item.base * (1 + 0.5 * S.upg[key])) / 10) * 10;
}

export function ownedOf(key: ShopKey): string {
  return key === 'flare' ? `${S.flares} left` : `Lv ${S.upg[key]}`;
}

/** Pure purchase rule (host-side): returns the new wallet or null if the team can't afford it. */
export function tryBuy(key: ShopKey): boolean {
  const p = priceOf(key);
  if (S.wallet < p) return false;
  S.wallet -= p;
  if (key === 'flare') S.flares += 2;
  else S.upg[key]++;
  return true;
}
