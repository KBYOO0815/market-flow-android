const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const disk = new Map();
const native = {
  getItem: async key => disk.get(key) ?? null,
  setItem: async (key,value) => { await new Promise(r=>setTimeout(r,value.includes('07:40')?15:0)); disk.set(key,value); },
  removeItem: async key => { disk.delete(key); },
};
function freshStorage() {
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const m = new Module(name);
    m.require = p => p === '@react-native-async-storage/async-storage' ? {default:native} : p.startsWith('./') ? load(p.slice(2)) : require(p);
    m._compile(ts.transpileModule(fs.readFileSync('src/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,name+'.cjs');
    return cache[name]=m.exports;
  }
  return load('selectionStorage');
}
(async () => {
  const now = Date.parse('2026-11-12T17:00:00+09:00');
  const storage = freshStorage();
  await Promise.all([storage.saveSelection({date:'2026-11-12',slot:'07:40'}), storage.saveSelection({date:'2026-11-12',slot:'11:40'})]);
  assert.deepEqual(await freshStorage().readSelection(now),{date:'2026-11-12',slot:'11:40'});
  assert.deepEqual(await freshStorage().readSelection(now + 4*86400000),{date:'2026-11-12',slot:'11:40'}); // live server navigation decides whether a saved date is still selectable
  await storage.saveSelection(null);
  assert.equal(await freshStorage().readSelection(now),null);
  const original=native.setItem; native.setItem=async()=>{throw Error('disk failure');};
  await assert.rejects(storage.saveSelection({date:'2026-11-12',slot:'07:40'}),/disk failure/);
  native.setItem=original;
  await storage.saveSelection({date:'2026-11-12',slot:'19:40'});
  assert.equal((await freshStorage().readSelection(now)).slot,'19:40');
  console.log('PASS: cold restart restores selection, ordered rapid writes, server-validated date persistence and storage failure recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});

