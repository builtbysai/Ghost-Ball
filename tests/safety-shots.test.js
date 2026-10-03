import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,makeBall} from '../src/physics.js';
import {candidateShots,chooseShot,createShotPlanner,assessShot} from '../src/ai.js';
import {createRandom} from '../src/random.js';

const blocked=()=>new Simulation([
 makeBall(0,220,250),makeBall(9,355,250),
 makeBall(1,525,250),makeBall(8,825,250)
]);

test('no open pocket asks Club Pro for real-physics safety options, not a blind cannon',()=>{
 const sim=blocked(),before=sim.snapshot();
 assert.equal(candidateShots(sim,'solids').length,0,'fixture must have no clean pocket lanes');
 const plan=chooseShot(sim,'solids','club',createRandom(72));
 assert.equal(plan.plan,'safety-preview');
 assert.equal(plan.target,1);
 assert.ok([.28,.35,.43].includes(plan.power));
 assert.equal(typeof plan.predictedEarlyEight,'boolean');
 assert.equal(typeof plan.predictedComplete,'boolean');
 assert.deepEqual(sim.snapshot(),before,'safety previews must never mutate the table');
 const actual=assessShot(sim,{...plan,pocket:-1,cost:Math.hypot(525-220,250-250)*.1},
  'solids',{maxSteps:1440});
 assert.equal(actual.earlyEight,plan.predictedEarlyEight,
   'the reported eight risk must come from the exact chosen angle');
 assert.equal(actual.legalFirst,plan.predictedLegal);
});

test('safety planning yields across frames but produces the same seeded stroke',()=>{
 const sim=blocked(),a=chooseShot(sim,'solids','club',createRandom(102));
 const generator=createShotPlanner(sim,'solids','club',createRandom(102));
 let frames=0,state={done:false};
 while(!state.done&&frames++<55)for(let i=0;i<240&&!state.done;i++)state=generator.next();
 assert.equal(state.done,true,'bounded Club safety search exceeded its frame budget');
 assert.deepEqual(state.value,a,'frame splits must not change physics or RNG');
 assert.equal(sim.atRest(),true);
});
