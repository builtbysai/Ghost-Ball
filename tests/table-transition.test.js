import test from 'node:test';
import assert from 'node:assert/strict';
import {movingRack,smooth} from '../src/table-transition.js';
import {rack} from '../src/physics.js';

test('live exhibition balls gather into exactly the playable opening rack',()=>{
 const old=[{id:0,x:250,y:240,rotation:1},{id:1,x:830,y:400,rotation:2},{id:2,x:30,y:15,pocketed:true,rotation:1}];
 const rack=[{id:0,x:225,y:250},{id:1,x:750,y:250},{id:2,x:772,y:235}];
 const start=movingRack(old,rack,0),middle=movingRack(old,rack,.6),end=movingRack(old,rack,1);
 assert.deepEqual(start.slice(0,2).map(b=>[b.x,b.y]),old.slice(0,2).map(b=>[b.x,b.y]));
 assert.deepEqual(end.map(b=>[b.x,b.y]),rack.map(b=>[b.x,b.y]));
 assert.ok(end.every(b=>b.pocketed===false));
 assert.ok(middle.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y)));
 assert.equal(start[2].opacity,0);
 assert.equal(end[2].opacity,1);
});
test('table flight camera easing is clamped, monotonic and reaches both end positions',()=>{
 assert.equal(smooth(-1),0);assert.equal(smooth(0),0);
 assert.equal(smooth(1),1);assert.equal(smooth(5),1);
 assert.ok(smooth(.2)<smooth(.5)&&smooth(.5)<smooth(.8));
});

test('gathering balls keep their physical footprint throughout the transition',()=>{
 const target=rack(3);
 // Begin with deliberately dispersed but non-overlapping positions.
 const before=target.map(ball=>ball.id===0?{...ball,x:230,y:230}:{
   ...ball,x:405+(ball.id-1)%5*105,y:94+Math.floor((ball.id-1)/5)*127
 });
 for(let n=0;n<=40;n++){
  const t=n/40,positions=movingRack(before,target,t);
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
   const a=positions[i],b=positions[j];
   if(a.opacity<.1||b.opacity<.1)continue;
   const gap=Math.hypot(a.x-b.x,a.y-b.y);
   assert.ok(gap>=23.5,`balls ${a.id} and ${b.id} overlap at ${t}: ${gap}`);
  }
  assert.deepEqual(movingRack(before,target,t),positions,'animation must not depend on frame history');
 }
});

test('gathering balls roll along the curved transition and end with portable orientation',()=>{
 const old=[{id:0,x:240,y:250,rotation:0,orientation:[1,0,0,0]},{id:1,x:410,y:135,rotation:0,orientation:[1,0,0,0]}];
 const target=[{id:0,x:225,y:250,rotation:0,orientation:[1,0,0,0]},{id:1,x:760,y:250,rotation:0,orientation:[1,0,0,0]}];
 const mid=movingRack(old,target,.65),end=movingRack(old,target,1);
 assert.notDeepEqual(mid[1].orientation,[1,0,0,0]);
 assert.ok(mid[1].rotation>0);
 assert.deepEqual(end.map(b=>[b.x,b.y]),target.map(b=>[b.x,b.y]));
 assert.ok(end.every(b=>b.orientation.length===4&&b.orientation.every(Number.isFinite)));
 assert.deepEqual(movingRack(old,target,.65),mid,'rolling animation remains deterministic');
});
