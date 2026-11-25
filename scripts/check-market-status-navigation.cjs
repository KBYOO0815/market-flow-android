const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const editions = new Module('editions');
editions._compile(ts.transpileModule(fs.readFileSync('src/editions.ts','utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}
}).outputText, 'editions.cjs');
const mod = new Module('MarketStatusScreen');
mod.require = name => {
  if(name === 'react') return {default:{},useCallback:()=>{},useEffect:()=>{},useRef:()=>{},useState:()=>{}};
  if(name === 'react/jsx-runtime') return {jsx:()=>{},jsxs:()=>{},Fragment:()=>{}};
  if(name === 'react-native') return {ActivityIndicator:()=>{},AppState:{},FlatList:()=>{},Linking:{},PanResponder:{},RefreshControl:()=>{},StyleSheet:{create:x=>x,hairlineWidth:1},Text:()=>{},TouchableOpacity:()=>{},View:()=>{}};
  if(name === './marketStatus') return {};
  if(name === './editions') return editions.exports;
  return require(name);
};
mod._compile(ts.transpileModule(fs.readFileSync('src/MarketStatusScreen.tsx','utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,jsx:ts.JsxEmit.ReactJSX}
}).outputText, 'MarketStatusScreen.cjs');
const {marketNavigationTimeline} = mod.exports;
const navigation={
  previous:[
    {date:'2026-11-20',slot:'06:10',state:'published'},
    {date:'2026-11-20',slot:'08:10',state:'missing'},
    {date:'2026-11-20',slot:'23:10',state:'published'},
  ],
  today:[
    {date:'2026-11-21',slot:'06:40',state:'published'},
    {date:'2026-11-21',slot:'15:40',state:'skipped',reason:'KRX 휴장'},
  ],
  next:[
    {date:'2026-11-23',slot:'06:10',state:'scheduled'},
    {date:'2026-11-23',slot:'07:10',state:'scheduled'},
    {date:'2026-11-23',slot:'23:10',state:'scheduled'},
  ],
};
const now=Date.parse('2026-11-21T17:00:00+09:00');
const timeline=marketNavigationTimeline(navigation, now);
assert.deepEqual(timeline.map(x=>x.slot),['06:10','08:10','23:10','06:40','15:40']);
assert.equal(timeline[1].state,'missing');
assert.equal(timeline[4].state,'skipped');
assert.equal(timeline.at(-1).state,'skipped');
assert.deepEqual(timeline.filter(x=>x.state==='published').map(x=>x.date+' '+x.slot),[
  '2026-11-20 06:10','2026-11-20 23:10','2026-11-21 06:40'
]);
assert.deepEqual(marketNavigationTimeline({...navigation,next:[]},now),timeline);
assert.deepEqual(marketNavigationTimeline({previous:[],today:[
  {date:'2026-11-21',slot:'10:05',state:'published'},
  {date:'2026-11-21',slot:'22:40',state:'scheduled'}
],next:[]},now).map(x=>x.slot),['10:05','22:40']);
console.log('PASS: market dial preserves D-1/D-day server navigation, including missing and holiday rounds');

