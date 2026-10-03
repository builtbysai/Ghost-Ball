import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,makeBall} from '../src/physics.js';
import {createRandom} from '../src/random.js';
import {candidateShots,chooseShot,previewShot,assessShot,chooseAiCuePlacement,createShotPlanner} from '../src/ai.js';
import {Game} from '../src/game.js';

function sparse(){
 return new Simulation([
  makeBall(0,240,250),makeBall(1,480,210),
  makeBall(2,660,340),makeBall(9,350,380),makeBall(8,830,250)
 ]);
}
test('candidates filter to the shooter group and encode a real target pocket',()=>{
 const sim=sparse();
 const solid=candidateShots(sim,'solids');
 assert.ok(solid.length>0,'at least one clean solid pocket should exist');
 assert.ok(solid.every(c=>c.target===1||c.target===2));
 assert.ok(solid.every(c=>c.pocket>=0&&c.pocket<=5&&c.power>=.2&&c.power<=.9));
 const eight=candidateShots(sim,'eight');
 assert.ok(eight.every(c=>c.target===8));
 assert.ok(eight.every(c=>Number.isFinite(c.angle)&&Number.isFinite(c.cost)));
});
test('Rookie and Club Pro plan differently without changing shared ball physics',()=>{
 const sim=sparse(),before=sim.snapshot();
 const rookie=chooseShot(sim,'solids','rookie',createRandom(10));
 const club=chooseShot(sim,'solids','club',createRandom(10));
 assert.equal(rookie.plan,'geometry');assert.equal(club.plan,'preview');
 assert.ok([1,2].includes(rookie.target));assert.ok([1,2].includes(club.target));
 assert.ok(Number.isFinite(club.angle)&&club.power>=.2&&club.power<=.9);
 assert.deepEqual(sim.snapshot(),before,'planning is read-only, not a physics handicap');
});
test('Club Pro candidate search and preview remain seed-repeatable',()=>{
 const sim=sparse(),a=chooseShot(sim,'solids','club',createRandom(50));
 const b=chooseShot(sim,'solids','club',createRandom(50));
 assert.deepEqual(a,b);
 const candidate=candidateShots(sim,'solids')[0];
 assert.equal(previewShot(sim,candidate,'solids'),previewShot(sim,candidate,'solids'));
});
test('safe contact fallback chooses first legal group and remains bounded',()=>{
 const sim=new Simulation([makeBall(0,230,250),makeBall(8,500,300)]);
 const club=chooseShot(sim,'eight','club',createRandom(2));
 assert.ok(club.target===8);
 assert.ok(Number.isFinite(club.angle)&&club.power>=0&&club.power<=1);
 const noTarget=chooseShot(new Simulation([makeBall(0,200,200)]),'eight','rookie');
 assert.equal(noTarget.plan,'none');
});
test('match and exhibition retain their seeded opponent choices',()=>{
 const a=new Game({kind:'attract',seed:50}),b=new Game({kind:'attract',seed:50});
 a.update(.08);b.update(.08);
 assert.deepEqual(a.previewShot,b.previewShot);
 assert.ok(Number.isFinite(a.previewShot.angle));
});

test('physics previews penalize wrong first contact even when a solid is on the path',()=>{
 const sim=new Simulation([makeBall(0,200,250),makeBall(9,355,250),makeBall(1,500,250)]);
 const snapshot=sim.snapshot();
 const verdict=assessShot(sim,{angle:0,power:.48,target:1,pocket:2,cost:30},'solids');
 assert.equal(verdict.first,9);
 assert.equal(verdict.legalFirst,false);
 assert.equal(verdict.foul,true);
 assert.ok(verdict.score<0);
 assert.deepEqual(sim.snapshot(),snapshot,'a prediction must never strike the actual game table');
});
test('physics previews detect a legal first hit separately from pocket predictions',()=>{
 const sim=new Simulation([makeBall(0,200,250),makeBall(1,450,250)]);
 const shot={angle:0,power:.45,target:1,pocket:2,cost:50};
 const verdict=assessShot(sim,shot,'solids');
 assert.equal(verdict.first,1);
 assert.equal(verdict.legalFirst,true);
 assert.equal(verdict.score,previewShot(sim,shot,'solids'));
});
test('physics previews detect an early eight and account for scratch risk',()=>{
 const eight=new Simulation([makeBall(0,200,250),makeBall(8,420,250),makeBall(1,800,350)]);
 const early=assessShot(eight,{angle:0,power:.4,target:1,pocket:0,cost:50},'solids');
 assert.equal(early.first,8);
 assert.equal(early.earlyEight,false,'early 8 means pocketed, not merely first contact');
 assert.equal(early.legalFirst,false);
 const scratch=new Simulation([makeBall(0,58,58),makeBall(1,700,200)]);
 const pocket=assessShot(scratch,{angle:-Math.PI*.75,power:.4,target:1,pocket:0,cost:40},'open');
 assert.equal(pocket.scratch,true);
 assert.equal(pocket.foul,true);
});

