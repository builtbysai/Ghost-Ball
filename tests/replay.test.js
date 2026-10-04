import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {Simulation} from '../src/physics.js';

const settle=game=>{let k=0;while(game.turnShot&&k++<12000)game.step();};
const positions=sim=>sim.balls.map(b=>[b.id,b.pocketed,Math.round(b.x*1e6),Math.round(b.y*1e6)]);

test('the last shot is kept and re-striking it reproduces the table exactly',()=>{
 const game=new Game({kind:'match',players:'local',seed:12});
 assert.equal(game.lastShot,null);
 assert.ok(game.beginShot(.03,.9,{x:.2,y:-.1}));
 assert.ok(game.lastShot&&game.lastShot.shot===1);
 settle(game);
 const replay=new Simulation(game.lastShot.balls);
 assert.ok(replay.strike(game.lastShot.angle,game.lastShot.power,game.lastShot.spin));
 let k=0;while(replay.moving&&k++<12000)replay.step();
 assert.deepEqual(positions(replay),positions(game.sim),'a replay is the shot that was played');
});
test('a refused stroke does not overwrite the stored shot, and a reset clears it',()=>{
 const game=new Game({kind:'match',players:'local',seed:3,callEight:true});
 game.beginShot(.1,.5);settle(game);const kept=game.lastShot;
 game.ballInHand=true;assert.equal(game.beginShot(.2,.5),false);
 assert.equal(game.lastShot,kept);
 game.reset();assert.equal(game.lastShot,null);
});
