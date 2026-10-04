import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPower,bindAimWheel,aimStep,keyPullAmount,AIM_STEP,AIM_FINE_STEP,
 KEY_PULL_SECONDS,KEY_PULL_MIN_HOLD} from '../src/touch-controls.js';
import {Game} from '../src/game.js';

function fakeTrack(){
 const listeners=new Map(),classes=new Set(),attrs=new Map();
 const track={
  clientHeight:200,classList:{add:c=>classes.add(c),remove:(...v)=>v.forEach(x=>classes.delete(x)),toggle:(c,yes)=>yes?classes.add(c):classes.delete(c)},
  style:{setProperty:()=>{}},setAttribute:(k,v)=>attrs.set(k,v),
  getBoundingClientRect:()=>({left:10,right:50,top:20,bottom:240,width:40,height:220}),
  addEventListener:(k,fn)=>listeners.set(k,fn),setPointerCapture:()=>{},releasePointerCapture:()=>{}
 };
 return {track,listeners,classes,attrs};
}
const handle={getBoundingClientRect:()=>({width:48,height:34})};

test('aim steps are a visible 2 degrees, with 0.25 degrees on Shift',()=>{
 assert.ok(Math.abs(AIM_STEP*180/Math.PI-2)<1e-9);
 assert.ok(Math.abs(AIM_FINE_STEP*180/Math.PI-.25)<1e-9);
 assert.equal(aimStep(false),AIM_STEP);
 assert.equal(aimStep(true),AIM_FINE_STEP);
 // The old step needed 1,440 presses to turn the cue once around.
 assert.equal(Math.round(2*Math.PI/AIM_STEP),180);
});

test('keyboard pull ramps linearly to full power over the hold window and clamps',()=>{
 assert.equal(keyPullAmount(0),0);
 assert.ok(Math.abs(keyPullAmount(KEY_PULL_SECONDS/2)-.5)<1e-9);
 assert.equal(keyPullAmount(KEY_PULL_SECONDS),1);
 assert.equal(keyPullAmount(30),1);
 assert.equal(keyPullAmount(-1),0,'a timestamp skew can never go negative');
 assert.ok(KEY_PULL_MIN_HOLD>=.1&&KEY_PULL_MIN_HOLD<=.2,'taps under ~150ms cancel');
});

test('the aim wheel steps 2 degrees per arrow and Shift refines to a quarter degree',()=>{
 const listeners={},element={addEventListener:(k,fn)=>listeners[k]=fn,setPointerCapture(){},releasePointerCapture(){}};
 let angle=0;
 bindAimWheel({element,canAim:()=>true,getAngle:()=>angle,setAngle:n=>{angle=n;}});
 const key=(k,shiftKey=false)=>{let prevented=false;listeners.keydown({key:k,shiftKey,preventDefault:()=>{prevented=true;}});return prevented;};
 assert.equal(key('ArrowRight'),true,'handled keys are consumed so the window handler cannot double-step');
 assert.ok(Math.abs(angle-AIM_STEP)<1e-12);
 key('ArrowLeft');key('ArrowLeft');
 assert.ok(Math.abs(angle+AIM_STEP)<1e-12,'left turns counter-clockwise, matching the window keys');
 angle=0;key('ArrowRight',true);
 assert.ok(Math.abs(angle-AIM_FINE_STEP)<1e-12);
});

test('Space on the focused power rail no longer fires; Enter still shoots at the current power',()=>{
 const f=fakeTrack();let shots=0,power=null;
 bindPower({track:f.track,handle,canShoot:()=>true,onPower:n=>{power=n;},onShoot:()=>{shots++;return true;}});
 const key=k=>{let prevented=false;f.listeners.get('keydown')({key:k,preventDefault:()=>{prevented=true;}});return prevented;};
 assert.equal(key(' '),false,'Space is owned by the hold-to-pull handler');
 assert.equal(shots,0);
 assert.equal(key('Enter'),true);
 assert.equal(shots,1);
 assert.equal(power,null,'with no pull Enter keeps the HUD power instead of forcing a minimum shot');
});

test('setProgress drives the same power HUD as a pointer pull',()=>{
 const f=fakeTrack();const pulls=[],powers=[];
 const binding=bindPower({track:f.track,handle,canShoot:()=>true,onPower:n=>powers.push(n),onPull:n=>pulls.push(n),onShoot:()=>true});
 binding.setProgress(.5);
 assert.equal(pulls.at(-1),.5);
 assert.equal(powers.at(-1),.5);
 assert.ok(f.classes.has('charging'));
 assert.equal(f.attrs.get('aria-valuenow'),'50');
 binding.reset();
 assert.equal(binding.getProgress(),0);
 assert.equal(pulls.at(-1),0);
 assert.ok(!f.classes.has('charging'));
});

test('foul and turn events carry what the recap needs: shooter, pots and reason',()=>{
 const events=[];
 const g=new Game({kind:'match',players:'local',seed:3,onTurn:e=>events.push(e)});
 g.break=false;g.groups=['solids','stripes'];
 g.turnShot={first:9,pots:[2],potRecords:[],rail:true,groupAtStart:'solids'};
 g.resolve();
 assert.equal(events.length,1);
 assert.equal(events[0].type,'foul');
 assert.equal(events[0].shooter,0);
 assert.deepEqual(events[0].potted,[2]);
 assert.equal(events[0].turn,1,'the incoming player is named separately from the shooter');
 assert.equal(events[0].ballInHand,true);
});

test('a clean pot reports the shooter keeping the table and any new assignment',()=>{
 const events=[];
 const g=new Game({kind:'match',players:'local',seed:3,onTurn:e=>events.push(e)});
 g.break=false;
 g.turnShot={first:12,pots:[12],potRecords:[],rail:true,groupAtStart:'open'};
 g.resolve();
 assert.equal(events[0].type,'turn');
 assert.equal(events[0].retain,true);
 assert.equal(events[0].shooter,0);
 assert.equal(events[0].assignment,'stripes');
 assert.deepEqual(events[0].potted,[12]);
});

test('the CPU takes a visible beat before placing ball in hand',()=>{
 const g=new Game({kind:'match',players:'cpu',seed:9});
 g.break=false;g.turn=1;g.groups=['solids','stripes'];g.ballInHand=true;g.timer=0;
 g.update(.5);
 assert.equal(g.ballInHand,true,'still pausing');
 g.update(.7);
 assert.equal(g.ballInHand,false,'then places');
});
