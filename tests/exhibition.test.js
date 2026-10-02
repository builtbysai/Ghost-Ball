import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';

test('each exhibition shot displays its actual cue aim, draw and strike',()=>{
 const game=new Game({kind:'attract',seed:3});
 game.update(.15);
 assert.ok(game.previewShot,'a shot should be planned before the player fires');
 const intended={...game.previewShot},pose=game.presentedCue;
 assert.ok(pose&&Number.isFinite(pose.angle)&&pose.drawback>0,'the visible cue is animated');
 game.update(1.2);
 assert.ok(game.presentedCue.drawback>pose.drawback,'the cue draws back before firing');
 game.update(1.1);
 assert.equal(game.shots,1,'exhibition player fires a real shot');
 assert.equal(game.history[0].angle,intended.angle,'the preview corresponds to the actual shot');
 assert.equal(game.presentedCue?.strike?.progress,0,'the stroke starts when the shot fires');
 game.update(.055);
 assert.ok(game.presentedCue?.strike?.progress>.2,'the stroke visibly advances');
 let steps=0;while(game.turnShot&&steps++<5000)game.step();
 assert.ok(steps<5000,'the first shot eventually settles');
 assert.equal(game.turn,1,'the next exhibition player takes over');
 game.update(.25);
 assert.ok(game.previewShot&&game.presentedCue,'the second player visibly aims');
});

test('exhibition aim remains stable while the cue animates',()=>{
 const game=new Game({kind:'attract',seed:2});game.update(.1);
 const first={...game.previewShot};
 for(let i=0;i<8;i++)game.update(.08);
 assert.deepEqual(game.previewShot,first,'one stable shot plan per turn');
});