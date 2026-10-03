import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,chooseShot} from '../src/game.js';
import {initialCuePlacement} from '../src/placement-guide.js';
import {createRandom} from '../src/random.js';
import {resolveCasualEight} from '../src/casual-rules.js';

/** Run real 240 Hz physics across a series of CPU-planned, human-triggered
 * local turns. Determinism and legal state are assessed; complete-rack
 * difficulty/rates still require measured real-device play. */
function playSequence(seed,maxShots=14){
 const game=new Game({kind:'match',players:'local',seed});
 const random=createRandom(seed+600);
 for(let n=0;n<maxShots&&!game.over;n++){
   if(game.ballInHand){
     const draft=initialCuePlacement(game.sim);
     assert.ok(draft?.candidate,'a legal open cloth location must exist');
     assert.equal(game.placeCue(draft.candidate.x,draft.candidate.y),true);
   }
   const planned=game.break?{angle:0,power:.81}:
     chooseShot(game.sim,game.group,n%2===0?'club':'rookie',random);
   assert.equal(game.beginShot(planned.angle,planned.power),true);
   let steps=0;
   while(game.turnShot&&steps++<8000)game.step();
   assert.equal(game.turnShot,null,`shot ${n+1} did not resolve`);
   assert.ok(game.sim.atRest(),`shot ${n+1} retained moving balls`);
   const rulings=game.history.filter(entry=>entry.kind==='ruling');
   assert.equal(rulings.length,n+1);
   const last=rulings.at(-1);
   assert.deepEqual(last.groups,game.groups);
   assert.equal(last.winner,game.winner);
   if(game.ballInHand)assert.equal(last.result,'foul');
   assert.ok(game.groups[0]!==game.groups[1]||game.groups[0]===null);
   for(const ball of game.sim.balls){
      assert.ok([ball.x,ball.y,ball.vx,ball.vy].every(Number.isFinite));
   }
 }
 return {history:game.history,snapshot:game.sim.snapshot(),over:game.over,winner:game.winner,shots:game.shots};
}
test('multiple seeded physical turns preserve identical ball and ruling histories',()=>{
 const first=playSequence(41),same=playSequence(41),different=playSequence(42,8);
 assert.deepEqual(first,same,'same match seed produces identical gameplay and rulings');
 assert.ok(first.shots>=4,'match fixture never advanced past the break');
 assert.ok(different.shots>=4);
});
test('a complete scripted solids run ends only when the 8 is legally shot later',()=>{
 let groups=['solids','stripes'],turn=0;
 for(let ball=1;ball<=7;ball++){
   const decision=resolveCasualEight({turn,breakShot:false,groups,
     shot:{first:ball,pots:[ball],rail:true,groupAtStart:'solids'}});
   assert.equal(decision.type,'retain');
   assert.equal(decision.winner,null);
   turn=decision.turn;groups=decision.groups;
 }
 const final=resolveCasualEight({turn,breakShot:false,groups,
   shot:{first:8,pots:[8],rail:true,groupAtStart:'eight'}});
 assert.equal(final.winner,0);assert.equal(final.legal,true);
});
