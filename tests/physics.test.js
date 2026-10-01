import test from 'node:test';
import assert from 'node:assert/strict';
import {rack,Simulation,TABLE,makeBall} from '../src/physics.js';
test('rack contains 16 unique balls with eight in the middle row',()=>{const balls=rack();assert.equal(balls.length,16);assert.equal(new Set(balls.map(b=>b.id)).size,16);assert.ok(balls.some(b=>b.id===8&&b.x>750));});
test('stationary cue can shoot and subsequently comes to rest',()=>{const sim=new Simulation([makeBall(0,250,200)]);assert.equal(sim.strike(0,.25),true);assert.equal(sim.strike(0,.25),false);sim.advance(50);assert.ok(sim.atRest());});
test('ball collision transfers momentum and conserves IDs',()=>{const sim=new Simulation([makeBall(0,250,250),makeBall(1,450,250)]);sim.strike(0,.4);sim.advance(.25);assert.ok(sim.balls[1].x>450);assert.deepEqual(sim.balls.map(b=>b.id),[0,1]);});
test('pocket capture and cue placement cannot overlap object balls',()=>{const sim=new Simulation([makeBall(0,50,50),makeBall(1,500,250)]);sim.balls[0].vx=-600;sim.balls[0].vy=-600;sim.advance(.09);assert.ok(sim.balls[0].pocketed);assert.equal(sim.placeCue(500,250),false);assert.equal(sim.placeCue(220,220),true);});
test('identical shots follow identical fixed-step trajectories',()=>{const a=new Simulation(rack(5)),b=new Simulation(rack(5));a.strike(0,.75);b.strike(0,.75);a.advance(3);b.advance(3);assert.deepEqual(a.balls,b.balls);});