test('AI placement searches legal real cloth without moving any game ball',()=>{
 const sim=sparse(),cue=sim.cue();
 cue.pocketed=true;
 const snapshot=sim.snapshot();
 const spot=chooseAiCuePlacement(sim,'solids','club');
 assert.ok(spot&&Number.isFinite(spot.x)&&Number.isFinite(spot.y));
 assert.equal(sim.canPlaceCue(spot.x,spot.y),true);
 assert.deepEqual(sim.snapshot(),snapshot,'placement planner mutated the authoritative sim');
 const trial=new Simulation(sim.snapshot().balls);
 assert.equal(trial.placeCue(spot.x,spot.y),true);
 assert.ok(candidateShots(trial,'solids').length>0,
   'a strategic ball-in-hand should preserve a real open pocket option');
});
test('live CPU and benchmark share exactly the same real placement validation',()=>{
 const game=new Game({kind:'match',players:'cpu',difficulty:'club',seed:29});
 game.turn=1;game.break=false;game.groups=['solids','stripes'];
 game.sim=new Simulation([makeBall(0,25,25),makeBall(9,530,230),makeBall(2,450,330)]);
 game.sim.cue().pocketed=true;game.ballInHand=true;
 const expected=chooseAiCuePlacement(game.sim,'stripes','club');
 assert.ok(expected);
 game.update(.025);
 assert.equal(game.ballInHand,false);
 assert.equal(game.sim.cue().pocketed,false);
 assert.deepEqual({x:game.sim.cue().x,y:game.sim.cue().y},
   {x:expected.x,y:expected.y});
 assert.deepEqual(game.history.at(-1),
   {kind:'placement',x:expected.x,y:expected.y});
});

test('frame-sliced and synchronous Club Pro reach the identical seeded decision',()=>{
 const sim=sparse(),before=sim.snapshot();
 const synchronous=chooseShot(sim,'solids','club',createRandom(91));
 const generator=createShotPlanner(sim,'solids','club',createRandom(91));
 let state={done:false},frames=0;
 while(!state.done&&frames++<45){
   for(let step=0;step<240&&!state.done;step++)state=generator.next();
 }
 assert.equal(state.done,true,'planning exceeded its finite preview budget');
 assert.deepEqual(state.value,synchronous);
 assert.deepEqual(sim.snapshot(),before,'cooperative previews moved authoritative balls');
});
test('Club Pro live opponent yields frames while building the exact same shot',()=>{
 const a=new Game({kind:'match',players:'cpu',difficulty:'club',seed:82});
 const b=new Game({kind:'match',players:'cpu',difficulty:'club',seed:82});
 for(const game of [a,b]){
   game.turn=1;game.break=false;game.groups=['stripes','solids'];
   game.sim=sparse();
 }
 const synchronous=chooseShot(b.sim,'solids','club',b.random);
 a.update(.016);
 assert.ok(a.planIterator,'live opponent should keep partial planning in progress');
 assert.equal(a.previewShot,null,'do not advertise an unfinished predicted shot');
 for(let i=0;i<60&&!a.previewShot;i++)a.update(.016);
 assert.ok(a.previewShot,'real opponent did not finish bounded previews');
 assert.deepEqual(a.previewShot,synchronous,
   'split rendering frames must not change outcomes or consume different RNG');
 assert.equal(a.shots,0,'the opponent must not fire before the pre-shot cue animation');
 a.reset();
 assert.equal(a.planIterator,null,'rerack must discard any old planning state');
});
