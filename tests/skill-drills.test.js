import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {SKILL_DRILLS,FOUNDER_DRILLS,EXTRA_DRILLS,skillDrillById,skillDrillBalls,gradeSkillDrill} from '../src/skill-drills.js';
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
test('five original drill layouts have valid distinct cues, pockets and rules',()=>{
 assert.equal(FOUNDER_DRILLS.length,5);
 assert.equal(SKILL_DRILLS.length,FOUNDER_DRILLS.length+EXTRA_DRILLS.length);
 assert.equal(new Set(SKILL_DRILLS.map(d=>d.id)).size,SKILL_DRILLS.length);
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
 for(const drill of FOUNDER_DRILLS){
  // Multiple human-plausible pull strengths: accept only actual pocket events
  // scored by Game, never a decorative/mock completed state.
  let success=null;
  for(const power of [.28,.38,.40,.50,.53,.65]){
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
test('upper-bank awards Afterhours only after actual non-jaw target rebound',()=>{
 const upper=skillDrillById('midnight-bank');
 const evidence={pots:[5],potRecords:[{id:5,pocket:4}]};
 assert.equal(upper.room,4);
 for(const falsified of [evidence,{...evidence,railBalls:[5]},
  {...evidence,cushionBalls:[0]}]){
  assert.equal(gradeSkillDrill(upper.id,{shots:1,shot:falsified}).status,'failed');
  const before=freshProgress();assert.equal(recordLiveDrill(before,result(upper.id,falsified)),before);
 }
 const accepted=recordLiveDrill(freshProgress(),result(upper.id,{...evidence,cushionBalls:[5]}));
 assert.equal(accepted.drills[upper.id],1);
 assert.equal(accepted.roomMastery[4]&1,1);
 assert.equal(accepted.matchesPlayed,0);
});
test('lower-corner angle cannot be credited for a different pocket',()=>{
 const angle=skillDrillById('glass-angle');
 const proof={pots:[4],potRecords:[{id:4,pocket:5}]};
 assert.equal(angle.room,3);
 assert.equal(gradeSkillDrill(angle.id,{shots:1,shot:{...proof,potRecords:[{id:4,pocket:2}]}}).status,'failed');
 const actual=recordLiveDrill(freshProgress(),result(angle.id,proof));
 assert.equal(actual.drills[angle.id],1);
 assert.equal(actual.roomMastery[3]&1,1);
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

function strike(id,{angle,power,spin}){
 const events=[],g=new Game({kind:'drill',drillId:id,seed:31,onTurn:e=>events.push(e)});
 assert.equal(g.beginShot(angle,power,spin),true);
 let k=0;while(g.turnShot&&k++<12000)g.step();
 return {g,events};
}
test('the extra skills are physically solvable by their authored solution, and only by skill',()=>{
 for(const drill of EXTRA_DRILLS){
  if(drill.streak)continue;   // streak drills are covered by their own test
  const ok=strike(drill.id,drill.solution);
  assert.equal(ok.g.drillOutcome,'completed',drill.id+' is not solvable by its own solution');
  assert.equal(ok.g.history.at(-1).status,'completed');
 }
 // Draw Shot: the pot without backspin leaves the cue ball outside the ring
 const draw=skillDrillById('draw-shot');
 assert.equal(strike('draw-shot',{...draw.solution,spin:{x:0,y:0}}).g.drillOutcome,'failed','no backspin, no position');
 assert.equal(strike('draw-shot',{...draw.solution,spin:{x:0,y:-.4}}).g.history.at(-1).reason,'position');
 // Soft Touch: too hard and the 9 runs past the ring; potting it fails outright
 const touch=skillDrillById('soft-touch');
 assert.notEqual(strike('soft-touch',{...touch.solution,power:.5}).g.drillOutcome,'completed');
 // Ghost Ball Cut: a slightly wrong angle misses
 const cut=skillDrillById('ghost-cut');
 assert.notEqual(strike('ghost-cut',{...cut.solution,angle:cut.solution.angle+.08}).g.drillOutcome,'completed');
});
test('the grader needs final positions for position and speed skills',()=>{
 const shot={pots:[],potRecords:[],first:9,cushionBalls:[]};
 assert.equal(gradeSkillDrill('soft-touch',{shots:1,shot}).status,'continue','no end positions: nothing to judge');
 const end={cue:{x:0,y:0,pocketed:false},balls:{9:{x:850,y:250,pocketed:false}}};
 assert.equal(gradeSkillDrill('soft-touch',{shots:1,shot,end}).status,'completed');
 assert.equal(gradeSkillDrill('soft-touch',{shots:1,shot:{...shot,first:null},end}).status,'continue','the cue ball must have hit the 9');
});

const settleGame=g=>{let n=0;while(g.turnShot&&n++<12000)g.step();return n<12000;};
const finish=(drillId,angle,power,spin={x:0,y:0})=>{
 const events=[],g=new Game({kind:'drill',drillId,seed:31,onTurn:e=>events.push(e)});
 assert.ok(g.beginShot(angle,power,spin));assert.ok(settleGame(g));return {g,events};
};
test('every authored solution completes its drill AND is accepted by the live ledger (zone drills included)',()=>{
 for(const drill of EXTRA_DRILLS){
  if(drill.streak)continue;
  const {events}=finish(drill.id,drill.solution.angle,drill.solution.power,drill.solution.spin);
  const end=events.find(e=>e.type==='drill-end');
  assert.ok(end?.completed,`${drill.id} did not complete (${end?.reason})`);
  const recorded=recordLiveDrill(freshProgress(),{kind:'drill',source:'live',id:'t-'+drill.id,at:'2026-10-05T10:00:00.000Z',drillId:drill.id,completed:true,shots:end.shots,evidence:end.evidence});
  assert.ok(recorded.drills?.[drill.id],`${drill.id} was not recorded in the ledger`);
 }
});
test('safe hide: a pot, a missed ring and a clean safety are told apart',()=>{
 const drill=skillDrillById('safe-hide');
 const good=finish('safe-hide',drill.solution.angle,drill.solution.power);
 assert.equal(good.events.find(e=>e.type==='drill-end')?.reason,'safe');
 // too hard: the cue ball does not finish in the ring, so the drill asks for another try
 const hard=finish('safe-hide',drill.solution.angle,.8);
 assert.ok(hard.events.some(e=>e.type==='drill-continue'||e.type==='drill-end'&&!e.completed));
});
test('three straight needs three pots in a row, re-spotting the target each time',()=>{
 const drill=skillDrillById('three-straight'),events=[],g=new Game({kind:'drill',drillId:'three-straight',seed:31,onTurn:e=>events.push(e)});
 const spots=[];
 drill.solutions.forEach((angle,i)=>{
  spots.push({...g.sim.balls.find(b=>b.id===4)});
  assert.ok(g.beginShot(angle,drill.solution.power,{x:0,y:0}),`shot ${i+1}`);assert.ok(settleGame(g));
 });
 assert.deepEqual(events.filter(e=>e.type==='drill-streak').map(e=>e.made),[1,2]);
 const end=events.find(e=>e.type==='drill-end');assert.ok(end?.completed,end?.reason);assert.equal(end.shots,3);
 assert.notDeepEqual([spots[0].x,spots[0].y],[spots[1].x,spots[1].y],'the target moves between shots');
 const recorded=recordLiveDrill(freshProgress(),{kind:'drill',source:'live',id:'t-3',at:'2026-10-05T10:00:00.000Z',drillId:'three-straight',completed:true,shots:end.shots,evidence:end.evidence});
 assert.ok(recorded.drills['three-straight']);
 // the first pot alone never completes it
 const solo=new Game({kind:'drill',drillId:'three-straight',seed:31,onTurn:()=>{}});
 solo.beginShot(drill.solutions[0],drill.solution.power,{x:0,y:0});settleGame(solo);assert.equal(solo.over,false);
});
