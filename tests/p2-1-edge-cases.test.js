import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,makeBall} from '../src/physics.js';
import {Game} from '../src/game.js';
import {chooseShot,chooseAiCuePlacement} from '../src/ai.js';
import {createRandom} from '../src/random.js';

const sparse=()=>new Simulation([
 makeBall(0,220,250),makeBall(9,355,250),makeBall(1,525,250),
 makeBall(8,825,250)
]);
function settle(game,limit=9000){
 let steps=0;
 while(game.turnShot&&steps++<limit)game.step();
 assert.equal(game.turnShot,null,'a committed shot must eventually settle');
 assert.equal(game.sim.atRest(),true);
 return game.history.at(-1);
}

test('invalid spin rejects atomically without moving or deadlocking the cue',()=>{
 for(const spin of [NaN,Infinity,{x:NaN,y:0},{x:0,y:-Infinity}]){
  const sim=sparse(),before=sim.snapshot();
  assert.equal(sim.strike(.1,.55,spin),false);
  assert.deepEqual(sim.snapshot(),before,'invalid spin mutated stationary gameplay');
  assert.equal(sim.atRest(),true);
  assert.equal(sim.strike(.1,.55,{x:.2,y:-.1}),true,
    'a legal follow-up shot must still work');
 }
});

test('timing out during frame-sliced Club planning discards the stale shot',()=>{
 const events=[];
 const game=new Game({kind:'match',players:'cpu',difficulty:'club',seed:482,
  onTurn:event=>events.push(event)});
 game.break=false;game.turn=1;game.groups=['stripes','solids'];
 game.sim=sparse();
 game.update(.016);
 assert.ok(game.planIterator,'the AI should have a partially searched plan');
 assert.ok(game.planningPose,'the visible cue must still have a provisional aim');
 assert.equal(game.expireShotClock(),true);
 assert.equal(game.turn,0);
 assert.equal(game.ballInHand,true);
 assert.equal(game.planIterator,null);
 assert.equal(game.planningPose,null);
 assert.equal(game.previewShot,null);
 assert.equal(game.planSettledAt,0);
 assert.deepEqual(events,[{type:'foul',reason:'shot-clock',turn:0,offender:1}]);
 assert.equal(game.expireShotClock(),false,'no second timeout while ball in hand');
 game.update(.016);
 assert.equal(game.shots,0,'the abandoned shot must never fire');
});

test('blocked late-table CPU plan is finite, read-only, and ruled by real physics',()=>{
 const game=new Game({kind:'match',players:'local',seed:901});
 game.sim=sparse();game.groups=['solids','stripes'];game.break=false;
 const before=game.sim.snapshot();
 const plan=chooseShot(game.sim,game.group,'club',createRandom(84));
 assert.deepEqual(game.sim.snapshot(),before);
 assert.ok(Number.isFinite(plan.angle)&&Number.isFinite(plan.power));
 assert.ok(game.beginShot(plan.angle,plan.power));
 const ruling=settle(game);
 assert.equal(ruling.kind,'ruling');
 assert.equal(ruling.shot,1);
 assert.equal(ruling.groupAtStart,'solids');
 assert.ok(['foul','turn','retain','end'].includes(ruling.result));
 assert.ok(ruling.potRecords.every(record=>record.id>=0&&record.pocket>=0&&record.pocket<6));
 assert.deepEqual(game.history[0].angle,plan.angle);
});

test('last-eight ball-in-hand placement can be committed and legally adjudicated',()=>{
 const game=new Game({kind:'match',players:'local',seed:802});
 game.sim=new Simulation([makeBall(0,240,245),makeBall(8,780,230)]);
 game.sim.cue().pocketed=true;
 game.groups=['solids','stripes'];game.turn=0;game.break=false;game.ballInHand=true;
 assert.equal(game.group,'eight','the shooter already cleared their group');
 const before=game.sim.snapshot();
 const site=chooseAiCuePlacement(game.sim,game.group,'club');
 assert.ok(site&&game.sim.canPlaceCue(site.x,site.y));
 assert.deepEqual(game.sim.snapshot(),before,'placement search must not move balls');
 assert.equal(game.placeCue(site.x,site.y),true);
 assert.equal(game.ballInHand,false);
 assert.deepEqual(game.history.at(-1),{kind:'placement',x:site.x,y:site.y});
 const plan=chooseShot(game.sim,game.group,'club',createRandom(3));
 assert.equal(plan.target,8);
 assert.equal(game.beginShot(plan.angle,plan.power),true);
 const ruling=settle(game);
 assert.equal(ruling.groupAtStart,'eight');
 assert.equal(ruling.firstContact,8,'a lone eight should be contacted first');
 if(ruling.result==='end'){
  assert.equal(ruling.reason,'eight-cleared');
  assert.equal(ruling.winner,0);
 }
});
