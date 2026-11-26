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
  headline?: string;
  badges?: string[];
  observedAt?: string;
  sections?: MarketDisplaySection[];
};
export type MarketContentItem =
  | {type:'text';title?:string;text:string}
  | {type:'metric';title?:string;items:MarketDisplayMetric[]}
  | {type:'list';title?:string;items:string[]}
  | {type:'table';title?:string;columns:string[];rows:(string|number|null)[][]}
  | {type:'link';title?:string;label:string;url:string;sourceName?:string;checkedAt?:string};
export type MarketStatusEdition = {
  date: string; slot: string; scheduledFor: string; asOf: string; publishedAt: string;
  sessionStatus: string; scope: 'US_KR' | 'KR' | 'US';
  us: MarketRegion | null; kr: MarketRegion | null;
  highlights: string[]; sources: {name:string;url:string;checkedAt:string}[];
  status: {collection:'success'|'partial';validation:'success';publication:'success'};
  display?: MarketDisplay;
  content: MarketContentItem[];
  contentWarnings?: number;
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

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const optionalTitle = (value: unknown): string | undefined => nonEmptyString(value) ? value : undefined;
const metric = (value: unknown): MarketDisplayMetric | null => {
  if (!isObject(value) || typeof value.label !== 'string' ||
      !(value.value === null || typeof value.value === 'string' || typeof value.value === 'number') ||
      (value.changePct !== undefined && value.changePct !== null && typeof value.changePct !== 'number') ||
      (value.note !== undefined && typeof value.note !== 'string')) return null;
  return {label:value.label,value:value.value,changePct:value.changePct,note:value.note};
};

function parseContentItem(value: unknown): MarketContentItem | null {
  if (!isObject(value)) return null;
  const type = value.type ?? value.kind ?? value.format;
  const title = optionalTitle(value.title);
  if (type === 'text') {
    const text = value.text ?? value.content ?? value.value;
    return nonEmptyString(text) ? {type,title,text} : null;
  }
  if (type === 'metric') {
    const metricValue = isObject(value.value) ? value.value : value;
    const rows = Array.isArray(value.items) ? value.items.map(metric).filter((x): x is MarketDisplayMetric => x !== null)
      : [metric(metricValue)].filter((x): x is MarketDisplayMetric => x !== null);
    return rows.length ? {type,title,items:rows} : null;
  }
  if (type === 'list') {
    const rows = value.items ?? value.list ?? value.content;
    if (!Array.isArray(rows)) return null;
    const items = rows.filter(nonEmptyString);
    return items.length ? {type,title,items} : null;
  }
  if (type === 'table') {
    const rawColumns = Array.isArray(value.columns) ? value.columns : Array.isArray(value.headers) ? value.headers : [];
    // Blank headers keep their position so that row cells stay under the right column.
    const columns: string[] = rawColumns.map((column: unknown) => typeof column === 'string' ? column
      : typeof column === 'number' ? String(column)
      : isObject(column) && typeof column.label === 'string' ? column.label : '');
    const rawRows = Array.isArray(value.rows) ? value.rows : Array.isArray(value.data) ? value.data : [];
    const inferred = rawRows.find(isObject);
    const finalColumns = columns.some(nonEmptyString) ? columns : inferred ? Object.keys(inferred) : [];
    if (!finalColumns.length) return null;
    const rows = rawRows.map((row: unknown) => {
      const cells = Array.isArray(row) ? row : isObject(row) ? finalColumns.map(column => row[column]) : null;
      if (!cells) return null;
      return finalColumns.map((_, index) => {
        const cell = cells[index];
        return cell === null || typeof cell === 'string' || typeof cell === 'number' ? cell : null;
      });
    }).filter((row: (string|number|null)[] | null): row is (string|number|null)[] => row !== null);
    return {type,title,columns:finalColumns,rows};
  }
  if (type === 'link') {
    const url = typeof value.url === 'string' ? value.url : typeof value.href === 'string' ? value.href
      : typeof value.sourceUrl === 'string' ? value.sourceUrl : '';
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    } catch { return null; }
    const label = nonEmptyString(value.label) ? value.label : nonEmptyString(value.sourceName) ? value.sourceName : url;
    return {type,title,label,url,sourceName:typeof value.sourceName === 'string' ? value.sourceName : undefined,
      checkedAt:typeof value.checkedAt === 'string' ? value.checkedAt : undefined};
  }
  return null;
}

