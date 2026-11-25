const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('src/briefing.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const loaded = new Module('briefing-check');
loaded._compile(compiled, 'briefing-check.cjs');
const {resolveRegion, selectBriefingItems} = loaded.exports;
const items = Array.from({length: 24}, (_, i) => ({
  id: String(i), region: i % 2 ? 'foreign' : 'domestic', impactRank: 24-i,
  publishedAt: '2026-11-11T00:00:00Z',
}));
const result = selectBriefingItems(items);
assert.equal(result.length, 20);
assert(result.slice(0,10).every(x => x.region === 'foreign'));
assert(result.slice(10).every(x => x.region === 'domestic'));
assert.deepEqual(result.slice(0,10).map(x => x.impactRank), [1,3,5,7,9,11,13,15,17,19]);
assert.deepEqual(result.slice(10).map(x => x.impactRank), [2,4,6,8,10,12,14,16,18,20]);
assert.equal(selectBriefingItems(items.filter(x => x.region === 'domestic')).length, 10);
assert.equal(selectBriefingItems([]).length, 0);
assert.equal(resolveRegion({category:'정책·발언', id:'unknown'}), undefined);
assert.equal(resolveRegion({category:'반도체·AI', region:'domestic'}), 'domestic');
assert.equal(resolveRegion({category:'반도체·AI', id:'20261111-nvidia-selloff'}), 'foreign');
assert.equal(resolveRegion({category:'미국증시', region:'invalid'}), undefined);
console.log('PASS: foreign first, domestic second; independent 10-item limits; impact ordering; explicit regional metadata.');
const {isItemCurrent} = loaded.exports;
const checkTime = Date.parse('2026-11-11T11:20:00+09:00');
assert.equal(isItemCurrent({id:'20261111-samsung-hynix-weak-open',publishedAt:'2026-11-11T09:32:00+09:00'}, checkTime), false);
assert.equal(isItemCurrent({id:'fresh',kind:'market_snapshot',observedAt:'2026-11-11T11:18:00+09:00',publishedAt:'2026-11-11T11:18:00+09:00',validUntil:'2026-11-11T11:33:00+09:00'}, checkTime), true);
assert.equal(isItemCurrent({id:'expired',kind:'news',validUntil:'2026-11-11T11:15:00+09:00'}, checkTime), false);
assert.equal(isItemCurrent({id:'historical-news',kind:'news',publishedAt:'2026-11-10T12:00:00+09:00'}, checkTime), true);
console.log('PASS: expired opening quotes are hidden at later sessions; active news is retained.');
