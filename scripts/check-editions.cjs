const assert = require('node:assert/strict');
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const cache={};function load(name){if(cache[name])return cache[name];const m=new Module(name);m.require=p=>p.startsWith('./')?load(p.slice(2)):require(p);m._compile(ts.transpileModule(fs.readFileSync('src/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,name+'.cjs');return cache[name]=m.exports;}
const f=load('feed'),e=load('editions');
const date = '2026-11-16';
const now = Date.parse(date + 'T12:00:00+09:00');
const item = {id:'x', title:'verified', summary:'fact', region:'foreign', publishedAt:date+'T07:00:00+09:00'};
const session = {slot:'07:40', asOf:date+'T07:41:00+09:00', foreignNews:[item], domesticNews:[], researchStatus:'partial'};
const base = {schemaVersion:1, days:[{date, isKrxTradingDay:true, sessions:[session]}]};
const [day] = f.parseMarketBriefing(base, now);
assert.equal(e.isSlot('22:40'), true);
assert.equal(e.isSlot('24:40'), false);
assert.deepEqual(e.visibleBriefingDates(now), [date,'2026-11-15']);
assert.equal(day.editions['07:40'].items[0].title, 'verified');
assert(day.editions['07:40'].statusNotes.includes('조사 상태: 부분 완료'));
assert.equal(e.latestPublished(day, now), '07:40');
assert.equal(e.editionState(day, '11:40', now), 'missing');
assert.equal(e.editionState(day, '15:40', now), 'scheduled');
assert.equal(f.parseMarketBriefing(base, Date.parse(date+'T07:40:00+09:00'))[0].editions['07:40'], undefined);
assert.deepEqual(e.parseSelection(JSON.stringify({date:'2026-11-12',slot:'07:40'}), now), {date:'2026-11-12',slot:'07:40'});
assert.equal(e.parseSelection(JSON.stringify({date:'bad-date',slot:'07:40'}), now), null);
assert.equal(e.latestPublished({date,editions:{}}, now), null);
assert.equal(e.isNewerPublication({date,slot:'22:40'},{date,slot:'19:40'}),true);
assert.equal(e.isNewerPublication({date,slot:'19:40'},{date,slot:'22:40'}),false);
assert.equal(e.isNewerPublication({date,slot:'22:40'},null),false);
console.log('PASS: dynamic news slots, D/D-1, status notes and future guard');

