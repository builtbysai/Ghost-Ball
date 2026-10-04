import test from 'node:test';
import assert from 'node:assert/strict';
import {FOUNDER_MASTERY,roomMastery} from '../src/room-mastery.js';
import {freshProgress,recordLiveDrill,recordLiveMatch,
 readLocalProgress,writeLocalProgress} from '../src/player-progress.js';

const drill=(id,target,pocket)=>({
 kind:'drill',source:'live',id:'event-'+id,drillId:id,
 completed:true,shots:1,at:'2026-10-03T08:00:00.000Z',
 evidence:{pots:[target],potRecords:[{id:target,pocket}],
   cushionBalls:['rail-return','midnight-bank'].includes(id)?[target]:[]}
});
const match=(id,room,extra={})=>({
 kind:'match',source:'live',id:'game-'+id,at:'2026-10-03T08:30:00.000Z',
 shots:15,players:'cpu',difficulty:'rookie',room,winner:0,
 reason:'eight-cleared',bestRun:2,...extra
});
test('all five authored hall paths have distinct actual skills and start open',()=>{
 assert.deepEqual(FOUNDER_MASTERY.map(d=>d.drillId),['center-drop','corner-line','rail-return','glass-angle','midnight-bank']);
 const zero=freshProgress();
 for(const h of FOUNDER_MASTERY){
  const m=roomMastery(zero,h.room);
  assert.equal(m.count,0);assert.equal(m.complete,false);
  assert.equal(m.next,'COMPLETE '+h.drillName);
 }
 assert.equal(roomMastery(zero,5),null);
});
test('only verified settled drills and adjudicated CPU matches advance mastery',()=>{
 let state=freshProgress();
 const initial=roomMastery(state,0);
 state=recordLiveDrill(state,drill('center-drop',1,1));
 assert.equal(roomMastery(state,0).count,1);
 assert.equal(state.roomMastery[0]&1,1);
 assert.equal(recordLiveDrill(state,drill('center-drop',1,1)),state,'duplicate cannot advance');
 state=recordLiveMatch(state,match('loss',0,{winner:1,reason:'early-eight'}));
 assert.equal(roomMastery(state,0).count,2,'a genuine loss counts only as finishing');
 assert.equal(roomMastery(state,0).steps[2].done,false);
 const local=recordLiveMatch(state,match('local',0,{players:'local'}));
 assert.equal(roomMastery(local,0).count,2,'pass-and-play cannot award rival mastery');
 state=recordLiveMatch(local,match('win',0,{winner:0,reason:'eight-cleared'}));
 assert.equal(roomMastery(state,0).count,3);
 assert.equal(roomMastery(state,0).complete,true);
 assert.equal(roomMastery(state,1).count,0);
 assert.equal(state.roomMastery[0],7);
 assert.equal(state.matchesPlayed,3,'mastery must not create fictional match records');
});
test('a third verified bank awards its own hall without faking match wins',()=>{
 const zero=freshProgress();
 const invalid=drill('rail-return',3,1);
 delete invalid.evidence.cushionBalls;
 assert.equal(recordLiveDrill(zero,invalid),zero);
 const done=recordLiveDrill(zero,drill('rail-return',3,1));
 assert.equal(roomMastery(done,2).count,1);
 assert.equal(roomMastery(done,2).steps[1].done,false);
 assert.equal(done.matchesPlayed,0);
});
test('Wintergarden and Afterhours only advance from their actual verified achievements',()=>{
 let state=freshProgress();
 const wrong=drill('midnight-bank',5,4);delete wrong.evidence.cushionBalls;
 assert.equal(recordLiveDrill(state,wrong),state);
 state=recordLiveDrill(state,drill('glass-angle',4,5));
 assert.equal(roomMastery(state,3).count,1);
 assert.equal(roomMastery(state,4).count,0);
 state=recordLiveDrill(state,drill('midnight-bank',5,4));
 assert.equal(roomMastery(state,4).count,1);
 state=recordLiveMatch(state,match('winter-loss',3,{winner:1,reason:'early-eight'}));
 assert.equal(roomMastery(state,3).count,2);
 state=recordLiveMatch(state,match('night-win',4));
 assert.equal(roomMastery(state,4).count,3);
 assert.equal(roomMastery(state,3).steps[2].done,false);
 assert.equal(state.matchesPlayed,2);
});
test('pre-mastery v1 records are read without changing format; receipts survive ledger pruning',()=>{
 const old=freshProgress();
 delete old.roomMastery;
 old.drills={'center-drop':1};
 old.records=[{id:'old',room:0,players:'cpu',winner:0,reason:'eight-cleared'}];
 const storage=new Map([['ghostball-progress-v1',JSON.stringify(old)]]),store={
  getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)
 };
 const loaded=readLocalProgress(()=>store);
 assert.equal(loaded.writable,true);
 assert.equal(roomMastery(loaded.progress,0).count,3,'legacy genuine records must count');
 const updated=recordLiveMatch(loaded.progress,match('fresh',1));
 assert.equal(updated.roomMastery[0],7,'backfill prior proof before bounded records age out');
 updated.records=[];
 assert.equal(roomMastery(updated,0).count,3,'permanent receipts must not regress');
 assert.equal(writeLocalProgress(updated,()=>store),true);
 assert.deepEqual(readLocalProgress(()=>store).progress.roomMastery,updated.roomMastery);
});
