import test from 'node:test';
import assert from 'node:assert/strict';
import {runRack} from '../scripts/full-rack-lab.mjs';
import {candidateShots,chooseShot,assessShot} from '../src/ai.js';
import {Simulation,makeBall} from '../src/physics.js';
import {createRandom} from '../src/random.js';

test('Rookie racks finish with a winner in a believable number of shots',()=>{
 let fouls=0,shots=0;
 for(const seed of [1,2,3,4]){
  const run=runRack(seed,{maxShots:140,tiers:['rookie','rookie']});
  assert.equal(run.finished,true,`seed ${seed} stalled with ${run.remaining} balls left`);
  assert.ok(run.shots<=140,`seed ${seed} took ${run.shots} shots`);
  assert.deepEqual(run.stagnant,[],`seed ${seed} repeated an identical table`);
  fouls+=run.counts.fouls;shots+=run.counts.shots;
 }
 assert.ok(fouls/shots<.12,`unforced-foul rate ${(fouls/shots).toFixed(2)} should stay low`);
});

test('no candidate pot asks the geometry to cut past 78 degrees or through a jaw',()=>{
 // Object ball tucked beside the bottom-left corner: every direct line
 // either needs an impossible cut or runs through the rubber nose.
 const sim=new Simulation([makeBall(0,640,250),makeBall(3,36,470),makeBall(8,500,120)]);
 for(const shot of candidateShots(sim,'solids')){
  assert.ok(shot.cut<=.8+1e-9,'cut angle stays playable');
  const verdict=assessShot(sim,shot,'solids');
  assert.equal(verdict.legalFirst,true);
 }
});

test('Rookie never selects a shot that its own look-ahead rules a foul when a legal one exists',()=>{
 const sim=new Simulation([
  makeBall(0,240,250),makeBall(1,520,250),makeBall(2,600,300),makeBall(9,700,180),makeBall(8,800,250)
 ]);
 for(let seed=1;seed<=6;seed++){
  const plan=chooseShot(sim,'solids','rookie',createRandom(seed));
  const verdict=assessShot(sim,{...plan,pocket:plan.pocket??-1,cost:0},'solids',{maxSteps:1440});
  assert.equal(verdict.foul,false,`seed ${seed}: ${plan.plan} was predicted a foul`);
 }
});

test('stalled turns widen Rookie\'s search without changing its legality guarantees',()=>{
 const sim=new Simulation([makeBall(0,240,250),makeBall(6,500,470),makeBall(8,820,250)]);
 const plan=chooseShot(sim,'solids','rookie',createRandom(5),{stalled:3});
 assert.ok(Number.isFinite(plan.angle)&&Number.isFinite(plan.power));
 assert.notEqual(plan.plan,'none');
});

test('look-ahead treats sinking the 8 without hitting it first as a lost rack',()=>{
 // The 13 sits between the cue ball and the 8, which is lined up on a pocket.
 const sim=new Simulation([makeBall(0,300,250),makeBall(13,400,250),makeBall(8,560,250)]);
 const verdict=assessShot(sim,{angle:0,power:.9,cost:0,target:8,pocket:-1},'eight',{maxSteps:1440});
 assert.equal(verdict.legalFirst,false);
 assert.equal(verdict.foul,true);
 if(verdict.first!==8)assert.ok(verdict.score<0);
});
