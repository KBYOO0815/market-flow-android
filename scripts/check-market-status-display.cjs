const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const ts=require('typescript');

const daily={
  schemaVersion:1,date:'2026-11-20',editions:{
    '23:10':{
      date:'2026-11-20',slot:'23:10',scheduledFor:'2026-11-20T23:10:00+09:00',
      asOf:'2026-11-20T23:09:45+09:00',publishedAt:'2026-11-20T23:31:35+09:00',
      sessionStatus:'raw session string',scope:'US',us:{summary:'raw',observedAt:'2026-11-20T23:09:45+09:00',
        flows:{market:'US', unit:'USD'}, indices:[{name:'S&P 500',value:7175.83,changePct:-2,observedAt:'2026-11-20T06:00:00+09:00',sourceUrl:'https://example.com'}]},
      kr:null,highlights:['h'],sources:[{name:'Reuters',url:'https://example.com',checkedAt:'2026-11-20T23:09:45+09:00'}],
      status:{collection:'partial',validation:'success',publication:'success'},
      display:{headline:'미국 프리마켓 약세',badges:['미국','프리마켓','일부 확인'],observedAt:'2026-11-20T23:09:45+09:00',
        sections:[
          {id:'indices',title:'주요 지수',kind:'metrics',items:[{label:'S&P 500',value:7175.83,changePct:-2,note:'11/19 종가'}]},
          {id:'drivers',title:'시장 흐름',kind:'bullets',items:['AI·반도체 약세']},
          {id:'watch',title:'주의',kind:'text',text:'정규장 개장 전'}
        ]}
    }
  }
};
const response = {
  schemaVersion: 1,
  days: [daily],
  navigation: {
    previous: [],
    today: [{date: daily.date, slot: '23:10', state: 'published'}],
    next: [{date: '2026-11-23', slot: '06:10', state: 'scheduled'}],
  },
};
global.fetch = async url => {
  assert.equal(new URL(url).pathname, '/KBYOO0815/market-flow-feed/main/market-status.json');
  return {ok: true, json: async () => response};
};
const mod=new Module('marketStatus');
mod.require=name=>require(name);
mod._compile(ts.transpileModule(fs.readFileSync('src/marketStatus.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}
}).outputText,'marketStatus.cjs');

(async()=>{
  const feed=await mod.exports.fetchMarketStatus(Date.parse('2026-11-20T23:40:00+09:00'));
  assert.equal(feed.days.length,1);
  assert.equal(feed.navigation.today[0].state,'published');
  assert.equal(feed.navigation.next[0].state,'scheduled');
  const e=feed.days[0].editions['23:10'];
  assert.equal(e.display.headline,'미국 프리마켓 약세');
  assert.deepEqual(e.display.sections.map(x=>x.kind),['metrics','bullets','text']);
  assert.equal(e.display.sections[0].items[0].value,7175.83);
  console.log('PASS: market-status parser preserves server-driven display sections');
})().catch(e=>{console.error(e);process.exit(1)});
