import test from 'node:test';import assert from 'node:assert/strict';
import {Simulation,makeBall} from '../src/physics.js';import {chooseShot,Game} from '../src/game.js';
test('CPU returns finite aim and bounded power even without a target',()=>{let s=new Simulation([makeBall(0,200,200)]);let result=chooseShot(s);assert.ok(Number.isFinite(result.angle));assert.ok(result.power>=0&&result.power<=1);});
test('practice remains separate from match turn state',()=>{let g=new Game({kind:'practice'});assert.equal(g.turn,0);assert.equal(g.beginShot(0,.5),true);assert.equal(g.beginShot(0,.5),false);});
test('a shot resolves and hands over a miss after initial break',()=>{let g=new Game({kind:'match',players:'local'});g.break=false;g.sim=new Simulation([makeBall(0,230,230),makeBall(1,800,400)]);g.beginShot(Math.PI,.18);g.sim.advance(60);g.resolve();assert.equal(g.turn,1);assert.equal(g.ballInHand,true);});
