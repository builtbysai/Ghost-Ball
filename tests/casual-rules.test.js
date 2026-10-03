import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCasualEight,groupContains} from '../src/casual-rules.js';
import {Simulation,makeBall} from '../src/physics.js';
import {Game} from '../src/game.js';

const outcome=(shot,opts={})=>resolveCasualEight({
 turn:opts.turn??0,breakShot:opts.breakShot??false,
 groups:opts.groups??[null,null],
 shot:{first:shot.first??null,pots:shot.pots??[],rail:shot.rail??false,
       groupAtStart:opts.groupAtStart??'open'}
});
test('open-table first legal pot assigns groups without mutating input',()=>{
 const groups=[null,null],out=outcome({first:2,pots:[9,2],rail:true},{groups});
 assert.deepEqual(groups,[null,null]);
 assert.deepEqual(out.groups,['stripes','solids']);
 assert.equal(out.type,'retain');
 assert.equal(out.turn,0);
 assert.equal(groupContains(8,'open'),false);
});
test('a legal final group pocket retains the shooter even though eight is next',()=>{
 const out=outcome({first:7,pots:[7],rail:true},{
   groups:['solids','stripes'],groupAtStart:'solids'});
 assert.equal(out.type,'retain');
 assert.equal(out.foul,false);
});
test('pocketing last group ball and eight in same shot is not a valid win',()=>{
 const out=outcome({first:7,pots:[7,8],rail:true},{
   groups:['solids','stripes'],groupAtStart:'solids'});
 assert.equal(out.type,'end');
 assert.equal(out.winner,1);
 assert.equal(out.reason,'early-eight');
});
test('legal eight pocket from pre-shot eight group wins',()=>{
 const out=outcome({first:8,pots:[8],rail:true},{
   groups:['solids','stripes'],groupAtStart:'eight'});
 assert.equal(out.type,'end');assert.equal(out.winner,0);assert.equal(out.legal,true);
});
test('scratch while legally sinking eight loses rack',()=>{
 const out=outcome({first:8,pots:[0,8],rail:true},{
   groups:['solids','stripes'],groupAtStart:'eight'});
 assert.equal(out.type,'end');assert.equal(out.winner,1);
 assert.equal(out.reason,'scratch-on-eight');
});
test('wrong group first is a foul even if your ball goes in',()=>{
 const out=outcome({first:11,pots:[4],rail:true},{
   groups:['solids','stripes'],groupAtStart:'solids'});
 assert.equal(out.reason,'wrong-ball-first');
 assert.equal(out.turn,1);assert.equal(out.ballInHand,true);
});
test('missed contact is a ball-in-hand foul',()=>{
 const out=outcome({first:null,pots:[],rail:true},{
   groups:['solids','stripes'],groupAtStart:'solids'});
 assert.equal(out.reason,'no-contact');assert.equal(out.type,'foul');
});
test('a rail after first contact prevents no-rail foul',()=>{
 const state={groups:['solids','stripes'],groupAtStart:'solids'};
 const foul=outcome({first:2,pots:[],rail:false},state);
 const turn=outcome({first:2,pots:[],rail:true},state);
 assert.equal(foul.reason,'no-rail');
 assert.equal(turn.type,'turn');assert.equal(turn.ballInHand,false);
});
test('opponent ball pocket is allowed but does not retain shooter',()=>{
 const out=outcome({first:2,pots:[9],rail:true},{
   groups:['solids','stripes'],groupAtStart:'solids'});
 assert.equal(out.type,'turn');assert.equal(out.foul,false);assert.equal(out.turn,1);
});
test('8 on casual break re-spots instead of awarding an early win',()=>{
 const out=outcome({first:1,pots:[8,2],rail:true},{breakShot:true});
 assert.equal(out.type,'retain');assert.equal(out.spotEight,true);
 assert.deepEqual(out.groups,[null,null]);
});
test('break scratches transfer cue ball in hand with eight re-spot',()=>{
 const out=outcome({first:2,pots:[8,0],rail:true},{breakShot:true});
 assert.equal(out.type,'foul');assert.equal(out.spotEight,true);
 assert.equal(out.ballInHand,true);
});
test('a whiffed break now emits a clear no-contact foul',()=>{
 const out=outcome({first:null,pots:[],rail:false},{breakShot:true});
 assert.equal(out.reason,'no-contact');assert.equal(out.type,'foul');
});
test('recorded shot group captures BEFORE balls are pocketed',()=>{
 const g=new Game({kind:'match',players:'local',seed:17});
 g.break=false;g.groups=['solids','stripes'];
 g.sim=new Simulation([makeBall(0,240,250),makeBall(7,460,250),makeBall(8,760,250)]);
 assert.equal(g.beginShot(0,.33),true);
 assert.equal(g.turnShot.groupAtStart,'solids');
 g.sim.balls.find(b=>b.id===7).pocketed=true;
 g.sim.balls.find(b=>b.id===8).pocketed=true;
 g.turnShot.first=7;g.turnShot.pots=[7,8];g.turnShot.rail=true;
 g.resolve();
 assert.equal(g.over,true);assert.equal(g.winner,1);
 assert.equal(g.history.length,1);
});
test('foul notifications expose the actual reason to UI',()=>{
 let events=[];const g=new Game({kind:'match',players:'local',seed:3,onTurn:e=>events.push(e)});
 g.break=false;g.groups=['solids','stripes'];
 g.turnShot={first:9,pots:[],rail:true,groupAtStart:'solids'};
 g.resolve();
 assert.deepEqual(events,[{type:'foul',turn:1,ballInHand:true,reason:'wrong-ball-first'}]);
 assert.equal(g.ballInHand,true);
});
