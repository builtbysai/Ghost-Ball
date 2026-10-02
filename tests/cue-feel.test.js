import test from 'node:test';
import assert from 'node:assert/strict';
import {cueGeometry,cueDrawback,strokeCharge,tensionStage} from '../src/cue-feel.js';
import {cueShaftHit} from '../src/touch-controls.js';
import {cameraFlight,movingRack} from '../src/table-transition.js';
test('charged cue moves backward along one axis and shaft hit matches the geometry',()=>{
 const cue={x:250,y:250},idle=cueGeometry(cue,0,0),half=cueGeometry(cue,0,.5),full=cueGeometry(cue,0,1);
 assert.equal(idle.gap,18);
 assert.ok(half.gap>idle.gap+60&&full.gap>idle.gap+160);
 assert.ok(idle.tip.x>half.tip.x&&half.tip.x>full.tip.x);
 assert.equal(cueShaftHit({x:half.tip.x-12,y:250},cue,half.tip,half.butt,14),true);
 assert.equal(cueShaftHit({x:280,y:250},cue,half.tip,half.butt,30),false);
});
test('release accelerates quickly toward contact without any lingering draw',()=>{
 assert.equal(strokeCharge(0,.8),.8);
 assert.ok(strokeCharge(.2,.8)<.4);
 assert.equal(strokeCharge(.76,.8),0);
 assert.equal(strokeCharge(1,.8),0);
 assert.equal(cueDrawback(0),0);
 assert.deepEqual([.05,.27,.51,.76,.97].map(tensionStage),[0,1,2,3,4]);
});
test('intro camera and moving rack reach the same final geometry from live positions',()=>{
 const start=[{id:0,x:240,y:250,pocketed:false},{id:1,x:800,y:80,pocketed:false},{id:2,x:10,y:10,pocketed:true}];
 const finish=[{id:0,x:252,y:250},{id:1,x:718,y:250},{id:2,x:740,y:238}];
 assert.equal(cameraFlight(0).travel,0);assert.equal(cameraFlight(1).flatten,1);
 assert.ok(cameraFlight(.53).lift>.75);
 const mid=movingRack(start,finish,.55),end=movingRack(start,finish,1);
 assert.ok(mid.some(b=>b.trail&&b.trail.opacity>0));
 assert.ok(mid.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y)));
 assert.deepEqual(end.map(b=>[b.x,b.y]),finish.map(b=>[b.x,b.y]));
 assert.equal(end[2].opacity,1);
});
