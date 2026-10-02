import test from 'node:test';
import assert from 'node:assert/strict';
import {movingRack,smooth} from '../src/table-transition.js';

test('live exhibition balls gather into exactly the playable opening rack',()=>{
 const old=[{id:0,x:250,y:240,rotation:1},{id:1,x:830,y:400,rotation:2},{id:2,x:30,y:15,pocketed:true,rotation:1}];
 const rack=[{id:0,x:225,y:250},{id:1,x:750,y:250},{id:2,x:772,y:235}];
 const start=movingRack(old,rack,0),middle=movingRack(old,rack,.6),end=movingRack(old,rack,1);
 assert.deepEqual(start.map(b=>[b.x,b.y]),old.map(b=>[b.x,b.y]));
 assert.deepEqual(end.map(b=>[b.x,b.y]),rack.map(b=>[b.x,b.y]));
 assert.ok(end.every(b=>b.pocketed===false));
 assert.ok(middle.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y)));
});
test('table flight camera easing is clamped, monotonic and reaches both end positions',()=>{
 assert.equal(smooth(-1),0);assert.equal(smooth(0),0);
 assert.equal(smooth(1),1);assert.equal(smooth(5),1);
 assert.ok(smooth(.2)<smooth(.5)&&smooth(.5)<smooth(.8));
});
