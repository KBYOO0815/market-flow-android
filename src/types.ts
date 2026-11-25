export type MorningCatalyst = {
  id: string;
  kind?: 'news' | 'market_snapshot';
  observedAt?: string;
  reviewedAt?: string;
  validUntil?: string;
  reviewNote?: string;
  region?: 'foreign' | 'domestic';
  title: string;
  summary: string;
  publishedAt: string;
  sourceUrl: string;
  sourceName: string;
  relatedStocks: string[];
  impactRank: number;
  category: string;
};

export type UsTheme = {
  direction?: 'up' | 'down';
  theme: string;
  reason: string;
  weightedChangePct?: number;
  totalDollarVolume?: number;
  afterHoursStatus?: string;
  relatedKoreanStocks?: string[];
  stocks: {
    ticker: string;
    regularChangePct?: number;
    afterHoursChangePct?: number;
  }[];
};

export type MarketClose = {
  summary: string;
  kospi: { close: number; changePct: number };
  kosdaq: { close: number; changePct: number };
  leadingThemes: string[];
  weakThemes: string[];
  sources: { name: string; url: string }[];
};

export type MorningFeedResponse = {
  asOf: string;
  releaseAt: string;
  items: MorningCatalyst[];
  statusNotes?: string[];
  usThemes?: UsTheme[];
  marketClose?: MarketClose;
};
