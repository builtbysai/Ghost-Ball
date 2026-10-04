import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOfficialEight} from '../src/casual-rules.js';

const shot=(extra={})=>({first:3,pots:[],rail:true,groupAtStart:'open',potRecords:[],...extra});
const play=(s,groups=[null,null],breakShot=false)=>resolveOfficialEight({turn:0,breakShot,groups,shot:shot(s)});

test('a ball in the called pocket counts, assigns the table and keeps the turn',()=>{
 const r=play({pots:[3],potRecords:[{id:3,pocket:2}],call:2});
 assert.equal(r.type,'retain');assert.deepEqual(r.groups,['solids','stripes']);
});
test('a ball in any other pocket stays down but does not count or assign',()=>{
 const r=play({pots:[3],potRecords:[{id:3,pocket:4}],call:2});
 assert.equal(r.type,'turn');assert.deepEqual(r.groups,[null,null]);assert.equal(r.turn,1);assert.equal(r.foul,false);
});
test('a shot with no call is a safety: pots do not count, and it is not a foul',()=>{
 const r=play({pots:[3],potRecords:[{id:3,pocket:2}],call:-1});
 assert.equal(r.type,'turn');assert.equal(r.foul,false);
 assert.equal(play({pots:[],call:-1}).foul,false);
});
test('a safety must still obey the foul rules',()=>{
 assert.equal(play({first:null,call:-1}).reason,'no-contact');
 assert.equal(play({first:9,groupAtStart:'solids',call:-1},['solids','stripes']).reason,'wrong-ball-first');
 assert.equal(play({pots:[0],potRecords:[{id:0,pocket:1}],call:-1}).reason,'scratch');
 assert.equal(play({rail:false,pots:[],call:-1}).reason,'no-rail');
});
test('the 8 must drop in the called pocket after the group is cleared',()=>{
 const ok=play({first:8,groupAtStart:'eight',pots:[8],potRecords:[{id:8,pocket:5}],call:5},['solids','stripes']);
 assert.equal(ok.type,'end');assert.equal(ok.winner,0);
 const wrong=play({first:8,groupAtStart:'eight',pots:[8],potRecords:[{id:8,pocket:1}],call:5},['solids','stripes']);
 assert.equal(wrong.winner,1);assert.equal(wrong.reason,'wrong-pocket');
});
test('an illegal break hands the incoming player a choice instead of a foul',()=>{
 const weak=resolveOfficialEight({turn:0,breakShot:true,groups:[null,null],shot:shot({first:1,pots:[],railBalls:[1,2],groupAtStart:'open'})});
 assert.equal(weak.type,'break-choice');assert.equal(weak.turn,1);assert.equal(weak.breakShooter,0);assert.equal(weak.ballInHand,false);
 for(const good of [{pots:[4],potRecords:[{id:4,pocket:0}],railBalls:[]},{pots:[],railBalls:[1,2,3,4]}]){
  const r=resolveOfficialEight({turn:0,breakShot:true,groups:[null,null],shot:shot({first:1,groupAtStart:'open',...good})});
  assert.notEqual(r.type,'break-choice');
 }
 const scratch=resolveOfficialEight({turn:0,breakShot:true,groups:[null,null],shot:shot({first:1,pots:[0],railBalls:[]})});
 assert.equal(scratch.type,'foul','a scratch on the break is still a foul');
});

import {Game} from '../src/game.js';
import {resolveNineBall} from '../src/casual-rules.js';

