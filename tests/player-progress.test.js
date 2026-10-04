import test from 'node:test';
import assert from 'node:assert/strict';
import {freshProgress,readLocalProgress,writeLocalProgress,
 recordLiveMatch,bestLegalRun,chooseRoom,exportLocalProgress,
 resetLocalProgress,PROGRESS_KEY} from '../src/player-progress.js';

function memoryStorage(){
 const values=new Map();
 return {getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,value),
  removeItem:key=>values.delete(key),
  values};
}
const result=(overrides={})=>({
 kind:'match',source:'live',id:'match-001',at:'2026-10-02T20:00:00.000Z',
 shots:27,winner:0,players:'cpu',difficulty:'rookie',room:1,
 bestRun:3,reason:'eight-cleared',...overrides
});

test('a first clean CPU victory earns only authentic local milestones',()=>{
 const zero=freshProgress(),next=recordLiveMatch(zero,result());
 assert.equal(zero.matchesPlayed,0,'recording must be immutable');
 assert.equal(next.matchesPlayed,1);assert.equal(next.vsCpuWins,1);
 assert.equal(next.vsCpuLosses,0);assert.equal(next.bestRun,3);
 assert.deepEqual(next.achievements,['first-match','clean-eight','beat-rookie']);
 assert.equal(next.records.length,1);
 assert.deepEqual(recordLiveMatch(next,result()),next,'repeat result must be idempotent');
 const club=recordLiveMatch(next,result({id:'match-002',difficulty:'club'}));
 assert.ok(club.achievements.includes('beat-club'));
 assert.equal(club.cleanWins,2);
});
test('local pass and play increments neither owner CPU wins nor losses',()=>{
 const next=recordLiveMatch(freshProgress(),result({
  id:'pass-1',players:'local',winner:1,difficulty:'rookie',reason:'early-eight'
 }));
 assert.equal(next.localMatches,1);assert.equal(next.vsCpuWins,0);
 assert.equal(next.vsCpuLosses,0);assert.deepEqual(next.achievements,['first-match']);
});
test('unfinished, test, exhibition, drill and malformed wins never mint progress',()=>{
 const state=freshProgress();
 const invalid=[
  result({source:'exhibition'}),result({source:'replay'}),
  result({kind:'practice'}),result({kind:'attract'}),
  result({winner:null}),result({reason:'unverified'}),result({shots:0}),
  result({bestRun:100}),result({id:''})
 ];
 for(const event of invalid)assert.equal(recordLiveMatch(state,event),state);
});
test('best-run counts only legitimate own group pots and breaks on misses or fouls',()=>{
 const history=[
  {kind:'ruling',shooter:0,result:'retain',groupAtStart:'open',
   groups:['solids','stripes'],potRecords:[{id:1},{id:9},{id:2}]},
  {kind:'ruling',shooter:0,result:'retain',groupAtStart:'solids',
   groups:['solids','stripes'],potRecords:[{id:3}]},
  {kind:'ruling',shooter:1,result:'turn',groupAtStart:'stripes',
   groups:['solids','stripes'],potRecords:[]},
  {kind:'ruling',shooter:0,result:'retain',groupAtStart:'solids',
   groups:['solids','stripes'],potRecords:[{id:4}]},
  {kind:'ruling',shooter:0,result:'end',reason:'early-eight',groupAtStart:'solids',
   groups:['solids','stripes'],potRecords:[{id:5},{id:8}]},
 ];
 assert.equal(bestLegalRun(history,0),3);
 assert.equal(bestLegalRun(history,1),0);
});
test('session progress persists and selected room round-trips',()=>{
 const storage=memoryStorage();
 const initial=readLocalProgress(()=>storage);
 assert.equal(initial.writable,true);
 assert.equal(initial.progress.selectedRoom,1);
 let next=recordLiveMatch(initial.progress,result());
 next=chooseRoom(next,4,5);
 assert.equal(next.selectedRoom,4);
 assert.equal(chooseRoom(next,5,5),next);
 assert.equal(writeLocalProgress(next,()=>storage),true);
 const loaded=readLocalProgress(()=>storage);
 assert.deepEqual(loaded.progress,next);
 assert.deepEqual(JSON.parse(exportLocalProgress(next)),next);
 assert.equal(resetLocalProgress(()=>storage),true);
 assert.equal(storage.values.has(PROGRESS_KEY),false);
});
test('invalid/future stored data and denied storage never destroy old records',()=>{
 const storage=memoryStorage(),unknown='{"version":99,"myLaterProgress":2}';
 storage.setItem(PROGRESS_KEY,unknown);
 const future=readLocalProgress(()=>storage);
 assert.equal(future.writable,false);assert.equal(future.reason,'unsupported-version');
 assert.equal(storage.getItem(PROGRESS_KEY),unknown);
 storage.setItem(PROGRESS_KEY,'{"version":1}');
 const corrupt=readLocalProgress(()=>storage);
 assert.equal(corrupt.writable,false);assert.equal(corrupt.reason,'invalid-data');
 assert.equal(writeLocalProgress(freshProgress(),()=>({
  setItem:()=>{throw Error('quota');}
 })),false);
 const blocked=readLocalProgress(()=>{throw Error('security');});
 assert.equal(blocked.writable,false);
 assert.equal(blocked.progress.matchesPlayed,0);
});
test('ledger caps stored match history while retaining accumulated statistics',()=>{
 let state=freshProgress();
 for(let i=0;i<87;i++)state=recordLiveMatch(state,
  result({id:'event-'+i,at:'2026-10-02T20:00:00.000Z'}));
 assert.equal(state.matchesPlayed,87);
 assert.equal(state.records.length,80);
 assert.equal(state.records[0].id,'event-86');
});

