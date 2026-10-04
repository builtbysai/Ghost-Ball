import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SHOT_CLOCK_SECONDS} from '../src/game.js';
import {projectAim} from '../src/aim-guide.js';
import {Simulation,makeBall} from '../src/physics.js';
import {wheelAngle,bindAimWheel} from '../src/touch-controls.js';

test('the shot clock defaults to 45 s and can be turned off for relaxed games',()=>{
 assert.equal(new Game({kind:'match',players:'local',seed:2}).shotClockSeconds,SHOT_CLOCK_SECONDS);
 const relaxed=new Game({kind:'match',players:'local',seed:2,shotClock:0});
 relaxed.update(.016);relaxed.update(600);
 assert.equal(relaxed.turn,0,'no timeout ever fires');
 assert.equal(relaxed.foul,false);
 assert.equal(relaxed.history.length,0);
});
test('a custom shot clock counts from its own length',()=>{
 const g=new Game({kind:'match',players:'local',seed:2,shotClock:20});
 g.update(.016);
 assert.equal(g.shotRemaining,20);
 g.update(21);
 assert.equal(g.turn,1);assert.equal(g.ballInHand,true);
 assert.equal(g.shotRemaining,20,'the next player gets a fresh 20 s');
});
test('junk shot clock values fall back to off rather than NaN timers',()=>{
 for(const bad of [NaN,-5,'abc',undefined===1])assert.equal(new Game({kind:'match',players:'local',seed:1,shotClock:bad}).shotClockSeconds,0);
});
test('the short aim guide stops early and drops the object-ball line',()=>{
 const sim=new Simulation([makeBall(0,100,250),makeBall(1,800,250)]);
 const full=projectAim(sim.balls,sim.cue(),0);
 const short=projectAim(sim.balls,sim.cue(),0,{maxObjectLength:60,maxCueLength:230});
 assert.ok(full.target&&full.objectEnd,'the full guide shows the ball it will hit');
 assert.equal(short.target,null,'a contact beyond the short guide is not previewed');
 assert.ok(short.cueEnd.x-100<=230+1e-9);
 const near=new Simulation([makeBall(0,100,250),makeBall(1,260,250)]);
 assert.ok(projectAim(near.balls,near.cue(),0,{maxObjectLength:60,maxCueLength:230}).target,'a near contact is still shown');
});
test('the fine wheel speed turns the cue less per drag',()=>{
 const normal=Math.abs(wheelAngle(0,50,.0015)),fine=Math.abs(wheelAngle(0,50,.0006));
 assert.ok(fine<normal&&fine>0);
 const listeners={},element={addEventListener:(k,fn)=>listeners[k]=fn,setPointerCapture(){},releasePointerCapture(){}};
 let angle=0,sens=.0015;
 const old=globalThis.window;globalThis.window={matchMedia:()=>({matches:false})};
 try{
  bindAimWheel({element,canAim:()=>true,getAngle:()=>angle,setAngle:n=>{angle=n;},getSensitivity:()=>sens});
  const ev=y=>({pointerId:1,clientY:y,clientX:0,preventDefault(){}});
  listeners.pointerdown(ev(100));listeners.pointermove(ev(150));const coarse=angle;listeners.pointerup(ev(150));
  angle=0;sens=.0006;listeners.pointerdown(ev(100));listeners.pointermove(ev(150));
  assert.ok(Math.abs(angle)<Math.abs(coarse));
 }finally{if(old===undefined)delete globalThis.window;else globalThis.window=old;}
});
