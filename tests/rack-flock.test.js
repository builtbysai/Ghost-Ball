import test from 'node:test';
import assert from 'node:assert/strict';
import {planFlock,flockAt,GATE} from '../src/rack-flock.js';
import {rack,TABLE} from '../src/physics.js';
import {Game} from '../src/game.js';

const target=rack(3);
const scatter=target.map(b=>b.id===0?{...b,x:230,y:230}:{...b,x:405+(b.id-1)%5*105,y:94+Math.floor((b.id-1)/5)*127});
const gaps=poses=>{let min=Infinity;for(let i=0;i<poses.length;i++)for(let j=i+1;j<poses.length;j++){
 if(poses[i].opacity<.1||poses[j].opacity<.1)continue;min=Math.min(min,Math.hypot(poses[i].x-poses[j].x,poses[i].y-poses[j].y));}return min;};

test('a flock ends exactly on the rack and starts exactly where the balls were',()=>{
 const plan=planFlock(scatter,target);
 const start=flockAt(plan,0),end=flockAt(plan,1);
 assert.deepEqual(start.map(b=>[b.x,b.y]),scatter.map(b=>[b.x,b.y]));
 assert.deepEqual(end.map(b=>[b.x,b.y]),target.map(b=>[b.x,b.y]));
 assert.ok(end.every(b=>b.opacity===1&&b.pocketed===false));
});
test('no two visible balls overlap at any moment of the gather',()=>{
 for(const before of [scatter,target.map((b,i)=>i&&i<9?{...b,pocketed:true}:{...b,x:100+i*50,y:250})]){
  const plan=planFlock(before,target);
  for(let n=0;n<=400;n++)assert.ok(gaps(flockAt(plan,n/400))>=23.5,`overlap at ${n/400}`);
 }
});
test('every ball lands: the motion settles naturally from a real break aftermath',()=>{
 const g=new Game({kind:'match',players:'local',seed:5});g.beginShot(0,.9);
 let n=0;while(g.turnShot&&n++<9000)g.step();
 const plan=planFlock(g.sim.snapshot().balls,target);
 assert.equal(plan.settledNaturally,true);
 assert.ok(plan.frames.length>30&&plan.frames.length<500);
});
test('returned balls enter at the gate one after another and fade in',()=>{
 const before=target.map(b=>({...b,pocketed:b.id>0&&b.id<6}));
 const plan=planFlock(before,target);
 const first=flockAt(plan,0);
 for(const b of first.filter(p=>p.id>0&&p.id<6)){
  assert.ok(Math.hypot(b.x-GATE.x,b.y-GATE.y)<12,'starts at the return gate');
  assert.equal(b.opacity,0);
 }
 const mid=flockAt(plan,.5);
 assert.ok(mid.some(p=>p.id>0&&p.id<6&&p.opacity>0),'returning balls become visible during the gather');
});
test('balls stay on the cloth and moving balls roll with a changing orientation',()=>{
 const plan=planFlock(scatter,target);
 for(const pose of plan.frames.flat()){
  assert.ok(pose.x>=TABLE.radius-1e-6&&pose.x<=TABLE.width-TABLE.radius+1e-6);
  assert.ok(pose.y>=TABLE.radius-1e-6&&pose.y<=TABLE.height-TABLE.radius+1e-6);
  assert.ok(pose.orientation.length===4&&pose.orientation.every(Number.isFinite));
 }
 const mid=flockAt(plan,.4).find(b=>b.id===1);
 assert.notDeepEqual(mid.orientation,[1,0,0,0]);
});
test('the plan is deterministic',()=>{
 assert.deepEqual(planFlock(scatter,target).frames,planFlock(scatter,target).frames);
});
