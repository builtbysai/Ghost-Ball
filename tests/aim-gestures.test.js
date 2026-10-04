import test from 'node:test';
import assert from 'node:assert/strict';
import {TAP_SLOP,TOUCH_LEAD,leadFor,isTap,bearingTo,pickObjectBall,tapAim,classifyPress,angleDelta} from '../src/aim-gestures.js';
import {Simulation,makeBall} from '../src/physics.js';

const sim=()=>new Simulation([makeBall(0,200,250),makeBall(3,500,250),makeBall(9,600,120),makeBall(8,800,400)]);

test('a press on the stick rotates it; elsewhere it aims at the point unless Smart is off',()=>{
 assert.equal(classifyPress({onStick:true,mode:'smart'}),'stick');
 assert.equal(classifyPress({onStick:true,mode:'stick'}),'stick');
 assert.equal(classifyPress({onStick:false,mode:'smart'}),'point');
 assert.equal(classifyPress({onStick:false,mode:'stick'}),null,'Stick-only never reacts to the cloth');
});
test('taps are separated from drags by a small finger slop',()=>{
 assert.equal(isTap(TAP_SLOP-1),true);
 assert.equal(isTap(TAP_SLOP),false);
 assert.equal(isTap(NaN),false);
});
test('touch gets a lead offset so the finger never hides the aim point; a mouse does not',()=>{
 assert.equal(leadFor('touch'),TOUCH_LEAD);
 assert.equal(leadFor('pen'),TOUCH_LEAD);
 assert.equal(leadFor('mouse'),0);
});
test('aiming at a point gives the exact bearing and refuses a point on the cue ball',()=>{
 const cue=sim().cue();
 assert.ok(Math.abs(bearingTo(cue,{x:300,y:250}))<1e-12);
 assert.ok(Math.abs(bearingTo(cue,{x:200,y:350})-Math.PI/2)<1e-12);
 assert.equal(bearingTo(cue,{x:204,y:252}),null);
 assert.equal(bearingTo(cue,{x:NaN,y:1}),null);
 assert.equal(bearingTo(null,{x:1,y:1}),null);
});
test('tapping an object ball aims through its centre, with a forgiving finger pad',()=>{
 const s=sim();
 const hit=tapAim(s,{x:512,y:262});
 assert.equal(hit.ball,3);
 assert.ok(Math.abs(hit.angle)<1e-12,'dead centre of the 3 from (200,250)');
 const open=tapAim(s,{x:400,y:400});
 assert.equal(open.ball,null);
 assert.ok(Math.abs(open.angle-Math.atan2(150,200))<1e-12);
 assert.equal(pickObjectBall(s.balls,{x:200,y:250}),null,'the cue ball is never an aim target');
});
test('the nearest of two overlapping fingers-worth of balls wins',()=>{
 const s=new Simulation([makeBall(0,100,250),makeBall(1,400,250),makeBall(2,424,250)]);
 assert.equal(pickObjectBall(s.balls,{x:420,y:250}).id,2);
 assert.equal(pickObjectBall(s.balls,{x:405,y:250}).id,1);
});
test('pocketed balls and a pocketed cue ball cannot be tapped or aimed from',()=>{
 const s=sim();s.balls.find(b=>b.id===3).pocketed=true;
 assert.equal(tapAim(s,{x:500,y:250}).ball,null);
 s.cue().pocketed=true;
 assert.equal(tapAim(s,{x:500,y:250}),null);
});
test('angleDelta takes the short way around',()=>{
 assert.ok(Math.abs(angleDelta(3.1,-3.1)-(2*Math.PI-6.2))<1e-9);
 assert.ok(Math.abs(angleDelta(0,1)-1)<1e-12);
});
