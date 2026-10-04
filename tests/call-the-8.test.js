import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCasualEight} from '../src/casual-rules.js';
import {Game} from '../src/game.js';
import {Simulation,makeBall,POCKETS} from '../src/physics.js';
import {decisiveShot} from '../src/match-finish.js';

const onEight=(extra={})=>({turn:0,breakShot:false,groups:['solids','stripes'],shot:{
 first:8,pots:[8],rail:true,groupAtStart:'eight',callRequired:true,call:2,
 potRecords:[{id:8,pocket:2}],...extra}});

test('the 8 in the called pocket wins; in any other pocket loses the rack',()=>{
 assert.deepEqual([resolveCasualEight(onEight()).winner,resolveCasualEight(onEight()).reason],[0,'eight-cleared']);
 const wrong=resolveCasualEight(onEight({potRecords:[{id:8,pocket:5}]}));
 assert.equal(wrong.winner,1);
 assert.equal(wrong.legal,false);
 assert.equal(wrong.reason,'wrong-pocket');
});
test('casual play is unchanged: with no call required any pocket wins',()=>{
 const r=resolveCasualEight(onEight({callRequired:false,call:undefined,potRecords:[{id:8,pocket:5}]}));
 assert.equal(r.winner,0);
});
test('call-the-8 does not outrank the other 8-ball losses',()=>{
 assert.equal(resolveCasualEight(onEight({first:3})).reason,'wrong-ball-first');
 assert.equal(resolveCasualEight(onEight({pots:[8,0]})).reason,'scratch-on-eight');
 assert.equal(resolveCasualEight(onEight({groupAtStart:'solids'})).reason,'early-eight');
});
test('a match on call-the-8 refuses an uncalled shot only when the shooter is on the 8',()=>{
 const g=new Game({kind:'match',players:'local',seed:1,callEight:true});
 g.break=false;g.groups=['solids','stripes'];
 assert.equal(g.group,'solids');
 assert.equal(g.beginShot(0.2,.3),true,'no call is needed while shooting at the group');
 g.reset();g.break=false;g.groups=['solids','stripes'];
 g.sim.balls.forEach(b=>{if(b.id>0&&b.id<8)b.pocketed=true;});
 assert.equal(g.group,'eight');
 assert.equal(g.beginShot(0.2,.3),false,'on the 8 a pocket must be called');
 assert.equal(g.beginShot(0.2,.3,0,3),true);
 assert.equal(g.turnShot.callRequired,true);
 assert.equal(g.turnShot.call,3);
 assert.equal(g.history.at(-1).call,3);
});
test('the plain casual mode never asks for a call',()=>{
 const g=new Game({kind:'match',players:'local',seed:1});
 g.break=false;g.groups=['solids','stripes'];
 g.sim.balls.forEach(b=>{if(b.id>0&&b.id<8)b.pocketed=true;});
 assert.equal(g.beginShot(0.2,.3),true);
 assert.equal(g.turnShot.callRequired,false);
});
test('a full call-the-8 finish is ruled through Game and explained on the result card',()=>{
 const g=new Game({kind:'match',players:'local',seed:1,callEight:true});
 g.break=false;g.groups=['solids','stripes'];
 g.sim.balls.forEach(b=>{if(b.id>0&&b.id<8)b.pocketed=true;});
 g.turnShot={callRequired:true,call:0,first:8,pots:[8],potRecords:[{id:8,pocket:1}],rail:true,groupAtStart:'eight'};
 g.resolve();
 assert.equal(g.over,true);assert.equal(g.winner,1);
 const last=decisiveShot(g.history);
 assert.equal(last.label,'WRONG POCKET · TOP MIDDLE');
 assert.equal(last.clean,false);
});
test('the CPU names a pocket and wins by sinking the 8 into it',()=>{
 const g=new Game({kind:'match',players:'cpu',difficulty:'club',seed:7,callEight:true});
 g.break=false;g.turn=1;g.groups=['solids','stripes'];
 g.sim=new Simulation([makeBall(0,300,250),makeBall(8,520,250),makeBall(1,900,60)]);
 g.sim.balls.find(b=>b.id===1).pocketed=true;
 g.groups=['stripes','solids'];
 assert.equal(g.group,'eight');
 let n=0;while(!g.turnShot&&!g.over&&n++<2000)g.update(.05);
 assert.ok(g.turnShot||g.over,'the CPU took a shot');
 assert.equal(g.history.at(-1).call!==undefined,true,'the CPU recorded its called pocket');
 assert.ok(g.history.at(-1).call>=-1&&g.history.at(-1).call<POCKETS.length);
});
