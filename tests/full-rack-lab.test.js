import test from 'node:test';
import assert from 'node:assert/strict';
import {runRack,summary} from '../scripts/full-rack-lab.mjs';

test('headless real-physics match replay is seed-identical across turns',()=>{
 const a=runRack(29,{maxShots:5}),b=runRack(29,{maxShots:5});
 assert.equal(a.shots,5);
 assert.deepEqual(a.history,b.history);
 assert.deepEqual(a.finalSnapshot,b.finalSnapshot);
 assert.equal(a.rulings.length,a.shots);
 assert.ok(a.steps>0&&a.planning.maxMs>=0);
 assert.equal(summary(a).seed,29);
});
test('a match seed produces valid beginner-vs-advanced metrics',()=>{
 const run=runRack(30,{maxShots:4,tiers:['rookie','club']});
 assert.deepEqual(run.tiers,['rookie','club']);
 assert.equal(run.rulings.length,run.shots);
 assert.ok(run.counts.pots>=0&&run.counts.fouls>=0);
 assert.ok(run.rulings.every(r=>['foul','turn','retain','end'].includes(r.result)));
});
