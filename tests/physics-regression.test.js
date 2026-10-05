import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation, makeBall, rack, TABLE, JAWS} from '../src/physics.js';
import {Game, chooseShot} from '../src/game.js';
import {createRandom} from '../src/random.js';

const moving=(x,y,vx,vy)=>{
  const sim=new Simulation([makeBall(0,x,y)]);
  Object.assign(sim.cue(),{vx,vy});sim.moving=true;
  return sim;
};

test('a side pocket catches an incoming ball while adjacent rubber rebounds it',()=>{
  const center=moving(500,80,0,-400);
  const pocketEvents=center.advance(.42);
  assert.equal(center.cue().pocketed,true);
  assert.ok(pocketEvents.some(e=>e.type==='pocket'&&e.pocket===1));
  const rail=moving(600,80,0,-400);
  const bounce=rail.advance(.45);
  assert.equal(rail.cue().pocketed,false);
  assert.ok(bounce.some(e=>e.type==='rail'));
  assert.ok(rail.cue().y>=TABLE.radius);
});

test('a ball that rolls into a mouth drops; one aimed at the cushion bounces; nothing invisible is in the way',()=>{
  const corner=moving(45,45,-440,-440);corner.advance(.4);
  assert.equal(corner.cue().pocketed,true);
  // into the side mouth, even near its edge: it looks like it is going in, so it goes in
  const edge=moving(462,50,0,-500);edge.advance(.5);
  assert.equal(edge.cue().pocketed,true);
  // straight at the cushion beside the mouth: a normal cushion rebound
  const wall=moving(430,50,0,-500);const events=wall.advance(.5);
  assert.equal(wall.cue().pocketed,false);
  assert.ok(events.some(e=>e.type==='rail'));
  assert.ok(wall.cue().vy>0,'rebounded off the cushion');
  // and the pocket-nose list is empty
  assert.equal(JAWS.length,0);
});

test('contact conserves pairwise momentum to numerical tolerance before cloth drag',()=>{
  const sim=new Simulation([makeBall(0,250,250),makeBall(1,273,250)]);
  sim.cue().vx=400;sim.cue().spin=0;
  // Check collision impulse by running a tiny step with no initial slip.
  const events=sim.step(TABLE.step);
  assert.ok(events.some(e=>e.type==='contact'));
  const vx=sim.balls.reduce((total,b)=>total+b.vx,0);
  assert.ok(Math.abs(vx-400)<4,`unexpected momentum drift ${vx}`);
});

test('sliding transitions to rolling without increasing ball speed',()=>{
  const sim=new Simulation([makeBall(0,450,250)]);
  sim.strike(0,.36);
  const start=Math.hypot(sim.cue().vx,sim.cue().vy);
  sim.advance(.3);
  const after=Math.hypot(sim.cue().vx,sim.cue().vy);
  assert.ok(after<start);
  assert.ok(Math.hypot(sim.cue().slipX,sim.cue().slipY)<1);
  sim.advance(15);
  assert.equal(sim.atRest(),true);
});

test('snapshot and restoration preserve independent deterministic trajectories',()=>{
  const sim=new Simulation(rack(234));sim.strike(0,.8,.45);sim.advance(.5);
  const copy=new Simulation([]);copy.loadSnapshot(sim.snapshot());
  assert.deepEqual(copy.snapshot(),sim.snapshot());
  copy.cue().x+=1;assert.notEqual(copy.cue().x,sim.cue().x);
  copy.loadSnapshot(sim.snapshot());sim.advance(6);copy.advance(6);
  assert.deepEqual(copy.snapshot(),sim.snapshot());
});

test('seeded opponents repeat decisions and equivalent games repeat rack and shot history',()=>{
  const a=new Game({kind:'match',seed:122}),b=new Game({kind:'match',seed:122});
  assert.deepEqual(a.sim.snapshot(),b.sim.snapshot());
  assert.deepEqual(chooseShot(a.sim,'open','rookie',createRandom(98)),chooseShot(b.sim,'open','rookie',createRandom(98)));
  a.beginShot(0,.6,.2);b.beginShot(0,.6,.2);
  a.sim.advance(5);b.sim.advance(5);
  assert.deepEqual(a.sim.snapshot(),b.sim.snapshot());
  assert.deepEqual(a.history,b.history);
});

test('cue placement validation rejects out-of-bounds and overlapping positions',()=>{
  const sim=new Simulation([makeBall(0,100,100),makeBall(1,500,250)]);
  assert.equal(sim.canPlaceCue(-2,80),false);
  assert.equal(sim.canPlaceCue(500,250),false);
  assert.equal(sim.placeCue(500,250),false);
  assert.equal(sim.placeCue(400,230),true);
});

test('repeated opening breaks settle without NaNs or escaped balls',()=>{
  for(let seed=0;seed<12;seed++){
    const sim=new Simulation(rack(seed));assert.equal(sim.strike(0,.83),true);
    sim.advance(25);
    assert.equal(sim.atRest(),true,`seed ${seed} never settled`);
    for(const b of sim.balls){
      assert.ok([b.x,b.y,b.vx,b.vy].every(Number.isFinite),`nonfinite ball ${b.id}`);
      assert.ok(b.pocketed||b.x>=-35.1&&b.x<=1035.1&&b.y>=-35.1&&b.y<=535.1);
    }
  }
});

test('the eight is re-spotted without overlapping a ball on its preferred spot',()=>{
  const game=new Game({kind:'match',seed:2});
  const eight=game.sim.balls.find(b=>b.id===8);
  game.sim.balls=[makeBall(0,250,250),makeBall(1,790,250),eight];
  eight.pocketed=true;
  assert.equal(game.spotEight(),true);
  assert.equal(eight.pocketed,false);
  assert.ok(Math.hypot(eight.x-790,eight.y-250)>TABLE.radius*2);
  assert.equal(eight.vx,0);assert.equal(eight.slipX,0);
});

test('game records committed cue placement after a scratch, not an invalid preview',()=>{
  const game=new Game({kind:'match',seed:2});
  game.ballInHand=true;game.sim.cue().pocketed=true;
  assert.equal(game.placeCue(718,250),false); // rack obstructs this site
  assert.equal(game.ballInHand,true);
  assert.equal(game.placeCue(300,240),true);
  assert.deepEqual(game.history.at(-1),{kind:'placement',x:300,y:240});
});
