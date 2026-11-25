import type { MorningFeedResponse } from './types';

export type Slot = string;
export const isSlot = (value: unknown): value is Slot => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export type DailyBriefings = { date: string; isKrxTradingDay?: boolean; displaySlots?: Slot[]; editions: Partial<Record<Slot, MorningFeedResponse>> };
export type BriefingSelection = { date: string; slot: Slot };
export type BriefingNavState = 'published'|'scheduled'|'skipped'|'missing'|'failed';
export type BriefingNavigationEntry = { date:string; slot:Slot; state:BriefingNavState; reason?:string; errorCode?:string };
export type BriefingNavigation = { previous:BriefingNavigationEntry[]; today:BriefingNavigationEntry[]; next:BriefingNavigationEntry[] };
export function isNewerPublication(
  current: BriefingSelection | null, previous: BriefingSelection | null,
): boolean {
  return !!current && !!previous && (current.date > previous.date ||
    (current.date === previous.date && current.slot > previous.slot));
}
export function visibleNavigationTimeline<T extends {date: string}>(
  navigation: {previous: T[]; today: T[]; next: T[]}, now = Date.now(),
): T[] {
  const dates = new Set(visibleBriefingDates(now));
  return [...navigation.previous, ...navigation.today, ...navigation.next].filter(entry => dates.has(entry.date));
}
export const briefingNavigationTimeline = (navigation: BriefingNavigation, now = Date.now()): BriefingNavigationEntry[] =>
  visibleNavigationTimeline(navigation, now);

export function kstDate(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60_000).toISOString().slice(0, 10);
}
export function releaseTime(date: string, slot: Slot): number {
  return Date.parse(`${date}T${slot}:00+09:00`);
}
export function latestPublished(day: DailyBriefings, now = Date.now()): Slot | null {
  return Object.keys(day.editions).sort().reverse()
    .find(slot => day.editions[slot] && releaseTime(day.date, slot) <= now) || displaySlotsForDay(day)[0] || null;
}
export function resolveBriefingSelection(
  today: DailyBriefings,
  timeline: BriefingSelection[],
  manual: BriefingSelection | null,
  previousPublication: BriefingSelection | null,
  now: number,
) {
  const latest = latestPublished(today, now);
  const published = latest && today.editions[latest] ? { date: today.date, slot: latest } : null;
  const newer = published && (!previousPublication ||
    published.date > previousPublication.date ||
    (published.date === previousPublication.date && published.slot > previousPublication.slot));
  const retained = !newer && manual && timeline.some(
    entry => entry.date === manual.date && entry.slot === manual.slot,
  ) ? manual : null;
  return {
    selection: retained ?? (latest ? { date: today.date, slot: latest } : timeline[0] ?? null),
    manual: retained,
    publication: newer ? published : previousPublication,
  };
}
export function visibleBriefingDates(now = Date.now()): string[] {
  return [0,1].map(d => kstDate(now - d * 86400000));
}
export function parseSelection(value: string | null, now = Date.now()): BriefingSelection | null {
  if (!value) return null;
  try {
    const saved = JSON.parse(value);
    return saved && typeof saved.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.date) &&
      isSlot(saved.slot) ? { date: saved.date, slot: saved.slot } : null;
  } catch { return null; }
}
export function displaySlotsForDay(day: DailyBriefings): Slot[] {
  return day.displaySlots && day.displaySlots.length ? day.displaySlots : Object.keys(day.editions).sort();
}

export function briefingTimeline(today: DailyBriefings, yesterday: DailyBriefings | null): BriefingSelection[] {
  return [
    ...(yesterday ? Object.keys(yesterday.editions).sort().filter(slot => yesterday.editions[slot]).map(slot => ({ date: yesterday.date, slot })) : []),
    ...displaySlotsForDay(today).map(slot => ({ date: today.date, slot })),
  ];
}
export function keepSelection(selected: Slot | null, day: DailyBriefings, now = Date.now()): Slot | null {
  return selected && displaySlotsForDay(day).includes(selected) ? selected : latestPublished(day, now);
}
export function editionState(day: DailyBriefings, slot: Slot, now = Date.now()): 'scheduled' | 'missing' | 'published' | 'closed' {
  if (now < releaseTime(day.date, slot)) return 'scheduled';
  return day.editions[slot] ? 'published' : 'missing';
}
export function editionItems(feed: MorningFeedResponse) {
  return feed.items; // Exact upstream approved order. No client-side scoring, filtering or re-ranking.
}

