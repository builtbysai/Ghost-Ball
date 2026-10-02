import test from 'node:test';
import assert from 'node:assert/strict';
import {TableRenderer} from '../src/render.js';
const cases=[
 {size:[366,534],portrait:true},
 {size:[296,315],portrait:false},
 {size:[820,225],portrait:false},
 {size:[1180,510],portrait:false},
];
for(const view of ['flat','perspective'])for(const entry of cases){
 test(`${view} projection round-trips for ${entry.size.join('x')}`,()=>{
   const r=Object.create(TableRenderer.prototype);
   [r.w,r.h]=entry.size;r.view=view;r.geometry();
   assert.equal(r.portrait,entry.portrait);
   const pts=[[0,0],[1000,0],[1000,500],[0,500],[250,250],[500,100],[800,410]];
   for(const [x,y] of pts){
     const [sx,sy]=r.project(x,y),result=r.unproject(sx,sy);
     assert.ok(Math.abs(result.x-x)<1e-8&&Math.abs(result.y-y)<1e-8,
       `${view}: ${x},${y} mapped to ${result.x},${result.y}`);
   }
 });
}
