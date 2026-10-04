import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,HEAD_STRING} from '../src/game.js';
import {Simulation,makeBall} from '../src/physics.js';
import {chooseAiCuePlacement} from '../src/ai.js';
import {cuePlacementDraft,initialCuePlacement} from '../src/placement-guide.js';

const breakShot=pots=>({first:1,pots,rail:true,potRecords:pots.map(id=>({id,pocket:0})),groupAtStart:'open'});

test('a scratch on the break gives ball in hand behind the head string only',()=>{
 const events=[];
 const g=new Game({kind:'match',players:'local',seed:3,onTurn:e=>events.push(e)});
 g.turnShot=breakShot([0]);g.resolve();
 assert.equal(g.ballInHand,true);
 assert.equal(g.kitchen,true);
 assert.equal(events[0].kitchen,true);
 assert.equal(g.placeCue(HEAD_STRING+40,250),false,'the foot of the table is off limits');
 assert.equal(g.ballInHand,true,'a rejected drop keeps ball in hand');
 assert.equal(g.placeCue(HEAD_STRING-40,250),true);
 assert.equal(g.kitchen,false,'once placed the restriction is spent');
});
test('a scratch after the break gives ball in hand anywhere',()=>{
 const g=new Game({kind:'match',players:'local',seed:3});
 g.break=false;g.groups=['solids','stripes'];
 g.turnShot={first:2,pots:[0],potRecords:[],rail:true,groupAtStart:'solids'};g.resolve();
 assert.equal(g.ballInHand,true);
 assert.equal(g.kitchen,false);
 assert.equal(g.placeCue(500,250),true);
});
test('a non-scratch foul on the break is not restricted to the kitchen',()=>{
 const g=new Game({kind:'match',players:'local',seed:3});
 g.turnShot={first:null,pots:[],potRecords:[],rail:false,groupAtStart:'open'};g.resolve();
 assert.equal(g.ballInHand,true);
 assert.equal(g.kitchen,false);
});
test('the CPU places behind the head string after a break scratch',()=>{
 const g=new Game({kind:'match',players:'cpu',seed:5});
 g.turnShot=breakShot([0]);g.resolve();
 assert.equal(g.turn,1);assert.equal(g.kitchen,true);
 g.update(2);
 assert.equal(g.ballInHand,false);
 assert.ok(g.sim.cue().x<=HEAD_STRING,`CPU dropped at x=${g.sim.cue().x}`);
});
test('placement guides keep every draft behind the line when asked',()=>{
 const sim=new Simulation([makeBall(0,500,250),makeBall(1,700,250)]);
 const draft=cuePlacementDraft(sim,290,250,{breakOnly:true});
 assert.equal(draft.legal,false);
 assert.ok(draft.candidate.x<=HEAD_STRING,'a near miss snaps back behind the line');
 assert.equal(cuePlacementDraft(sim,600,250,{breakOnly:true}).candidate,null,'a far drop is never teleported');
 assert.ok(initialCuePlacement(sim,{breakOnly:true}).candidate.x<=HEAD_STRING);
 const spot=chooseAiCuePlacement(sim,'solids','club',{kitchen:true});
 assert.ok(spot.x<=HEAD_STRING);
});
