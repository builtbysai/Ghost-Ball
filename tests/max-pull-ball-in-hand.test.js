import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPower,alignedMaxPull,safePowerRelease} from '../src/touch-controls.js';
import {cuePlacementDraft,initialCuePlacement} from '../src/placement-guide.js';
import {Simulation,makeBall} from '../src/physics.js';

function rail(rotated=false){
 const rect=rotated
  ?{left:10,right:230,top:10,bottom:58,width:220,height:48}
  :{left:10,right:58,top:10,bottom:230,width:48,height:220};
 const listeners=new Map(),classes=new Set(),attrs=new Map();
 let shots=0,cancels=0,power=0;
 const track={
  clientHeight:220,
  classList:{add:c=>classes.add(c),remove:(...v)=>v.forEach(x=>classes.delete(x)),toggle:(c,yes)=>yes?classes.add(c):classes.delete(c)},
  style:{setProperty:()=>{}},
  setAttribute:(k,v)=>attrs.set(k,v),
  getBoundingClientRect:()=>rect,
  addEventListener:(k,fn)=>listeners.set(k,fn),
  setPointerCapture:()=>{},
  releasePointerCapture:()=>{}
 };
 const handle={getBoundingClientRect:()=>rotated?{width:34,height:48}:{width:48,height:34}};
 const oldWindow=globalThis.window;
 globalThis.window={matchMedia:()=>({matches:rotated})};
 try{
  const binding=bindPower({track,handle,canShoot:()=>true,onPower:n=>power=n,onShoot:()=>{shots++;return true;},onCancel:()=>{cancels++;}});
  const start=rotated?{x:210,y:32}:{x:32,y:30};
  const event=(x,y)=>({pointerId:7,clientX:x,clientY:y,preventDefault:()=>{}});
  return {rect,start,event,listeners,classes,attrs,binding,stats:()=>({shots,cancels,power}),
   restore:()=>{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}};
 }catch(err){
  if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
  throw err;
 }
}
for(const rotated of [false,true]){
 test(`max-power overpull fires exactly once without pointerup (${rotated?'rotated':'landscape'})`,()=>{
  const f=rail(rotated);
  try{
   f.listeners.get('pointerdown')(f.event(f.start.x,f.start.y));
   const towardEnd=rotated?f.event(14,32):f.event(32,226);
   f.listeners.get('pointermove')(towardEnd);
   assert.equal(f.stats().shots,1,'shot fires at rail end before physical pointer loss');
   assert.ok(f.stats().power>=.96,'full power was committed');
   f.listeners.get('pointerup')(towardEnd);
   f.listeners.get('pointercancel')(towardEnd);
   assert.equal(f.stats().shots,1,'follow-up end events never duplicate shots');
  }finally{f.restore();}
 });
 test(`full pull released beyond end remains valid (${rotated?'rotated':'landscape'})`,()=>{
  const f=rail(rotated);
  try{
   f.listeners.get('pointerdown')(f.event(f.start.x,f.start.y));
   const outside=rotated?f.event(-18,32):f.event(32,270);
   f.listeners.get('pointerup')(outside);
   assert.equal(f.stats().shots,1);
   assert.equal(f.stats().cancels,0);
  }finally{f.restore();}
 });
 test(`cross-lane and system-canceled pulls stay safe (${rotated?'rotated':'landscape'})`,()=>{
  const f=rail(rotated);
  try{
   f.listeners.get('pointerdown')(f.event(f.start.x,f.start.y));
   const cross=rotated?f.event(13,145):f.event(145,226);
   f.listeners.get('pointermove')(cross);
   assert.equal(f.stats().shots,0,'sideways movement must never auto-fire');
   f.listeners.get('pointerup')(cross);
   assert.equal(f.stats().shots,0);
   f.listeners.get('pointerdown')(f.event(f.start.x,f.start.y));
   const charged=rotated?f.event(42,32):f.event(32,198);
   f.listeners.get('pointermove')(charged);
   f.listeners.get('pointercancel')(charged);
   assert.equal(f.stats().shots,0,'system cancellation is not a player release');
  }finally{f.restore();}
 });
}
test('directional release differs from accidentally leaving the hit target',()=>{
 const r={left:10,right:58,top:10,bottom:230};
 assert.equal(safePowerRelease({x:32,y:268},r),false);
 assert.equal(alignedMaxPull({x:32,y:268},r),true);
 assert.equal(alignedMaxPull({x:145,y:268},r),false);
 assert.equal(alignedMaxPull({x:-3,y:32},r,{rotated:true}),true);
 assert.equal(alignedMaxPull({x:-3,y:145},r,{rotated:true}),false);
});
test('ball-in-hand draft has one legal candidate and never changes physics',()=>{
 const sim=new Simulation([makeBall(0,250,250),makeBall(1,500,250)]);
 const before=sim.snapshot();
 const direct=cuePlacementDraft(sim,400,300);
 assert.deepEqual(direct.candidate,{x:400,y:300});
 assert.equal(direct.suggestion,null);
 const blocked=cuePlacementDraft(sim,500,250);
 assert.equal(blocked.legal,false);
 assert.ok(blocked.suggestion&&blocked.candidate);
 assert.ok(sim.canPlaceCue(blocked.candidate.x,blocked.candidate.y));
 assert.deepEqual(sim.snapshot(),before,'preview must not place an actual ball');
});
test('default cue ghost remains available after a scratch and break restriction is kept',()=>{
 const sim=new Simulation([makeBall(0,1000,500),makeBall(1,240,250)]);
 sim.cue().pocketed=true;
 const result=initialCuePlacement(sim);
 assert.ok(result?.candidate&&sim.canPlaceCue(result.candidate.x,result.candidate.y));
 const restricted=cuePlacementDraft(sim,600,250,{breakOnly:true});
 assert.equal(restricted.candidate,null,'far side cannot be selected during the break');
});
