import test from 'node:test';import assert from 'node:assert/strict';
import {advanceRoll,orientationOf,rotateVector} from '../src/ball-orientation.js';
import {Simulation,makeBall,TABLE} from '../src/physics.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('stationary balls do not roll',()=>{let b=makeBall(4,200,100);advanceRoll(b,0,0,TABLE.radius);assert.deepEqual(b.orientation,[1,0,0,0]);near(b.rotation,0)});
test('one radius of travel gives one radian rolling movement',()=>{let b=makeBall(9,200,100);advanceRoll(b,TABLE.radius,0,TABLE.radius);near(b.rotation,1);let v=rotateVector(orientationOf(b),[0,0,1]);near(v[0],Math.sin(1));near(v[2],Math.cos(1))});
test('reversing travel reverses roll',()=>{let b=makeBall(2,200,100);advanceRoll(b,37,-19,TABLE.radius);advanceRoll(b,-37,19,TABLE.radius);near(b.orientation[0],1);near(Math.hypot(...b.orientation.slice(1)),0)});
test('physics advances visual roll, snapshots have independent orientation',()=>{const sim=new Simulation([makeBall(0,252,250),makeBall(3,400,250)]);sim.balls[1].vx=400;sim.moving=true;const old=sim.balls[1].orientation.slice();sim.step();assert.notDeepEqual(sim.balls[1].orientation,old);const state=sim.snapshot(),copy=new Simulation([]);copy.loadSnapshot(state);assert.deepEqual(copy.balls[1].orientation,sim.balls[1].orientation);copy.balls[1].orientation[0]=.5;assert.notEqual(copy.balls[1].orientation[0],sim.balls[1].orientation[0])});
