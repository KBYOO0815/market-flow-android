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
          {id:'watch',title:'주의',kind:'text',text:'정규장 개장 전'},
          {id:'bad-section',title:'오류',kind:'chart',data:{}}
        ]}
    },
    '23:20':{
      asOf:'2026-11-20T23:19:45+09:00',publishedAt:'2026-11-20T23:21:00+09:00',sources:[],
      content:[
        {type:'text',text:'제목 없이 표시되는 설명'},
        {type:'metric',title:'주요 지표',items:[{label:'KOSPI',value:5123.45,changePct:1.25,note:'종가'}]},
        {type:'list',title:'관찰 항목',items:['반도체 강세','환율 안정']},
        {type:'table',title:'시장 비교',columns:['시장','등락률'],rows:[['KOSPI',1.25],['KOSDAQ',-0.4]]},
        {type:'link',label:'원문 출처',url:'https://example.com/source'},
        {type:'future-type',title:'지원하지 않는 항목'},
        {type:'metric',title:'손상된 지표',items:[{value:{unexpected:true}}]},
        {type:'list',title:'부분 손상 목록',items:['표시 항목',null,3]}
      ]
    }
  }
};
const response = {
  schemaVersion: 1,
  days: [daily],
  navigation: {
    previous: [],
    today: [
      {date: daily.date, slot: '23:10', state: 'published'},
      {date: daily.date, slot: '23:20', state: 'published'}
    ],
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
  assert.deepEqual(e.content.map(x=>x.type),['metric','list','text']);
  assert.equal(e.content[0].items[0].value,7175.83);
  assert.equal(e.contentWarnings,1);
  const dynamic=feed.days[0].editions['23:20'];
  assert.deepEqual(dynamic.content.map(x=>x.type),['text','metric','list','table','link','list']);
  assert.equal(dynamic.content[0].title,undefined);
  assert.equal(dynamic.content[0].text,'제목 없이 표시되는 설명');
  assert.equal(dynamic.content[3].rows[1][0],'KOSDAQ');
  assert.equal(dynamic.content[4].url,'https://example.com/source');
  assert.equal(dynamic.content[5].items.length,1);
  assert.equal(dynamic.contentWarnings,2);
  assert.equal(feed.days[0].editions['23:20'].slot,'23:20');
  const revised=JSON.parse(JSON.stringify(response));
  const revisedItems=revised.days[0].editions['23:20'].content;
  revisedItems.splice(2,1);
  revisedItems.unshift({type:'text',title:'추가된 첫 항목',text:'새 분석'});
  revised.navigation.next=[];
  global.fetch=async()=>({ok:true,json:async()=>revised});
  const refreshed=await mod.exports.fetchMarketStatus();
  assert.deepEqual(refreshed.days[0].editions['23:20'].content.map(x=>x.title||x.type),[
    '추가된 첫 항목','text','주요 지표','시장 비교','link','부분 손상 목록'
  ]);
  assert.deepEqual(refreshed.navigation.next,[]);
  const blankHeader=JSON.parse(JSON.stringify(response));
  blankHeader.days[0].editions['23:20'].content=[{type:'table',columns:['','KOSPI',2026],rows:[['등락률',1.25,-0.4]]}];
  global.fetch=async()=>({ok:true,json:async()=>blankHeader});
  const table=(await mod.exports.fetchMarketStatus()).days[0].editions['23:20'].content[0];
  assert.deepEqual(table.columns,['','KOSPI','2026']);
  assert.deepEqual(table.rows,[['등락률',1.25,-0.4]]);
  console.log('PASS: legacy sections, content additions/removals/order, optional titles, empty navigation and malformed items');
})().catch(e=>{console.error(e);process.exit(1)});

