import test from 'node:test';
import assert from 'node:assert/strict';
import {pullPower,wheelAngle,spinFromPoint,cueShaftHit,rearAimAngle,wrapAngle} from '../src/touch-controls.js';
import {Game} from '../src/game.js';
import {Simulation,makeBall,TABLE} from '../src/physics.js';
test('downward pull is zero above start and clamps to full travel',()=>{
 assert.equal(pullPower(100,80,120),0);assert.equal(pullPower(100,160,120),.5);assert.equal(pullPower(100,240,120),1);
});
test('precision aiming responds in opposite directions and always wraps',()=>{
 const a=wheelAngle(0,25),b=wheelAngle(0,-25);
 assert.ok(a<0&&b>0);assert.ok(Math.abs(a+b)<1e-12);
 assert.ok(Math.abs(wheelAngle(Math.PI-.01,-20))<=Math.PI);
});
test('spin contact clamps into unit circle and respects top/right',()=>{
 const r={left:0,top:0,width:200,height:200};
 assert.deepEqual(spinFromPoint(100,100,r),{x:0,y:0});
 assert.ok(spinFromPoint(100,25,r).y>.8);
 assert.ok(spinFromPoint(180,100,r).x>.9);
 const edge=spinFromPoint(1000,-1000,r);
 assert.ok(Math.hypot(edge.x,edge.y)<=1.01);
});
test('break cue ball moves only in head area before first shot',()=>{
 const g=new Game({kind:'match',seed:5});
 assert.equal(g.placeBreakCue(200,300),true);
 assert.equal(g.sim.cue().x,200);
 assert.equal(g.placeBreakCue(400,300),false);
 assert.equal(g.beginShot(0,.3,{x:.2,y:0}),true);
 assert.equal(g.placeBreakCue(170,150),false);
});
test('a 2-axis spin shot records finite states and changes follow behavior',()=>{
 function setup(vertical){const sim=new Simulation([makeBall(0,300,250),makeBall(1,420,250)]);
  assert.equal(sim.strike(0,.32,{x:.14,y:vertical}),true);
  let impacted=false;
  for(let i=0;i<170;i++){const ev=sim.step();if(ev.some(e=>e.type==='contact')){impacted=true;break;}}
  assert.equal(impacted,true);
  assert.ok(sim.balls.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.vx)&&Number.isFinite(b.vy)));
  return sim.cue().vx;}
 const top=setup(.8),bottom=setup(-.8);
 assert.ok(top>bottom,`top ${top} should be ahead of bottom ${bottom}`);
});

test('cue only grabs behind its ball and within the visible shaft',()=>{
 const ball={x:100,y:100},tip={x:78,y:100},butt={x:8,y:100};
 assert.equal(cueShaftHit({x:45,y:115},ball,tip,butt,20),true);
 assert.equal(cueShaftHit({x:140,y:100},ball,tip,butt,30),false);
 assert.equal(cueShaftHit({x:45,y:150},ball,tip,butt,20),false);
 assert.equal(cueShaftHit({x:45,y:115},ball,tip,butt,10),false);
});
test('rear cue dragging has the inverse shot bearing without angle jumps',()=>{
 const cue={x:200,y:100};
 assert.equal(rearAimAngle(cue,{x:100,y:100}),0);
 assert.ok(Math.abs(rearAimAngle(cue,{x:200,y:160})+Math.PI/2)<1e-10);
 const across=wrapAngle(wrapAngle(-Math.PI+.02)-wrapAngle(Math.PI-.02));
 assert.ok(Math.abs(across-.04)<1e-10);
});
