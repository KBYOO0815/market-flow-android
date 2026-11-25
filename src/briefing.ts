import type { MorningCatalyst } from './types';

// Migration for the three published items that predate explicit region metadata.
const legacyForeignIds = new Set(['20261111-us-cpi-waller', '20261111-nvidia-selloff', '20261111-coreweave-results']);
export function resolveRegion(item: { id?: unknown; category?: unknown; region?: unknown }): 'foreign' | 'domestic' | undefined {
  if (item.region === 'foreign' || item.region === 'domestic') return item.region;
  if (item.region !== undefined) return undefined;
  if (item.category === '국내공시') return 'domestic';
  if (item.category === '미국증시' || legacyForeignIds.has(String(item.id))) return 'foreign';
  return undefined;
}

const legacySnapshots = new Set(['20261111-samsung-hynix-weak-open', '20261111-kospi-kosdaq-intraday']);
export function isItemCurrent(item: MorningCatalyst, now = Date.now()): boolean {
  if (item.validUntil !== undefined && !(Date.parse(item.validUntil) > now)) return false;
  if (item.kind === 'market_snapshot' || legacySnapshots.has(item.id)) {
    const observed = Date.parse(item.observedAt || item.publishedAt);
    // Intraday quotes are short-lived even when a later refresh fails.
    return Number.isFinite(observed) && observed <= now && now < observed + 15 * 60_000;
  }
  return true;
}

export function selectBriefingItems(items: MorningCatalyst[], now = Date.now()): MorningCatalyst[] {
  const sorted = items.filter(item => isItemCurrent(item, now)).sort((a, b) => a.impactRank - b.impactRank || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return [
    ...sorted.filter(item => resolveRegion(item) === 'foreign').slice(0, 10),
    ...sorted.filter(item => resolveRegion(item) === 'domestic').slice(0, 10),
  ];
}
