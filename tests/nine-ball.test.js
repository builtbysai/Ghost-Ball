import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveNineBall,groupContains,lowestGroup} from '../src/casual-rules.js';
import {rackNine,TABLE,Simulation,makeBall} from '../src/physics.js';
import {Game} from '../src/game.js';
import {runRack} from '../scripts/full-rack-lab.mjs';
import {candidateShots} from '../src/ai.js';

const shot=(extra={})=>({first:1,pots:[],rail:true,groupAtStart:'low-1',...extra});
const rule=(s,breakShot=false)=>resolveNineBall({turn:0,breakShot,shot:shot(s)});

test('the nine-ball rack is a diamond with the 1 at the apex and the 9 in the middle',()=>{
 const balls=rackNine(4);
 assert.equal(balls.length,10);
 assert.deepEqual(balls.map(b=>b.id).sort((a,b)=>a-b),[0,1,2,3,4,5,6,7,8,9]);
 const apex=balls.find(b=>b.id===1),nine=balls.find(b=>b.id===9);
 assert.equal(Math.min(...balls.filter(b=>b.id>0).map(b=>b.x)),apex.x);
 assert.ok(Math.abs(nine.y-250)<1e-9,'the 9 is on the centre line');
 assert.ok(nine.x>apex.x&&nine.x<Math.max(...balls.map(b=>b.x)),'the 9 sits in the middle row');
 for(const a of balls)for(const b of balls)if(a.id<b.id)
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=TABLE.radius*2,'racked balls do not overlap');
 assert.deepEqual(rackNine(4).map(b=>[b.id,b.x,b.y]),balls.map(b=>[b.id,b.x,b.y]),'a seed always yields the same rack');
 assert.notDeepEqual(rackNine(5).map(b=>b.id),balls.map(b=>b.id),'different seeds shuffle the other balls');
});
test('only the lowest ball on the table is a legal first contact',()=>{
 assert.equal(lowestGroup([0,3,5,9]),'low-3');
 assert.equal(groupContains(3,'low-3'),true);
 assert.equal(groupContains(5,'low-3'),false);
 assert.equal(rule({first:2,groupAtStart:'low-1'}).reason,'wrong-ball-first');
 assert.equal(rule({first:null}).reason,'no-contact');
 assert.equal(rule({pots:[0]}).reason,'scratch');
 assert.equal(rule({rail:false}).reason,'no-rail');
});
test('potting any ball legally keeps the turn; missing passes it; a foul gives ball in hand',()=>{
 const keep=rule({pots:[1]});assert.equal(keep.type,'retain');assert.equal(keep.turn,0);
 const miss=rule({});assert.equal(miss.type,'turn');assert.equal(miss.turn,1);
 const foul=rule({first:3});assert.equal(foul.type,'foul');assert.equal(foul.turn,1);assert.equal(foul.ballInHand,true);
 assert.equal(rule({rail:false,pots:[2]}).type,'retain','a pot satisfies the rail requirement');
});
test('the 9 wins when potted legally, even on the break or by combination',()=>{
 assert.deepEqual([rule({pots:[9]}).type,rule({pots:[9]}).winner],['end',0]);
 assert.equal(rule({pots:[3,9]},true).type,'end');
 const spot=rule({pots:[9],first:2});
 assert.equal(spot.type,'foul');assert.equal(spot.spotNine,true,'a 9 potted on a foul is re-spotted');
 assert.equal(rule({pots:[9,0]}).spotNine,true,'scratching with the 9 re-spots it');
 assert.equal(rule({pots:[9,0]}).type,'foul');
});
test('Game runs nine-ball: lowest ball first, spotting the 9 and a rack that ends on a legal 9',()=>{
 const events=[];
 const g=new Game({kind:'match',players:'local',seed:3,ruleset:'nine',onTurn:e=>events.push(e)});
 assert.equal(g.ruleset,'nine');assert.equal(g.group,'low-1');assert.equal(g.sim.balls.length,10);
 g.break=false;
 // Foul: hits the 2 while the 1 is on the table, and the 9 goes down.
 g.turnShot={first:2,pots:[9],potRecords:[{id:9,pocket:1}],rail:true,groupAtStart:'low-1'};
 g.sim.balls.find(b=>b.id===9).pocketed=true;
 g.resolve();
 assert.equal(g.ballInHand,true);assert.equal(g.turn,1);
 assert.equal(g.sim.balls.find(b=>b.id===9).pocketed,false,'the 9 comes back to the table');
 assert.equal(g.over,false);assert.equal(events.at(-1).spotted,true);
 // Win: pot every ball but the 9, then the 9.
 g.ballInHand=false;g.sim.balls.forEach(b=>{if(b.id>0&&b.id<9)b.pocketed=true;});
 assert.equal(g.group,'low-9');
 g.turnShot={first:9,pots:[9],potRecords:[{id:9,pocket:2}],rail:true,groupAtStart:'low-9'};
 g.resolve();
 assert.equal(g.over,true);assert.equal(g.winner,1);
 assert.equal(g.history.at(-1).reason,'nine-potted');
});
test('the call-the-8 option never applies to nine-ball',()=>{
 const g=new Game({kind:'match',players:'local',seed:1,ruleset:'nine',callEight:true});
 assert.equal(g.callEight,false);
 assert.equal(g.beginShot(.1,.4),true);
});
test('the geometry planner targets only the lowest ball',()=>{
 const sim=new Simulation([makeBall(0,250,250),makeBall(2,500,250),makeBall(3,600,120),makeBall(9,700,380)]);
 const shots=candidateShots(sim,lowestGroup([2,3,9]));
 assert.ok(shots.length>0&&shots.every(s=>s.target===2));
});
test('the CPU can play whole nine-ball racks to a legal finish',()=>{
 let finished=0;
 for(const seed of [1,2,3]){
  const run=runRack(seed,{maxShots:140,tiers:['rookie','rookie'],ruleset:'nine'});
  if(run.finished){finished++;assert.equal(run.terminalReason,'nine-potted');}
  assert.deepEqual(run.stagnant,[]);
 }
 assert.ok(finished>=2,`only ${finished}/3 nine-ball racks finished`);
});

test('a break must pot a ball or drive four object balls to a cushion',()=>{
 const base={turn:0,breakShot:true};
 const weak=resolveNineBall({...base,shot:{first:1,pots:[],rail:true,railBalls:[1,2],groupAtStart:'low-1'}});
 assert.equal(weak.type,'foul');assert.equal(weak.reason,'illegal-break');assert.equal(weak.ballInHand,true);
 assert.equal(resolveNineBall({...base,shot:{first:1,pots:[],rail:true,railBalls:[1,2,3,4],groupAtStart:'low-1'}}).foul,false);
 assert.equal(resolveNineBall({...base,shot:{first:1,pots:[3],rail:true,railBalls:[],groupAtStart:'low-1'}}).foul,false);
 assert.equal(resolveNineBall({turn:0,breakShot:false,shot:{first:1,pots:[],rail:true,railBalls:[],groupAtStart:'low-1'}}).foul,false,'the rule applies to the break only');
});
test('three fouls in a row lose the rack',()=>{
 const foulShot={first:2,pots:[],rail:true,groupAtStart:'low-1'};
 assert.equal(resolveNineBall({turn:0,breakShot:false,shot:foulShot,priorFouls:1}).type,'foul');
 const loss=resolveNineBall({turn:0,breakShot:false,shot:foulShot,priorFouls:2});
 assert.equal(loss.type,'end');assert.equal(loss.winner,1);assert.equal(loss.reason,'three-fouls');
});
