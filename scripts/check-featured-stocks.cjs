const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const editions = new Module('editions');
editions._compile(ts.transpileModule(fs.readFileSync('src/editions.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, 'editions.cjs');
const mod = new Module('featuredStocks');
mod.require = name => name === './editions' ? editions.exports : require(name);
mod._compile(ts.transpileModule(fs.readFileSync('src/featuredStocks.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, 'featuredStocks.cjs');

const {fetchFeaturedFeed, featuredNavigationTimeline, parseDailyFeaturedStocks} = mod.exports;
const date = '2026-11-23';
const edition = {
  schemaVersion: 3,
  asOf: date + 'T15:40:00+09:00',
  stocks: [{code: 'fixture', name: 'Test stock', changeRate: 5}],
  themes: [{id: 'fixture', name: 'Test theme', stockCodes: ['fixture'], reason: null}],
  individualStocks: [],
};
const day = {date, editions: {'15:40': edition, '19:40': {...edition, stocks: null}}};
const navigation = {
  previous: [{date: '2026-11-20', slot: '19:40', state: 'missing'}],
  today: [{date, slot: '15:40', state: 'published'}, {date, slot: '19:40', state: 'failed'}],
  next: [{date: '2026-11-24', slot: '08:40', state: 'scheduled'}],
};
const body = {schemaVersion: 3, days: {[date]: day}, navigation};
const parsed = parseDailyFeaturedStocks(day, date);
assert.deepEqual(parsed.editions, {'15:40': edition});
assert.equal(parsed.warnings.length, 1);

(async () => {
  const original = global.fetch;
  try {
    let requests = 0;
    global.fetch = async url => {
      requests++;
      assert.equal(new URL(url).pathname, '/KBYOO0815/market-flow-feed/main/featured-stocks-unified.json');
      return {ok: true, json: async () => body};
    };
    const feed = await fetchFeaturedFeed();
    assert.equal(requests, 1);
    assert.deepEqual(feed.days[date], parsed);
    assert.deepEqual(featuredNavigationTimeline(feed.navigation, Date.parse(date+'T20:00:00+09:00')).map(x => x.state),
      ['published', 'failed']);
    const changed = {previous:[],today:[
      {date,slot:'10:05',state:'published'},
      {date,slot:'22:40',state:'scheduled'},
    ],next:[]};
    assert.deepEqual(featuredNavigationTimeline(changed,Date.parse(date+'T21:00:00+09:00')).map(x=>x.slot),['10:05','22:40']);
    assert.deepEqual(featuredNavigationTimeline({...changed,today:changed.today.slice(1)},Date.parse(date+'T21:00:00+09:00')).map(x=>x.slot),['22:40']);
    for (const status of [404, 503]) {
      global.fetch = async () => ({ok: false, status});
      await assert.rejects(fetchFeaturedFeed(), new RegExp(String(status)));
    }
  } finally {
    global.fetch = original;
  }
  console.log('PASS: unified featured path, server navigation, partial data and HTTP errors');
})().catch(error => { console.error(error); process.exitCode = 1; });