const settle=g=>{let k=0;while(g.turnShot&&k++<12000)g.step();};
test('official games name a pocket on every shot after the break and refuse a missing call on the 8',()=>{
 const g=new Game({kind:'match',players:'local',official:true,seed:4});
 assert.equal(g.official,true);assert.equal(g.callsEveryShot,false,'the break itself needs no call');
 assert.ok(g.beginShot(0,.9));settle(g);
 if(g.pendingChoice)g.choose('accept');
 g.break=false;g.turn=0;g.ballInHand=false;
 assert.equal(g.callsEveryShot,true);
 assert.ok(g.beginShot(.2,.4,0,-1),'a safety is a legal declaration');
 assert.equal(g.history.at(-1).call,-1);
});
test('an illegal official break pauses the game for the incoming player, who can accept or re-rack',()=>{
 for(const option of ['accept','rerack']){
  const events=[];const g=new Game({kind:'match',players:'local',official:true,seed:9,onTurn:e=>events.push(e)});
  g.turnShot={first:1,pots:[],potRecords:[],railBalls:[1,2],rail:true,groupAtStart:'open'};
  g.resolve();
  assert.deepEqual(g.pendingChoice,{kind:'break',seat:1,other:0});
  assert.equal(events.at(-1).type,'choice');assert.equal(g.beginShot(0,.5,0,-1),false,'no shooting before answering');
  assert.equal(g.choose('nonsense'),false);
  assert.ok(g.choose(option));assert.equal(g.pendingChoice,null);
  if(option==='accept'){assert.equal(g.break,false);assert.equal(g.turn,1);}
  else{assert.equal(g.break,true);assert.equal(g.turn,1,'the player who asked for the re-rack breaks');assert.equal(g.shots,0);}
 }
});
test('the CPU answers a break choice by itself',()=>{
 const g=new Game({kind:'match',players:'cpu',official:true,seed:5});
 g.turnShot={first:1,pots:[],potRecords:[],railBalls:[1],rail:true,groupAtStart:'open'};g.resolve();
 assert.equal(g.turn,1);assert.ok(g.pendingChoice);
 for(let i=0;i<200&&g.pendingChoice;i++)g.update(1/30);
 assert.equal(g.pendingChoice,null,'the CPU chose');
});
test('nine-ball push-out: only a scratch fouls, the opponent shoots or passes, and it is offered once after a clean break',()=>{
 const base={turn:0,breakShot:false,pushOut:true};
 const r=resolveNineBall({...base,shot:{first:5,pots:[9],rail:false,groupAtStart:'low-1'}});
 assert.equal(r.type,'pushout');assert.equal(r.spotTop,true);assert.equal(r.foul,false);assert.equal(r.turn,1);
 assert.equal(resolveNineBall({...base,shot:{first:null,pots:[0],groupAtStart:'low-1'}}).type,'foul');
 const g=new Game({kind:'match',players:'local',ruleset:'nine',seed:14});
 g.turnShot={first:1,pots:[],potRecords:[],railBalls:[1,2,3,4],rail:true,groupAtStart:'low-1'};g.resolve();
 assert.equal(g.turn,1);assert.equal(g.pushOutAvailable,true,'the incoming player may push out once');
 assert.ok(g.beginShot(Math.PI,.2,0,null,{pushOut:true}));assert.equal(g.pushOutAvailable,false);settle(g);
 assert.equal(g.pendingChoice?.kind,'pushout');assert.equal(g.turn,0,'the original breaker now chooses');
 assert.ok(g.choose('pass'));assert.equal(g.turn,1,'passing hands the shot back to the pusher');
 // and an ordinary shot after the break never offers it again
 const h=new Game({kind:'match',players:'local',ruleset:'nine',seed:15});
 h.turnShot={first:1,pots:[],potRecords:[],railBalls:[1,2,3,4],rail:true,groupAtStart:'low-1'};h.resolve();
 h.beginShot(.2,.3);settle(h);assert.equal(h.pushOutAvailable,false);
});

import {planBreak} from '../src/ai.js';
test('the CPU plans a legal break for every rack',()=>{
 for(const ruleset of ['eight','nine','ten'])for(const seed of [1,2,3]){
  const g=new Game({kind:'match',players:'local',official:ruleset==='eight',ruleset,seed});
  const it=planBreak(g.sim,{power:ruleset==='eight'?.95:1});let r;while(!(r=it.next()).done);
  assert.ok(g.beginShot(r.value.angle,r.value.power));settle(g);
  const last=g.history.filter(h=>h.kind==='ruling').at(-1);
  assert.notEqual(last.result==='break-choice'||last.reason==='illegal-break',true,`${ruleset} seed ${seed} break was illegal`);
 }
});
