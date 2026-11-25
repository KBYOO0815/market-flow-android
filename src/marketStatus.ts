export type MarketDisplayMetric = {
  label: string;
  value: number | string | null;
  changePct?: number | null;
  note?: string;
};
export type MarketDisplaySection =
  | {id:string;title:string;kind:'metrics';items:MarketDisplayMetric[]}
  | {id:string;title:string;kind:'bullets';items:string[]}
  | {id:string;title:string;kind:'text';text:string};
export type MarketDisplay = {
  headline: string;
  badges: string[];
  observedAt: string;
  sections: MarketDisplaySection[];
};
export type MarketStatusEdition = {
  date: string; slot: string; scheduledFor: string; asOf: string; publishedAt: string;
  sessionStatus: string; scope: 'US_KR' | 'KR' | 'US';
  us: MarketRegion | null; kr: MarketRegion | null;
  highlights: string[]; sources: {name:string;url:string;checkedAt:string}[];
  status: {collection:'success'|'partial';validation:'success';publication:'success'};
  display?: MarketDisplay;
};
export type MarketRegion = {
  summary:string;observedAt:string;
  indices?:{name:string;value:number|null;changePct:number|null;observedAt:string;sourceUrl:string}[];
  themes?:string[];
  notes?:string[];
};
export type MarketStatusDay = {schemaVersion:1;date:string;editions:Record<string,MarketStatusEdition>};
export type MarketStatusNavState = 'published'|'scheduled'|'skipped'|'missing'|'failed';
export type MarketStatusNavigationEntry = {date:string;slot:string;state:MarketStatusNavState;reason?:string;errorCode?:string};
export type MarketStatusNavigation = {
  previous: MarketStatusNavigationEntry[];
  today: MarketStatusNavigationEntry[];
  next: MarketStatusNavigationEntry[];
};
export type MarketStatusFeed = {days:MarketStatusDay[];navigation:MarketStatusNavigation};

const FEED_URL = process.env.EXPO_PUBLIC_MARKET_STATUS_URL || 'https://raw.githubusercontent.com/KBYOO0815/market-flow-feed/main/market-status.json';
const isObject = (x:unknown):x is Record<string,any> => !!x && typeof x === 'object' && !Array.isArray(x);

const renderRegion=(x:unknown): x is MarketRegion => isObject(x) &&
  typeof x.summary === 'string' && typeof x.observedAt === 'string' &&
  (x.indices === undefined || Array.isArray(x.indices) &&
    x.indices.every((v:unknown)=>isObject(v) && typeof v.name === 'string' &&
      (v.value === null || typeof v.value === 'number') &&
      (v.changePct === null || typeof v.changePct === 'number'))) &&
  (x.themes === undefined || Array.isArray(x.themes) && x.themes.every((v:unknown)=>typeof v==='string')) &&
  (x.notes === undefined || Array.isArray(x.notes) && x.notes.every((v:unknown)=>typeof v==='string'));

const renderDisplay=(x:unknown): x is MarketDisplay => {
  if(!isObject(x) || typeof x.headline!=='string' || !x.headline.trim() ||
    typeof x.observedAt!=='string' || !Array.isArray(x.badges) ||
    !x.badges.every((v:unknown)=>typeof v==='string') || !Array.isArray(x.sections)) return false;
  return x.sections.every((section:unknown)=>{
    if(!isObject(section) || typeof section.id!=='string' || typeof section.title!=='string' ||
      !['metrics','bullets','text'].includes(section.kind)) return false;
    if(section.kind==='text') return typeof section.text==='string' && !!section.text.trim();
    if(!Array.isArray(section.items) || !section.items.length) return false;
    if(section.kind==='bullets') return section.items.every((v:unknown)=>typeof v==='string' && !!v.trim());
    return section.items.every((v:unknown)=>isObject(v) && typeof v.label==='string' &&
      (v.value===null || typeof v.value==='number' || typeof v.value==='string') &&
      (v.changePct===undefined || v.changePct===null || typeof v.changePct==='number') &&
      (v.note===undefined || typeof v.note==='string'));
  });
};

function parseEdition(value: unknown): MarketStatusEdition | null {
  if (!isObject(value) || typeof value.asOf !== 'string' ||
      !Array.isArray(value.sources) ||
      !value.sources.every((source: unknown) => isObject(source) &&
        typeof source.name === 'string' && typeof source.url === 'string')) return null;

  // Unified editions render the publisher's display model. Their raw market
  // data can have different shapes and is used only by legacy cards.
  if (value.display !== undefined) {
    return renderDisplay(value.display) ? value as MarketStatusEdition : null;
  }
  if (!Array.isArray(value.highlights) ||
      !value.highlights.every((highlight: unknown) => typeof highlight === 'string') ||
      (value.kr !== null && !renderRegion(value.kr)) ||
      (value.us !== null && !renderRegion(value.us))) return null;
  return value as MarketStatusEdition;
}

async function readJson(url:string):Promise<unknown> {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try {
    const r=await fetch(url+(url.includes('?')?'&':'?')+'t='+Date.now(),{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!r.ok) throw Error('시황 서버 HTTP '+r.status);
    return await r.json();
  } finally {clearTimeout(timer);}
}

const navEntry=(x:unknown):x is MarketStatusNavigationEntry => isObject(x) &&
  typeof x.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
  typeof x.slot==='string' && /^\d{2}:\d{2}$/.test(x.slot) &&
  ['published','scheduled','skipped','missing','failed'].includes(x.state) &&
  (x.reason===undefined || typeof x.reason==='string') &&
  (x.errorCode===undefined || typeof x.errorCode==='string');

export async function fetchMarketStatus(now=Date.now()):Promise<MarketStatusFeed> {
  {
    const unified=await readJson(FEED_URL);
    if(isObject(unified) && Array.isArray(unified.days) && isObject(unified.navigation)){
      const nav=unified.navigation;
      const navigation={
        previous:Array.isArray(nav.previous)?nav.previous.filter(navEntry):[],
        today:Array.isArray(nav.today)?nav.today.filter(navEntry):[],
        next:Array.isArray(nav.next)?nav.next.filter(navEntry):[]
      };
      const days:MarketStatusDay[]=unified.days.filter((d:unknown)=>isObject(d)&&typeof d.date==='string'&&isObject(d.editions)).map((d:any)=>{
        const editions:Record<string,MarketStatusEdition>={};
        for(const [slot,v] of Object.entries(d.editions)){const parsed=parseEdition(v);if(parsed)editions[slot]=parsed;}
        return {schemaVersion:1 as const,date:d.date,editions};
      });
      return {days:days.sort((a,b)=>b.date.localeCompare(a.date)),navigation};
    }
    throw Error('시황 통합 JSON 형식 오류');
  }
}

