import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,makeBall} from '../src/physics.js';
import {createRandom} from '../src/random.js';
import {candidateShots,chooseShot,previewShot} from '../src/ai.js';
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
