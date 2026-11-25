const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const ts=require('typescript');
const cache={};
function load(name){
  if(cache[name]) return cache[name];
  const m=new Module(name);
  m.require=p=>p.startsWith('./')?load(p.slice(2)):require(p);
  m._compile(ts.transpileModule(fs.readFileSync('src/'+name+'.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}
  }).outputText,name+'.cjs');
  return cache[name]=m.exports;
}
const feed=load('feed'), editions=load('editions');
const item={id:'n',title:'뉴스',summary:'요약',publishedAt:'2026-11-21T06:00:00+09:00',sourceName:'Reuters',sourceUrl:'https://example.org/n',category:'시장',region:'foreign',relatedStocks:[],impactRank:1};
const body={
  schemaVersion:1,updatedAt:'2026-11-21T06:45:00+09:00',
  navigation:{
    previous:[{date:'2026-11-20',slot:'19:40',state:'failed',errorCode:'DATA_CONTRACT_CONFLICT'}],
    today:[{date:'2026-11-21',slot:'07:40',state:'published'},{date:'2026-11-21',slot:'19:40',state:'scheduled'}],
    next:[{date:'2026-11-22',slot:'07:40',state:'scheduled'},{date:'2026-11-22',slot:'19:40',state:'scheduled'}]
  },
  days:[{date:'2026-11-21',isKrxTradingDay:false,displaySlots:['07:40','19:40'],sessions:[
    {slot:'07:40',asOf:'2026-11-21T07:43:00+09:00',foreignNews:[item],domesticNews:[],usThemes:[],researchStatus:'complete',usThemeStatus:'verified_no_theme'}
  ]}]
};
global.fetch=async url=>{
  assert.equal(new URL(url).pathname, '/KBYOO0815/market-flow-feed/main/market-news.json');
  return {status:200,ok:true,json:async()=>body};
};
(async()=>{
  const result=await feed.fetchBriefingFeed(Date.parse('2026-11-21T14:00:00+09:00'));
  const timeline=editions.briefingNavigationTimeline(result.navigation, Date.parse('2026-11-21T14:00:00+09:00'));
  assert.deepEqual(timeline.map(x=>x.state),['failed','published','scheduled']);
  assert.deepEqual(timeline.map(x=>x.date+' '+x.slot),[
    '2026-11-20 19:40','2026-11-21 07:40','2026-11-21 19:40'
  ]);
  assert.equal(result.days[0].editions['07:40'].items[0].title,'뉴스');
  body.navigation.today.push({date:'2026-11-21',slot:'22:40',state:'published'});
  body.navigation.today.splice(1,1); // server removes the former 19:40 round
  body.navigation.today.splice(1,0,{date:'2026-11-21',slot:'10:05',state:'published'});
  body.days[0].sessions.push(
    {slot:'10:05',asOf:'2026-11-21T10:06:00+09:00',foreignNews:[item],domesticNews:[]},
    {slot:'22:40',asOf:'2026-11-21T22:41:00+09:00',foreignNews:[item],domesticNews:[]},
  );
  const late=await feed.fetchBriefingFeed(Date.parse('2026-11-21T23:00:00+09:00'));
  const lateTimeline=editions.briefingNavigationTimeline(late.navigation,Date.parse('2026-11-21T23:00:00+09:00'));
  assert.deepEqual(lateTimeline.map(x=>x.slot),['19:40','07:40','10:05','22:40']);
  assert(late.days[0].editions['22:40']);
  assert(late.days[0].editions['10:05']);
  body.navigation.next=[];
  assert.deepEqual(editions.briefingNavigationTimeline(body.navigation,Date.parse('2026-11-21T23:00:00+09:00')).map(x=>x.slot),lateTimeline.map(x=>x.slot));
  const rollover=editions.briefingNavigationTimeline({...body.navigation,next:[{date:'2026-11-22',slot:'09:15',state:'scheduled'}]},Date.parse('2026-11-22T00:01:00+09:00'));
  assert.equal(rollover.some(x=>x.date==='2026-11-20'),false);
  assert.equal(rollover.at(-1).slot,'09:15');
  console.log('PASS: news D-1/D-day, 22:40, added/deleted slots, empty next and KST rollover');
})().catch(e=>{console.error(e);process.exit(1)});

