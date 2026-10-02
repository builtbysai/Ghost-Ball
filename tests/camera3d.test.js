import test from 'node:test';
import assert from 'node:assert/strict';
import {TableCamera3D} from '../src/camera3d.js';
for (const [w,h] of [[320,350],[390,545],[844,225],[1180,530]]){
 test(`WebGL camera ray-to-felt matches projected positions at ${w}x${h}`,()=>{
  const camera=new TableCamera3D(w,h);
  for(const [x,y] of [[12,12],[500,250],[988,488],[100,350],[880,80]]){
   // Input projects to cloth (y=0), never the lifted center of a ball.
   const {sx,sy}=camera.projectWorld(camera.toWorld(x,y,0));
   const a=camera.unproject(sx,sy);
   assert.ok(Math.abs(a.x-x)<1e-8 && Math.abs(a.y-y)<1e-8,`${x},${y} -> ${a.x},${a.y}`);
  }
  const p=camera.portrait;assert.equal(p,w<=600&&h>w*1.24);
  const [x,,z]=camera.toWorld(750,150);assert.deepEqual(camera.fromWorld(x,z),{x:750,y:150});
 });
}
const apply=(m,v)=>[0,1,2,3].map(row=>m[row]*v[0]+m[4+row]*v[1]+m[8+row]*v[2]+m[12+row]*v[3]);
for(const [w,h] of [[390,545],[844,225]]){
 test(`GPU camera matrices and JS picking projection match at ${w}x${h}`,()=>{
  const c=new TableCamera3D(w,h);
  for(const pos of [[0,0,0],c.toWorld(500,250,.14),c.toWorld(950,35,0),c.toWorld(50,490,.18)]){
   const clip=apply(c.projection,apply(c.view,[...pos,1]));
   const {sx,sy}=c.projectWorld(pos);
   const nx=clip[0]/clip[3],ny=clip[1]/clip[3];
   assert.ok(Math.abs(nx-(sx/w*2-1))<1e-6,`x mismatch ${nx} vs ${sx/w*2-1}`);
   assert.ok(Math.abs(ny-(1-sy/h*2))<1e-6,`y mismatch ${ny} vs ${1-sy/h*2}`);
  }
 });
}
