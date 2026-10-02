import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SHOT_CLOCK_SECONDS} from '../src/game.js';
import {makeBall} from '../src/physics.js';
import {projectAim} from '../src/aim-guide.js';

test('a timed-out casual turn is a recorded foul with ball in hand',()=>{
 const game=new Game({kind:'match',players:'local',seed:4});
 game.update(.016);game.update(SHOT_CLOCK_SECONDS);
 assert.equal(game.turn,1);
 assert.equal(game.foul,true);
 assert.equal(game.ballInHand,true);
 assert.equal(game.shots,0,'a timeout is not a physical strike');
 assert.equal(game.history.at(-1).kind,'shot-clock-expired');
 assert.equal(game.beginShot(0,.5),false,'the next player places their cue first');
 assert.equal(game.placeCue(240,250),true);
 assert.equal(game.shotRemaining,SHOT_CLOCK_SECONDS);
 game.update(.016);
 assert.equal(game.shotRemaining,SHOT_CLOCK_SECONDS,'a fresh clock follows placement');
});

test('practice does not inherit timed-match penalties',()=>{
 const game=new Game({kind:'practice',seed:7});
 game.update(120);
 assert.equal(game.ballInHand,false);
 assert.equal(game.turn,0);
 assert.equal(game.shotRemaining,SHOT_CLOCK_SECONDS);
});
test('the shot clock is stopped for moving balls and ball-in-hand placement',()=>{
 const game=new Game({kind:'match',players:'local',seed:2});
 game.update(.016);game.ballInHand=true;game.update(90);
 assert.equal(game.turn,0);
 assert.equal(game.shotRemaining,SHOT_CLOCK_SECONDS);
 game.ballInHand=false;game.update(.016);
 assert.equal(game.beginShot(0,.52),true);
 const before=game.shotRemaining;
 game.update(90);
 assert.equal(game.shotRemaining,before,'shot time does not count during physics');
});
test('aim guide projects an unobstructed head-on collision',()=>{
 const cue=makeBall(0,200,250),target=makeBall(1,500,250);
 const guide=projectAim([cue,target],cue,0);
 assert.equal(guide.target.id,1);
 assert.ok(Math.abs(guide.cueEnd.x-476)<1e-8);
 assert.ok(Math.abs(guide.objectEnd.y-250)<1e-8);
 assert.ok(guide.objectEnd.x>500);
});
test('aim guide shows realistic direction for a thin cut',()=>{
 const cue=makeBall(0,200,265),target=makeBall(1,500,250);
 const guide=projectAim([cue,target],cue,0);
 assert.equal(guide.target.id,1);
 assert.ok(guide.objectEnd.y<target.y,'object is deflected toward contact normal');
});
test('aim guide cannot pass through another object ball',()=>{
 const cue=makeBall(0,200,250),target=makeBall(1,500,250),block=makeBall(2,600,250);
 const guide=projectAim([cue,target,block],cue,0);
 assert.equal(guide.target.id,1);
 assert.ok(guide.objectEnd.x<=block.x-24+.01);
});
test('a missed aim has no fictional object-ball projection',()=>{
 const cue=makeBall(0,200,250),target=makeBall(1,500,400);
 const guide=projectAim([cue,target],cue,0);
 assert.equal(guide.target,null);
 assert.equal(guide.objectEnd,null);
 assert.ok(guide.cueEnd.x<1000);
});
