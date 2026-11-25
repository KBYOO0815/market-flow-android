import type { MarketClose, MorningCatalyst, UsTheme } from './types';
import { isSlot, releaseTime, visibleBriefingDates, type BriefingNavigation, type BriefingNavigationEntry, type DailyBriefings, type Slot } from './editions';

const FEED_URL = process.env.EXPO_PUBLIC_FEED_URL || 'https://raw.githubusercontent.com/KBYOO0815/market-flow-feed/main/market-news.json';
const object = (v: any): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
const timestamp = (v: any) => typeof v === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const https = (v: any) => { try { const u = new URL(v); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password; } catch { return false; } };
export const isFeedConfigured = https(FEED_URL);

function parseNavigation(value: unknown): BriefingNavigation {
  if (!object(value)) throw Error('뉴스 시간축 형식 오류');
  const parseGroup = (group: unknown): BriefingNavigationEntry[] => {
    if (!Array.isArray(group)) throw Error('뉴스 시간축 형식 오류');
    const rows: BriefingNavigationEntry[] = [];
    for (const entry of group) {
      if (!object(entry) || typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
          typeof entry.slot !== 'string' || !isSlot(entry.slot) ||
          !['published','scheduled','skipped','missing','failed'].includes(String(entry.state)) ||
          (entry.reason !== undefined && typeof entry.reason !== 'string') ||
          (entry.errorCode !== undefined && typeof entry.errorCode !== 'string')) {
        throw Error('뉴스 시간축 형식 오류');
      }
      rows.push(entry as unknown as BriefingNavigationEntry);
    }
    return rows;
  };
  return {previous:parseGroup(value.previous),today:parseGroup(value.today),next:parseGroup(value.next)};
}

// Feed content is approved upstream. The APK checks renderability only.
function news(items: any, region: 'foreign' | 'domestic'): MorningCatalyst[] {
  if (!Array.isArray(items)) return [];
  return items.filter((n: any) => object(n) && typeof n.title === 'string' &&
    !!n.title.trim() && typeof n.summary === 'string')
    .map((n: any) => ({ ...n, region })) as MorningCatalyst[];
}

function parseTheme(value: unknown): UsTheme | null {
  if (!object(value) || typeof value.theme !== 'string' || !value.theme.trim() ||
      typeof value.reason !== 'string' || !value.reason.trim() ||
      !Array.isArray(value.stocks)) return null;
  const stocks: UsTheme['stocks'] = [];
  for (const stock of value.stocks) {
    if (!object(stock) || typeof stock.ticker !== 'string' || !stock.ticker.trim()) return null;
    stocks.push({
      ticker: stock.ticker,
      regularChangePct: Number.isFinite(stock.regularChangePct) ? stock.regularChangePct : undefined,
      afterHoursChangePct: Number.isFinite(stock.afterHoursChangePct) ? stock.afterHoursChangePct : undefined,
    });
  }
  return {
    theme: value.theme,
    reason: value.reason,
    direction: value.direction === 'up' || value.direction === 'down' ? value.direction : undefined,
    weightedChangePct: Number.isFinite(value.weightedChangePct) ? value.weightedChangePct : undefined,
    totalDollarVolume: Number.isFinite(value.totalDollarVolume) ? value.totalDollarVolume : undefined,
    afterHoursStatus: typeof value.afterHoursStatus === 'string' ? value.afterHoursStatus : undefined,
    relatedKoreanStocks: Array.isArray(value.relatedKoreanStocks) && value.relatedKoreanStocks.every(stock => typeof stock === 'string') ? value.relatedKoreanStocks : undefined,
    stocks,
  };
}

function parseMarketClose(value: unknown): MarketClose | null {
  if (!object(value) || typeof value.summary !== 'string' || !value.summary.trim() ||
      !object(value.kospi) || !Number.isFinite(value.kospi.close) || !Number.isFinite(value.kospi.changePct) ||
      !object(value.kosdaq) || !Number.isFinite(value.kosdaq.close) || !Number.isFinite(value.kosdaq.changePct) ||
      !Array.isArray(value.sources) || value.sources.length < 1) return null;
  const sources: MarketClose['sources'] = [];
  for (const source of value.sources) {
    if (!object(source) || typeof source.name !== 'string' || !source.name.trim() || !https(source.url)) return null;
    sources.push({ name: source.name, url: source.url });
  }
  const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string') ? v : [];
  return {
    summary: value.summary,
    kospi: { close: value.kospi.close, changePct: value.kospi.changePct },
    kosdaq: { close: value.kosdaq.close, changePct: value.kosdaq.changePct },
    leadingThemes: strings(value.leadingThemes),
    weakThemes: strings(value.weakThemes),
    sources,
  };
}

