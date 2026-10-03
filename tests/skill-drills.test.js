import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {SKILL_DRILLS,skillDrillById,skillDrillBalls,gradeSkillDrill} from '../src/skill-drills.js';
import {freshProgress,recordLiveDrill,readLocalProgress,writeLocalProgress} from '../src/player-progress.js';

const result=(drillId,evidence,extra={})=>({
 kind:'drill',source:'live',id:'skill-001',at:'2026-10-02T22:00:00.000Z',
 drillId,completed:true,shots:1,evidence,...extra
});
function takeShot(id,angle,power){
 const announcements=[],g=new Game({kind:'drill',drillId:id,seed:31,onTurn:event=>announcements.push(event)});
 const before=g.sim.snapshot();
 assert.equal(g.sim.balls.length,2,'a drill must have only one authored target');
 assert.equal(g.beginShot(angle,power,{x:0,y:0}),true);
 let steps=0;
 for(;steps<12000&&g.turnShot;steps++)g.step();
 assert.ok(steps<12000,'live physics never settled');
 assert.equal(g.history[0].shot,1);
 return {g,before,announcements,steps};
}
test('three original drill layouts have valid distinct cues, pockets and rules',()=>{
 assert.equal(SKILL_DRILLS.length,3);
 assert.equal(new Set(SKILL_DRILLS.map(d=>d.id)).size,2);
 for(const drill of SKILL_DRILLS){
  assert.equal(skillDrillById(drill.id),drill);
  assert.equal(skillDrillBalls(drill.id).length,2);
  assert.notEqual(drill.targetId,0);
  assert.ok(drill.attempts>=2);
 }
 assert.equal(skillDrillById('fictional'),null);
 assert.throws(()=>skillDrillBalls('fictional'),RangeError);
 assert.throws(()=>new Game({kind:'drill',drillId:'fictional'}),RangeError);
});
test('each authored drill is finishable with actual settled fixed-step shots',()=>{
 for(const drill of SKILL_DRILLS){
  // Multiple human-plausible pull strengths: accept only actual pocket events
  // scored by Game, never a decorative/mock completed state.
  let success=null;
  for(const power of [.28,.38,.50,.65]){
   const attempt=takeShot(drill.id,drill.referenceAngle,power);
   if(attempt.g.drillOutcome==='completed'){success={...attempt,power};break;}
  }
  assert.ok(success,drill.id+' cannot be completed by any authored baseline pull');
  const keyboardBaseline=takeShot(drill.id,drill.referenceAngle,.53);
  assert.equal(keyboardBaseline.g.drillOutcome,'completed',
    drill.id+' should be solvable by an accessible half-power keyboard pull');
  const event=success.announcements.find(e=>e.type==='drill-end');
  assert.equal(event.completed,true,drill.id);
  assert.equal(event.evidence.potRecords.some(x=>x.id===drill.targetId&&
    x.pocket===drill.targetPocket),true);
  assert.equal(event.evidence.pots.includes(0),false,'baseline scratched');
  if(drill.requiredCushion)assert.ok(event.evidence.cushionBalls.includes(drill.targetId),
    'bank completion must include a real target-ball cushion rebound');
  assert.equal(success.g.history.at(-1).status,'completed');
  assert.equal(success.g.shots,1);
  // Matching seed, input and physics must always produce identical evidence.
  const replay=takeShot(drill.id,drill.referenceAngle,success.power);
  assert.deepEqual(replay.g.history,success.g.history);
  assert.deepEqual(replay.g.sim.snapshot(),success.g.sim.snapshot());
 }
});
test('invalid pocket, scratch, and exhausted attempts cannot mint completion',()=>{
 const drill=SKILL_DRILLS[0];
 const evidence={pots:[drill.targetId],potRecords:[{id:drill.targetId,pocket:drill.targetPocket}]};
 assert.equal(gradeSkillDrill(drill.id,{shots:1,shot:evidence}).status,'completed');
 assert.equal(gradeSkillDrill(drill.id,{shots:1,shot:{...evidence,pots:[0,drill.targetId]}}).reason,'scratch');
 assert.equal(gradeSkillDrill(drill.id,{shots:1,shot:{...evidence,potRecords:[{id:drill.targetId,pocket:0}]}}).reason,'wrong-pocket');
 assert.equal(gradeSkillDrill(drill.id,{shots:2,shot:{pots:[],potRecords:[]}}).reason,'out-of-shots');
 assert.equal(gradeSkillDrill(drill.id,{shots:1,shot:{pots:[],potRecords:[]}}).status,'continue');
 const initial=freshProgress();
 for(const forged of [
  result(drill.id,{...evidence,pots:[0,drill.targetId]}),
  result(drill.id,{pots:[],potRecords:[{id:drill.targetId,pocket:0}]}),
  result(drill.id,evidence,{kind:'practice'}),
  result(drill.id,evidence,{source:'replay'}),
  result(drill.id,evidence,{completed:false}),
  result(drill.id,evidence,{shots:0})
 ])assert.equal(recordLiveDrill(initial,forged),initial);
});
test('bank rejects direct pots and jaw-only evidence before saving a completion',()=>{
 const bank=skillDrillById('rail-return'),proof={pots:[3],potRecords:[{id:3,pocket:1}]};
 assert.equal(bank.requiredCushion,true);
 assert.equal(gradeSkillDrill(bank.id,{shots:1,shot:proof}).reason,'no-bank');
 assert.equal(gradeSkillDrill(bank.id,{shots:1,shot:{...proof,railBalls:[3]}}).status,'failed');
 assert.equal(gradeSkillDrill(bank.id,{shots:1,shot:{...proof,cushionBalls:[0]}}).status,'failed');
 assert.equal(gradeSkillDrill(bank.id,{shots:1,shot:{...proof,cushionBalls:[3]}}).status,'completed');
 const before=freshProgress();
 assert.equal(recordLiveDrill(before,result(bank.id,proof)),before);
 const earned=recordLiveDrill(before,result(bank.id,{...proof,cushionBalls:[3]}));
 assert.equal(earned.drills[bank.id],1);
 assert.ok(earned.achievements.includes('drill-rail-return'));
 assert.equal(earned.matchesPlayed,0);
});
test('verified personal best and achievement persist but never inflate match stats',()=>{
 const proof={pots:[1],potRecords:[{id:1,pocket:1}]};
 let progress=freshProgress();
 progress=recordLiveDrill(progress,result('center-drop',proof,{shots:2}));
 assert.equal(progress.drills['center-drop'],2);
 assert.ok(progress.achievements.includes('drill-center-drop'));
 assert.equal(progress.matchesPlayed,0);
 assert.equal(recordLiveDrill(progress,result('center-drop',proof,{shots:1})),progress,'duplicate receipt');
 progress=recordLiveDrill(progress,result('center-drop',proof,{id:'skill-002',shots:1}));
 assert.equal(progress.drills['center-drop'],1);
 assert.equal(progress.drillEvents.length,2);
 const storage=new Map(),store={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value)
 };
 assert.equal(writeLocalProgress(progress,()=>store),true);
 const saved=readLocalProgress(()=>store);
 assert.equal(saved.writable,true);
 assert.deepEqual(saved.progress.drills,progress.drills);
 const old=freshProgress();delete old.drills;delete old.drillEvents;
 storage.set('ghostball-progress-v1',JSON.stringify(old));
 assert.deepEqual(readLocalProgress(()=>store).progress.drills,{});
});