function legacyContent(display: unknown): {content:MarketContentItem[];warnings:number} {
  if (!isObject(display) || !Array.isArray(display.sections)) return {content:[],warnings:0};
  const content: MarketContentItem[] = [];
  let warnings = 0;
  for (const section of display.sections) {
    if (!isObject(section)) { warnings++; continue; }
    const title = optionalTitle(section.title);
    if (section.kind === 'metrics' && Array.isArray(section.items)) {
      const items = section.items.map(metric).filter((x): x is MarketDisplayMetric => x !== null);
      if (items.length) content.push({type:'metric',title,items});
      warnings += section.items.length - items.length;
    } else if (section.kind === 'bullets' && Array.isArray(section.items)) {
      const items = section.items.filter(nonEmptyString);
      if (items.length) content.push({type:'list',title,items});
      warnings += section.items.length - items.length;
    } else if (section.kind === 'text' && nonEmptyString(section.text)) {
      content.push({type:'text',title,text:section.text});
    } else warnings++;
  }
  return {content,warnings};
}

function parseEdition(value: unknown, date: string, slot: string): MarketStatusEdition | null {
  if (!isObject(value)) return null;
  const rawDisplay = isObject(value.display) ? value.display : undefined;
  const rawContent = Array.isArray(value.content) ? value.content : undefined;
  const parsedContent = rawContent?.map(parseContentItem) ?? [];
  const contentWarnings = rawContent ? rawContent.length - parsedContent.filter((x): x is MarketContentItem => x !== null).length : 0;
  const normalizedContent = parsedContent.filter((x): x is MarketContentItem => x !== null);
  const useLegacyFallback = !!rawContent?.length && !normalizedContent.length && !!rawDisplay;
  const converted = rawContent && !useLegacyFallback
    ? {content:normalizedContent,warnings:contentWarnings}
    : legacyContent(rawDisplay);
  const sources = Array.isArray(value.sources) ? value.sources.filter((source:unknown)=>isObject(source)&&
    typeof source.name==='string'&&typeof source.url==='string').map((source:any)=>({name:source.name,url:source.url,
      checkedAt:typeof source.checkedAt==='string'?source.checkedAt:''})) : [];
  const asOf = typeof value.asOf === 'string' ? value.asOf : typeof value.publishedAt === 'string' ? value.publishedAt : date+'T'+slot+':00+09:00';
  const display: MarketDisplay | undefined = rawDisplay ? {
    headline:typeof rawDisplay.headline==='string'?rawDisplay.headline:undefined,
    badges:Array.isArray(rawDisplay.badges)?rawDisplay.badges.filter((x:unknown):x is string=>typeof x==='string'):[],
    observedAt:typeof rawDisplay.observedAt==='string'?rawDisplay.observedAt:undefined,
    sections:Array.isArray(rawDisplay.sections)?rawDisplay.sections as MarketDisplaySection[]:[]
  } : undefined;
  const legacyValid = Array.isArray(value.highlights) &&
    (value.kr === null || value.kr === undefined || renderRegion(value.kr)) &&
    (value.us === null || value.us === undefined || renderRegion(value.us));
  if (!rawContent && !rawDisplay && !legacyValid) return null;
  const warnings = converted.warnings + (useLegacyFallback ? contentWarnings : 0);
  return {
    ...(value as unknown as MarketStatusEdition), date, slot,
    scheduledFor:typeof value.scheduledFor==='string'?value.scheduledFor:date+'T'+slot+':00+09:00',
    asOf,publishedAt:typeof value.publishedAt==='string'?value.publishedAt:'',
    sessionStatus:typeof value.sessionStatus==='string'?value.sessionStatus:'',
    scope:value.scope==='US_KR'||value.scope==='KR'||value.scope==='US'?value.scope:'KR',
    us:renderRegion(value.us)?value.us:null, kr:renderRegion(value.kr)?value.kr:null,
    highlights:Array.isArray(value.highlights)?value.highlights.filter((x:unknown):x is string=>typeof x==='string'):[],
    sources,status:value.status&&typeof value.status==='object'?value.status:{collection:'partial',validation:'success',publication:'success'},
    display,content:converted.content,...(warnings?{contentWarnings:warnings}:{})
  };
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
          for(const [slot,v] of Object.entries(d.editions)){const parsed=parseEdition(v,d.date,slot);if(parsed)editions[slot]=parsed;}
        return {schemaVersion:1 as const,date:d.date,editions};
      });
      return {days:days.sort((a,b)=>b.date.localeCompare(a.date)),navigation};
    }
    throw Error('시황 통합 JSON 형식 오류');
  }
}

