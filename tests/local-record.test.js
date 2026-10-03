import test from 'node:test';
import assert from 'node:assert/strict';
import {recordSummary} from '../src/record-summary.js';
import {freshProgress,recordLiveMatch,readLocalProgress,writeLocalProgress,
 resetLocalProgress,exportLocalProgress,PROGRESS_KEY} from '../src/player-progress.js';
const memory=()=>{const data=new Map();return{
 data,getItem:k=>data.get(k)??null,
 setItem:(k,v)=>data.set(k,v),
 removeItem:k=>data.delete(k)}};
const result=(id,extra={})=>({
 kind:'match',source:'live',id,at:'2026-10-02T20:00:00.000Z',
 shots:19,winner:0,players:'cpu',difficulty:'rookie',
 room:1,bestRun:3,reason:'eight-cleared',...extra
});
test('read-only record contains actual finished games and bounded latest matches',()=>{
 let saved=freshProgress();
 assert.equal(recordSummary(saved).matches,0);
 saved=recordLiveMatch(saved,result('a'));
 saved=recordLiveMatch(saved,result('b',{winner:1,reason:'early-eight'}));
 saved=recordLiveMatch(saved,result('c',{players:'local',winner:1}));
 saved=recordLiveMatch(saved,result('d',{difficulty:'club'}));
 const summary=recordSummary(saved);
 assert.equal(summary.matches,4);
 assert.equal(summary.wins,2);assert.equal(summary.losses,1);
 assert.equal(summary.local,1);assert.equal(summary.clean,2);
 assert.equal(summary.run,3);assert.equal(summary.recent.length,3);
 assert.deepEqual(summary.recent.map(x=>x.title),['WIN','P2 WON','LOSS']);
 assert.deepEqual(summary.recent.map(x=>x.opponent),['CLUB PRO','LOCAL','ROOKIE']);
 const snapshot=JSON.stringify(saved);
 recordSummary(saved);
 assert.equal(JSON.stringify(saved),snapshot,'summary must never edit the ledger');
});
test('export includes bounded history and equipped cues without changing control preferences',()=>{
 const store=memory();
 let p=recordLiveMatch(freshProgress(),result('a'));
 p={...p,selectedCue:'copperline',favorites:['house'],selectedRoom:4};
 store.setItem('ghostball-sound','off');
 store.setItem('ghostball-power-side','right');
 assert.equal(writeLocalProgress(p,()=>store),true);
 const exported=JSON.parse(exportLocalProgress(readLocalProgress(()=>store).progress));
 assert.deepEqual(exported,p);
 assert.equal(resetLocalProgress(()=>store),true);
 assert.equal(store.getItem(PROGRESS_KEY),null);
 assert.equal(store.getItem('ghostball-sound'),'off');
 assert.equal(store.getItem('ghostball-power-side'),'right');
 assert.deepEqual(readLocalProgress(()=>store).progress,freshProgress());
});
test('failed clear cannot claim success or destroy unsupported local versions',()=>{
 assert.equal(resetLocalProgress(()=>null),false);
 assert.equal(resetLocalProgress(()=>({})),false);
 assert.equal(resetLocalProgress(()=>{throw Error('denied');}),false);
 assert.equal(resetLocalProgress(()=>({removeItem:()=>{throw Error('denied');}})),false);
 const store=memory(),future='{"version":99,"important":"keep"}';
 store.setItem(PROGRESS_KEY,future);
 const read=readLocalProgress(()=>store);
 assert.equal(read.writable,false);assert.equal(read.reason,'unsupported-version');
 assert.equal(store.getItem(PROGRESS_KEY),future);
});
