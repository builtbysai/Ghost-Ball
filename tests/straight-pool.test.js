import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStraightPool,groupContains} from '../src/casual-rules.js';

const shot=(extra={})=>({first:3,pots:[],rail:true,potRecords:[],call:2,...extra});
const play=(s,opts={})=>resolveStraightPool({turn:0,breakShot:false,shot:shot(s),...opts});

test('every ball is a legal target in straight pool',()=>{
 for(const id of [1,7,8,9,15])assert.equal(groupContains(id,'any'),true);
 assert.equal(groupContains(0,'any'),false);
});
test('balls in the called pocket score a point each and keep the turn',()=>{
 const r=play({pots:[3,5],potRecords:[{id:3,pocket:2},{id:5,pocket:2}]});
 assert.equal(r.type,'retain');assert.equal(r.points,2);assert.deepEqual(r.counted,[3,5]);assert.equal(r.turn,0);
});
test('a ball in another pocket scores nothing and ends the turn without a foul',()=>{
 const r=play({pots:[3],potRecords:[{id:3,pocket:4}]});
 assert.equal(r.type,'turn');assert.equal(r.points,0);assert.equal(r.foul,false);assert.equal(r.turn,1);
});
test('a safety (negative call) scores nothing but is legal',()=>{
 const r=play({pots:[3],potRecords:[{id:3,pocket:2}],call:-1});
 assert.equal(r.type,'turn');assert.equal(r.foul,false);
});
test('fouls cost a point and give ball in hand; the third in a row costs sixteen',()=>{
 for(const [s,reason] of [[{pots:[0],potRecords:[{id:0,pocket:1}]},'scratch'],[{first:null},'no-contact'],[{rail:false},'no-rail']]){
  const r=play(s);assert.equal(r.type,'foul');assert.equal(r.reason,reason);assert.equal(r.points,-1);assert.equal(r.ballInHand,true);assert.equal(r.turn,1);
 }
 const third=play({first:null},{priorFouls:2});assert.equal(third.points,-16);assert.equal(third.threeFouls,true);
});
test('the opening shot scores what it pots and only a scratch is a foul',()=>{
 const brk=resolveStraightPool({turn:0,breakShot:true,shot:{first:1,pots:[4,9],potRecords:[],rail:false}});
 assert.equal(brk.type,'retain');assert.equal(brk.points,2);
 assert.equal(resolveStraightPool({turn:0,breakShot:true,shot:{first:1,pots:[],rail:false}}).foul,false);
 assert.equal(resolveStraightPool({turn:0,breakShot:true,shot:{first:1,pots:[0],rail:false}}).foul,true);
});

import {rack,reRackStraight,TABLE} from '../src/physics.js';
test('a straight-pool re-rack returns the pocketed balls without overlap and keeps the survivor where it is',()=>{
 const balls=rack(3);
 for(const b of balls)if(b.id>0&&b.id!==9)b.pocketed=true;
 const survivor=balls.find(b=>b.id===9);survivor.x=560;survivor.y=130;
 assert.equal(reRackStraight(balls),14);
 assert.deepEqual([survivor.x,survivor.y],[560,130]);
 const live=balls.filter(b=>!b.pocketed&&b.id>0);assert.equal(live.length,15);
 for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++)
  assert.ok(Math.hypot(live[i].x-live[j].x,live[i].y-live[j].y)>=TABLE.radius*2-.01,'no overlap');
 // a survivor sitting in the rack area blocks its slot and the other 14 still fit around it
 const again=rack(4);for(const b of again)if(b.id>0&&b.id!==5)b.pocketed=true;
 const blocker=again.find(b=>b.id===5);blocker.x=760;blocker.y=250;
 assert.equal(reRackStraight(again),14);
 const all=again.filter(b=>b.id>0&&!b.pocketed);
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)assert.ok(Math.hypot(all[i].x-all[j].x,all[i].y-all[j].y)>=TABLE.radius*2-.01);
});

import {Game} from '../src/game.js';
import {chooseShot,chooseAiCuePlacement} from '../src/ai.js';
import {PERSONAS} from '../src/ai-personas.js';
const settle=g=>{let k=0;while(g.turnShot&&k++<12000)g.step();};
test('CPU players race a straight-pool rack to the target, re-racking along the way',()=>{
 let finished=0,reracks=0;
 for(const seed of [2,5,9]){
  const g=new Game({kind:'match',players:'local',ruleset:'straight',target:18,seed,onTurn:e=>{if(e.reracked)reracks++;}});
  for(let n=0;n<420&&!g.over;n++){
   const persona=PERSONAS[['club','rookie'][g.turn]];
   if(g.ballInHand){const p=chooseAiCuePlacement(g.sim,g.group,persona.tier,{kitchen:false});if(p)g.placeCue(p.x,p.y);}
   const plan=g.break?{angle:0,power:.9}:chooseShot(g.sim,g.group,persona.tier,g.random,{persona});
   assert.ok(g.beginShot(plan.angle,plan.power,0,plan.pocket??-1),'the CPU names a pocket or a safety every shot');
   settle(g);
  }
  if(g.over){finished++;assert.ok(g.points[g.winner]>=18);assert.equal(g.history.at(-1).result.length>0,true);}
 }
 assert.ok(finished>=2,`only ${finished}/3 straight-pool races finished`);
});
test('the final ball of a straight-pool rack triggers a 14-ball re-rack and play continues',()=>{
 const events=[];
 const g=new Game({kind:'match',players:'local',ruleset:'straight',target:99,seed:3,onTurn:e=>events.push(e)});
 g.break=false;
 for(const b of g.sim.balls)if(b.id>1)b.pocketed=true;     // only the 1 is left
 const one=g.sim.balls.find(b=>b.id===1);one.x=600;one.y=300;
 g.turnShot={first:1,pots:[1],potRecords:[{id:1,pocket:2}],rail:true,call:2,groupAtStart:'any'};
 g.resolve();
 assert.equal(g.points[0],1);assert.equal(g.turn,0,'the shooter keeps the table');
 assert.equal(g.sim.balls.filter(b=>b.id>0&&!b.pocketed).length,15,'all fifteen are back on the table');
 assert.equal(events.at(-1).reracked,true);
});
