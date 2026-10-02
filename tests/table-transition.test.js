import test from 'node:test';
import assert from 'node:assert/strict';
import {movingRack,smooth} from '../src/table-transition.js';
import {rack} from '../src/physics.js';

test('live exhibition balls gather into exactly the playable opening rack',()=>{
 const old=[{id:0,x:250,y:240,rotation:1},{id:1,x:830,y:400,rotation:2},{id:2,x:30,y:15,pocketed:true,rotation:1}];
 const rack=[{id:0,x:225,y:250},{id:1,x:750,y:250},{id:2,x:772,y:235}];
 const start=movingRack(old,rack,0),middle=movingRack(old,rack,.6),end=movingRack(old,rack,1);
 assert.deepEqual(start.map(b=>[b.x,b.y]),old.map(b=>[b.x,b.y]));
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
   if(a.opacity<.12||b.opacity<.12)continue;
   const gap=Math.hypot(a.x-b.x,a.y-b.y);
   assert.ok(gap>=23.95,`balls ${a.id} and ${b.id} overlap at ${t}: ${gap}`);
  }
  assert.deepEqual(movingRack(before,target,t),positions,'animation must not depend on frame history');
 }
});
