import { visibleNavigationTimeline } from './editions';
const ROOT = process.env.EXPO_PUBLIC_FEATURED_FEED_ROOT || 'https://raw.githubusercontent.com/KBYOO0815/market-flow-feed/main/';
const FEED_URL = ROOT + 'featured-stocks-unified.json';
const slotPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type FeaturedStock = {
  code: string;
  name: string;
  turnoverRank: number;
  krxTradeAmount: number;
  nxtTradeAmount?: number;
  integratedTradeAmount?: number;
  tradeAmount?: number;
  changeRate: number;
  rateMarket: 'KRX' | 'NXT';
  priceMarket?: 'KRX' | 'NXT';
  priceObservedAt?: string;
  priceSourceUrl?: string;
};
export type FeaturedTheme = {
  id: string;
  name: string;
  weightedChangeRate: number;
  integratedTradeAmount?: number;
  tradeAmount?: number;
  strength?: { judgment: string; score: number };
  stockCodes: string[];
  reason: null | {
    summary: string;
    sourceUrl: string;
    publishedAt: string;
    checkedAt: string;
    causality: 'source_attributed' | 'related_fact_only';
  };
};
export type FeaturedEdition = {
  schemaVersion: 1 | 2 | 3;
  turnoverBasis?: 'KRX' | 'KRX_NXT';
  date?: string; slot?: string; publishedAt?: string;
  priceSession?: string;
  selectedStockCodes?: string[];
  individualStocks?: {code: string; reason: FeaturedTheme['reason']}[];
  universeSize?: number;
  asOf: string;
  releaseAt: string;
  stocks: FeaturedStock[];
  byTurnover: string[];
  byChangeRate: string[];
  themes: FeaturedTheme[];
  unclassified: string[];
};
export type DailyFeaturedStocks = { date: string; editions: Record<string, FeaturedEdition>; warnings?: string[] };
export type FeaturedNavState = 'published'|'scheduled'|'skipped'|'missing'|'failed';
export type FeaturedNavigationEntry = {date:string;slot:string;state:FeaturedNavState;reason?:string;errorCode?:string};
export type FeaturedNavigation = {previous:FeaturedNavigationEntry[];today:FeaturedNavigationEntry[];next:FeaturedNavigationEntry[]};
export type FeaturedFeed = {days:Record<string,DailyFeaturedStocks>;navigation:FeaturedNavigation};
export const featuredNavigationTimeline = (navigation: FeaturedNavigation, now = Date.now()): FeaturedNavigationEntry[] =>
  visibleNavigationTimeline(navigation, now);

function parseFeaturedNavigation(value: unknown): FeaturedNavigation {
  if (!object(value)) throw new Error('특징주 시간축 형식 오류');
  const parseGroup = (rows: unknown): FeaturedNavigationEntry[] => {
    if (!Array.isArray(rows)) throw new Error('특징주 시간축 형식 오류');
    return rows.map((entry: unknown) => {
      if (!object(entry) || typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
          typeof entry.slot !== 'string' || !slotPattern.test(entry.slot) ||
          !['published','scheduled','skipped','missing','failed'].includes(String(entry.state)) ||
          (entry.reason !== undefined && typeof entry.reason !== 'string') ||
          (entry.errorCode !== undefined && typeof entry.errorCode !== 'string')) {
        throw new Error('특징주 시간축 형식 오류');
      }
      return entry as unknown as FeaturedNavigationEntry;
    });
  };
  return {previous:parseGroup(value.previous),today:parseGroup(value.today),next:parseGroup(value.next)};
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Presentation adapter only. Ranking, price, reasons, session eligibility,
// chronology and publication approval belong to the publisher, not the APK.
export function parseDailyFeaturedStocks(body: unknown, date: string): DailyFeaturedStocks {
  const result: DailyFeaturedStocks = { date, editions: {} };
  if (!object(body) || body.date !== date || !object(body.editions)) {
    throw new Error('특징주 응답 형식 오류');
  }
  for (const [slot, raw] of Object.entries(body.editions)) {
    if (!slotPattern.test(slot) || !object(raw)) continue;
    // Only protect UI rendering against absent/incorrect structural fields.
    // Never re-judge server-approved prices, rankings or evidence timestamps.
    if (!Array.isArray(raw.stocks) || !Array.isArray(raw.themes) ||
        !Array.isArray(raw.individualStocks) || typeof raw.asOf !== 'string' ||
        !raw.stocks.every((s: unknown) => object(s) && typeof s.code === 'string' &&
          typeof s.name === 'string' && (s.changeRate === null ||
          (typeof s.changeRate === 'number' && Number.isFinite(s.changeRate)))) ||
        !raw.themes.every((t: unknown) => object(t) && typeof t.id === 'string' &&
          typeof t.name === 'string' && Array.isArray(t.stockCodes) &&
          t.stockCodes.every((code: unknown) => typeof code === 'string')) ||
        !raw.individualStocks.every((s: unknown) => object(s) && typeof s.code === 'string')) {
      (result.warnings ??= []).push(date + ' ' + slot + ' 화면 데이터 형식 오류');
      continue;
    }
    result.editions[slot] = raw as unknown as FeaturedEdition;
  }
  return result;
}

export async function fetchFeaturedFeed(now = Date.now()): Promise<FeaturedFeed> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(FEED_URL + '?t=' + now, {signal:controller.signal});
    if (!response.ok) throw new Error('특징주 통합 JSON 오류: ' + response.status);
    const unified = await response.json();
    if (!object(unified) || !object(unified.navigation) || !object(unified.days))
      throw new Error('특징주 통합 JSON 형식 오류');
    const navigation = parseFeaturedNavigation(unified.navigation);
    const days: Record<string,DailyFeaturedStocks> = {};
    for (const [date,body] of Object.entries(unified.days)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date))
        days[date] = parseDailyFeaturedStocks(body,date);
    }
    return {days,navigation};
  } finally {clearTimeout(timer);}
}