export function parseMarketBriefing(body: unknown, now = Date.now()): DailyBriefings[] {
  if (!object(body) || !Array.isArray(body.days)) throw Error('시장 브리핑 형식 오류');
  const visibleDates = visibleBriefingDates(now);
  const seen = new Set<string>();
  const result: DailyBriefings[] = [];
  let firstError: Error | undefined;
  let validSessionCount = 0;

  for (const d of body.days) {
    if (!object(d) || typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || seen.has(d.date) || !Array.isArray(d.sessions)) {
      firstError ??= Error('브리핑 날짜 형식 오류');
      continue;
    }
    seen.add(d.date);
    const displaySlots = Array.isArray(d.displaySlots)
      ? d.displaySlots.filter((slot: unknown, index: number, all: unknown[]) =>
          typeof slot === 'string' && isSlot(slot) && all.indexOf(slot) === index) as Slot[]
      : undefined;
    const day: DailyBriefings = { date: d.date, isKrxTradingDay: d.isKrxTradingDay === true, displaySlots, editions: {} };
    const slots = new Set();

    for (const s of d.sessions) {
      try {
        if (!object(s) || !isSlot(s.slot) || slots.has(s.slot) || typeof s.asOf !== 'string') throw Error('브리핑 회차·미국 테마 형식 오류');
        const items = [...news(s.foreignNews, 'foreign'), ...news(s.domesticNews, 'domestic')];

        let marketClose: MarketClose | undefined;
        // Legacy 15:40 marketClose is retained for historic records, but
        // new 15:40 editions are ordinary news. Market analysis has moved
        // to the independent market-status feed.
        if (s.marketClose !== undefined) {
          const parsed = parseMarketClose(s.marketClose);
          if (!parsed) throw Error('15:40 마감 시황 형식 오류');
          marketClose = parsed;
        }

        const status: string[] = [];
        if (s.researchStatus === 'partial') status.push('조사 상태: 부분 완료');
        if (s.researchStatus === 'failed') status.push('조사 상태: 실패');
        if (s.slot === '06:40' && s.usThemeStatus === 'insufficient_data') status.push('미국 테마: 자료 부족');

        slots.add(s.slot);
        validSessionCount++;
        const slot = s.slot as Slot;
        if (releaseTime(d.date, slot) <= now && Date.parse(s.asOf) <= now) {
          day.editions[slot] = {
            asOf: s.asOf,
            releaseAt: d.date + 'T' + slot + ':00+09:00',
            items,
            statusNotes: status,
            usThemes: (Array.isArray(s.usThemes) ? s.usThemes : []).map(parseTheme).filter((theme: UsTheme | null): theme is UsTheme => theme !== null),
            marketClose,
          };
        }
      } catch (error) {
        firstError ??= error instanceof Error ? error : Error('브리핑 회차 형식 오류');
      }
    }

    if (visibleDates.includes(day.date)) result.push(day);
  }
  if (firstError && validSessionCount === 0) throw firstError;
  return result;
}

export async function fetchBriefingFeed(now = Date.now()): Promise<{days:DailyBriefings[];navigation:BriefingNavigation}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(FEED_URL + '?t=' + Date.now(), { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (response.status === 404) throw Error('새 브리핑 파일이 아직 없습니다.');
    if (!response.ok) throw Error('브리핑 서버 오류 (' + response.status + ')');
    const body = await response.json();
    if (!object(body)) throw Error('시장 브리핑 형식 오류');
    return {days:parseMarketBriefing(body, now),navigation:parseNavigation(body.navigation)};
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBriefingDays(now = Date.now()): Promise<DailyBriefings[]> {
  return (await fetchBriefingFeed(now)).days;
}

export async function fetchDailyBriefings(date: string, now = Date.now()): Promise<DailyBriefings> {
  if (!visibleBriefingDates(now).includes(date)) return { date, editions: {} };
  return (await fetchBriefingDays(now)).find(d => d.date === date) || { date, editions: {} };
}