import {dayKey,dailySeed,recordDaily,dailySummary} from '../src/player-progress.js';
import {Game as DailyGame} from '../src/game.js';
test('the daily rack: stable per-day seed, best shots kept, streak counted',()=>{
 assert.equal(dailySeed('2026-10-04'),dailySeed('2026-10-04'));
 assert.notEqual(dailySeed('2026-10-04'),dailySeed('2026-10-05'));
 assert.equal(dayKey(new Date(2026,9,4)),'2026-10-04');
 let p=freshProgress();
 p=recordDaily(p,{date:'2026-10-04',shots:19});p=recordDaily(p,{date:'2026-10-04',shots:12});p=recordDaily(p,{date:'2026-10-04',shots:15});
 assert.equal(p.daily['2026-10-04'],12,'only the best is kept');
 p=recordDaily(p,{date:'2026-10-03',shots:20});p=recordDaily(p,{date:'2026-10-01',shots:9});
 assert.deepEqual(dailySummary(p,'2026-10-04'),{today:12,streak:2,total:3});
 assert.equal(dailySummary(p,'2026-10-05').streak,2,'yesterday still counts until today is missed');
 assert.equal(dailySummary(p,'2026-10-07').streak,0);
 assert.equal(recordDaily(p,{date:'nonsense',shots:5}),p);assert.equal(recordDaily(p,{date:'2026-10-04',shots:0}),p);
 const store=memoryStorage();assert.ok(writeLocalProgress(p,()=>store));
 assert.deepEqual(readLocalProgress(()=>store).progress.daily,p.daily,'the daily ledger survives a reload');
});
test('two games on the same daily seed deal the same rack and a rerack replays it',()=>{
 const a=new DailyGame({kind:'practice',seed:dailySeed('2026-10-04'),fixedRack:true}),b=new DailyGame({kind:'practice',seed:dailySeed('2026-10-04'),fixedRack:true});
 const layout=g=>g.sim.balls.map(x=>[x.id,x.x,x.y]);
 assert.deepEqual(layout(a),layout(b));
 a.reset();assert.deepEqual(layout(a),layout(b));
});
