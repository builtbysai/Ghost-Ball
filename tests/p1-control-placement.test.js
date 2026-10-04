import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,makeBall} from '../src/physics.js';
import {nearbyLegalCuePlacement} from '../src/placement-guide.js';
import {safePowerRelease,bindAimWheel} from '../src/touch-controls.js';
import {Game,AI_PLACEMENT_PAUSE} from '../src/game.js';

const table=(positions)=>new Simulation([makeBall(0,240,250),...positions.map(([x,y],i)=>makeBall(i+1,x,y))]);

test('a legal drop is returned exactly without moving any balls',()=>{
 const sim=table([[500,250]]),original=sim.snapshot();
 const p=nearbyLegalCuePlacement(sim,410,220);
 assert.deepEqual(p,{x:410,y:220,distance:0,snapped:false});
 assert.deepEqual(sim.snapshot(),original,'presentation never mutates physics');
});
test('suggestion nearby a blocker is genuinely legal and remains local',()=>{
 const sim=table([[500,250]]);
 const p=nearbyLegalCuePlacement(sim,500,250);
 assert.ok(p&&p.snapped&&p.distance<=48,p);
 assert.ok(sim.canPlaceCue(p.x,p.y));
 assert.ok(Math.hypot(p.x-500,p.y-250)>=26);
});
test('break head-zone boundary is respected even near an occupied edge',()=>{
 const sim=table([[264,250]]);
 const p=nearbyLegalCuePlacement(sim,280,250,{breakOnly:true,maxDistance:48});
 assert.ok(p&&p.x<=265&&p.distance<=48,p);
 assert.ok(sim.canPlaceCue(p.x,p.y));
 assert.equal(nearbyLegalCuePlacement(sim,490,250,{breakOnly:true}),null,
  'a far-away break drop is never teleported back to the head zone');
});
test('nonfinite and unreachable drops do not produce fake legal positions',()=>{
 const sim=table([]);
 assert.equal(nearbyLegalCuePlacement(sim,NaN,250),null);
 assert.equal(nearbyLegalCuePlacement(sim,-1000,250),null);
 assert.equal(nearbyLegalCuePlacement(sim,500,Infinity),null);
});
test('power can release inside or close to the track, but not outside its lane',()=>{
 const rect={left:10,right:50,top:60,bottom:280};
 assert.equal(safePowerRelease({x:25,y:200},rect),true);
 assert.equal(safePowerRelease({x:63,y:285},rect),true);
 assert.equal(safePowerRelease({x:100,y:200},rect),false);
 assert.equal(safePowerRelease({x:25,y:335},rect),false);
 assert.equal(safePowerRelease({x:NaN,y:200},rect),false);
});
test('double tap resets aim and a drag is not mistaken for the first tap',()=>{
 const listeners={},target={
  addEventListener:(name,cb)=>listeners[name]=cb,
  setPointerCapture:()=>{},releasePointerCapture:()=>{}
 };
 const oldWindow=globalThis.window,oldNow=Date.now;
 let tick=2000,angle=.6,resets=0;
 try{
  globalThis.window={matchMedia:()=>({matches:false})};
  Date.now=()=>tick;
  bindAimWheel({element:target,canAim:()=>true,getAngle:()=>angle,
    setAngle:next=>{angle=next;},onReset:()=>{angle=0;resets++;}});
  const ev=(id,y)=>({pointerId:id,clientY:y,clientX:100,preventDefault:()=>{}});
  listeners.pointerdown(ev(1,100));listeners.pointermove(ev(1,70));listeners.pointerup(ev(1,70));
  assert.notEqual(angle,.6,'drag changes aim');
  tick+=100;listeners.pointerdown(ev(2,100));listeners.pointerup(ev(2,100));
  assert.equal(resets,0,'a drag is not a reset tap');
  tick+=80;listeners.pointerdown(ev(3,100));
  assert.equal(resets,1,'second tap recalls last angle');
  assert.equal(angle,0);
  listeners.keydown({key:'Home',preventDefault:()=>{}});
  assert.equal(resets,2,'keyboard reset is discoverable');
 }finally{Date.now=oldNow;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});
test('timeout emits structured foul event for both HUD and audio feedback',()=>{
 const events=[],game=new Game({kind:'match',players:'local',onTurn:event=>events.push(event),seed:5});
 game.update(.01);game.update(45);
 assert.deepEqual(events,[{type:'foul',reason:'shot-clock',turn:1,offender:0}]);
});
test('AI searches new legal positions if its preferred locations are occupied',()=>{
 const game=new Game({kind:'match',players:'cpu',seed:4});
 game.turn=1;game.ballInHand=true;game.break=false;
 game.sim=table([[240,250],[320,220],[360,300],[210,150]]);
 game.update(AI_PLACEMENT_PAUSE+.05);
 assert.equal(game.ballInHand,false,'the AI cannot wait indefinitely for an occupied location');
 assert.ok(game.sim.canPlaceCue(game.sim.cue().x,game.sim.cue().y));
});
test('pocket effects use event ball color and disappear quickly',()=>{
 const game=new Game({kind:'practice',seed:4});
 game.sim=table([[11,11]]);game.turnShot={first:null,pots:[],rail:false};
 game.sim.moving=true;game.step();
 assert.ok(game.fx.some(effect=>effect.type==='pocket'&&effect.color));
 game.update(.25);
 assert.ok(game.fx.every(effect=>effect.type!=='pocket'));
});
