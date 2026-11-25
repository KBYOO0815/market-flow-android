const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const module = new Module(name);
  module.require = path => path.startsWith('./') ? load(path.slice(2)) : require(path);
  const source = fs.readFileSync('src/' + name + '.ts', 'utf8');
  module._compile(ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText, name + '.cjs');
  modules.set(name, module.exports);
  return module.exports;
}

const {parseMarketBriefing} = load('feed');
const {briefingTimeline, resolveBriefingSelection} = load('editions');
const date = '2026-11-18';
const afternoon = {date, slot: '11:40'};
const evening = {date, slot: '19:40'};
const before = Date.parse(date + 'T19:39:59+09:00');
const after = Date.parse(date + 'T19:41:00+09:00');
const headline = '시진핑, APEC서 관세 인하·시장개방 확대 방침 재확인';
const article = {
  id: 'fixture', title: headline, summary: '테스트 기사', sourceName: 'Fixture',
  publishedAt: date + 'T19:30:00+09:00', sourceUrl: 'https://example.org/news',
  category: '정책·발언', region: 'foreign', relatedStocks: [], impactRank: 1,
};
const session = (slot, foreignNews = [], usThemes = []) => ({
  slot, asOf: date + 'T' + slot + ':11+09:00', foreignNews, domesticNews: [], usThemes,
  researchStatus: 'complete', usThemeStatus: 'not_applicable',
});
const feed = sessions => ({
  schemaVersion: 1, updatedAt: date + 'T19:40:15+09:00',
  days: [{date, isKrxTradingDay: true, sessions}],
});
const old = session('11:40');
const close = {
  ...session('15:40'),
  marketClose: {
    summary: '코스피 강세 마감', kospi: {close: 2500.12, changePct: 1.1},
    kosdaq: {close: 820.34, changePct: -0.2}, leadingThemes: ['반도체'],
    weakThemes: ['바이오'], sources: [{name: 'KRX', url: 'https://example.org/krx'}],
  },
};
const newEdition = session('19:40', [article]);
const resolve = (sessions, now, selected, observed) => {
  const [day] = parseMarketBriefing(feed(sessions), now);
  return resolveBriefingSelection(day, briefingTimeline(day, null), selected, observed, now);
};

assert.deepEqual(resolve([old], before, afternoon, afternoon).selection, afternoon); // A
const closeTime = Date.parse(date + 'T15:41:00+09:00');
assert.deepEqual(resolve([old, close], closeTime, afternoon, afternoon).selection, {date, slot:'15:40'});
const [closeDay] = parseMarketBriefing(feed([old, close]), closeTime);
assert.equal(closeDay.editions['15:40'].marketClose.kospi.close, 2500.12);
assert.equal(closeDay.editions['15:40'].items.length, 0);
assert.deepEqual(resolve([old, newEdition], after, afternoon, afternoon).selection, evening); // B
assert.deepEqual(resolve([old], after, afternoon, afternoon).selection, afternoon); // C
assert.deepEqual(resolve([old, newEdition], before, afternoon, afternoon).selection, afternoon);
assert.deepEqual(resolve([old, newEdition], after, afternoon, evening).selection, afternoon); // D
assert.deepEqual(resolve([old, newEdition], after, afternoon, null).selection, evening); // E
assert.deepEqual(resolve([old], after, null, evening).publication, evening);
assert.deepEqual(resolve([old, newEdition], after, afternoon, evening).manual, afternoon);

const themes = Array.from({length: 6}, (_, i) => ({
  direction: i < 3 ? 'up' : 'down', theme: '테마 ' + i, reason: '검증 자료',
  ...(i === 0 ? {weightedChangePct: 4.2, stocks: [{ticker: 'NVDA', regularChangePct: 5.1}]} : {stocks: []}),
}));
const [withThemes] = parseMarketBriefing(feed([session('07:40', [], themes)]), after);
const parsed = withThemes.editions['07:40'].usThemes;
assert.deepEqual(parsed.map(theme => theme.direction), ['up', 'up', 'up', 'down', 'down', 'down']); // G
assert.deepEqual(parsed.map(theme => theme.theme), themes.map(theme => theme.theme));
assert.equal(parsed[0].stocks[0].regularChangePct, 5.1);
assert.equal(parsed[3].weightedChangePct, undefined);
assert.deepEqual(parsed[3].stocks, []);

const optionalError = {...themes[0], weightedChangePct: 'invalid', afterHoursStatus: {}, stocks: [{ticker: 'NVDA', regularChangePct: 'invalid'}]};
const broken = session('15:40', [{...article, title: ''}]);
const [resilient] = parseMarketBriefing(feed([session('07:40', [], [optionalError]), broken, old, newEdition]), after);
assert.equal(resilient.editions['15:40'].items.length, 0); // structurally renderable session, invalid card omitted
assert.equal(resilient.editions['07:40'].usThemes[0].weightedChangePct, undefined);
assert.equal(resilient.editions['07:40'].usThemes[0].stocks[0].regularChangePct, undefined);
assert.equal(resilient.editions['19:40'].items[0].title, headline);
assert.equal(parseMarketBriefing(feed([broken]), after)[0].editions['15:40'].items.length, 0);

console.log('PASS: publication-driven selection, 15:40 market close, manual navigation, cold start, six US themes, and partial parsing');
