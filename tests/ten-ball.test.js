import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveNineBall,lowestGroup} from '../src/casual-rules.js';
import {rackTen,TABLE} from '../src/physics.js';
import {Game} from '../src/game.js';
import {runRack} from '../scripts/full-rack-lab.mjs';

const ten=(shot,extra={})=>resolveNineBall({turn:0,breakShot:false,topBall:10,callTop:true,
 shot:{first:10,pots:[],rail:true,groupAtStart:'low-10',...shot},...extra});

test('the ten-ball rack is a triangle of ten with the 1 at the apex and the 10 in the middle',()=>{
 const balls=rackTen(3);
 assert.deepEqual(balls.map(b=>b.id).sort((a,b)=>a-b),[0,1,2,3,4,5,6,7,8,9,10]);
 const apex=balls.find(b=>b.id===1),t=balls.find(b=>b.id===10);
 assert.equal(Math.min(...balls.filter(b=>b.id>0).map(b=>b.x)),apex.x);
 assert.ok(Math.abs(t.y-250)<1e-9);
 for(const a of balls)for(const b of balls)if(a.id<b.id)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=TABLE.radius*2);
 assert.equal(lowestGroup([0,10],10),'low-10');
 assert.equal(lowestGroup([0],10),'low-10');
});
test('the 10 wins only as the last ball, in the called pocket',()=>{
 const win=ten({pots:[10],potRecords:[{id:10,pocket:2}],call:2});
 assert.equal(win.type,'end');assert.equal(win.winner,0);assert.equal(win.reason,'ten-potted');
 const wrong=ten({pots:[10],potRecords:[{id:10,pocket:4}],call:2});
 assert.equal(wrong.type,'turn');assert.equal(wrong.spotTop,true,'an uncalled 10 goes back on the table');
 assert.equal(wrong.turn,1);
 const early=resolveNineBall({turn:0,breakShot:false,topBall:10,callTop:true,
  shot:{first:3,pots:[10],potRecords:[{id:10,pocket:2}],call:2,rail:true,groupAtStart:'low-3'}});
 assert.equal(early.type,'turn');assert.equal(early.spotTop,true,'a 10 potted early by a combination does not win');
 const brk=resolveNineBall({turn:0,breakShot:true,topBall:10,callTop:true,
  shot:{first:1,pots:[10],potRecords:[{id:10,pocket:1}],rail:true,groupAtStart:'low-1',railBalls:[]}});
 assert.equal(brk.type,'turn');assert.equal(brk.spotTop,true,'a 10 on the break is spotted');
});
test('a foul on the last ball spots it and gives ball in hand',()=>{
 const foul=ten({first:10,pots:[0,10],potRecords:[{id:10,pocket:2}],call:2});
 assert.equal(foul.type,'foul');assert.equal(foul.reason,'scratch');assert.equal(foul.spotTop,true);assert.equal(foul.ballInHand,true);
});
test('a ten-ball game needs a call only for the last ball and after the break',()=>{
 const g=new Game({kind:'match',players:'local',ruleset:'ten',seed:8});
 assert.equal(g.ruleset,'ten');assert.equal(g.topBall,10);assert.equal(g.sim.balls.length,11);
 assert.equal(g.needsCall(),false,'never on the break');
 g.break=false;g.sim.balls.forEach(b=>{if(b.id>0&&b.id<10)b.pocketed=true;});
 assert.equal(g.group,'low-10');assert.equal(g.needsCall(),true);
 assert.equal(g.beginShot(.1,.4),false,'an uncalled last-ball shot is refused');
 assert.equal(g.beginShot(.1,.4,0,3),true);
 const nine=new Game({kind:'match',players:'local',ruleset:'nine',seed:8});
 assert.equal(nine.needsCall(),false);assert.equal(nine.topBall,9);
});
test('CPU players clear ten-ball racks, calling the last ball',()=>{
 let finished=0;
 for(const seed of [11,23,37,59]){
  const run=runRack(seed,{maxShots:160,tiers:['rookie','club'],ruleset:'ten'});
  if(run.finished){finished++;assert.ok(['ten-potted','three-fouls'].includes(run.terminalReason),run.terminalReason);}
  assert.deepEqual(run.stagnant,[]);
 }
 assert.ok(finished>=3,`only ${finished}/4 ten-ball racks finished`);
});
