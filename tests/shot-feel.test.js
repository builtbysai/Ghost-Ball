import test from 'node:test';
import assert from 'node:assert/strict';
import {cueGeometry,tensionStage,strokeOffset} from '../src/shot-feel.js';
import {entrancePose} from '../src/table-transition.js';

test('rear cue setback spans a clearly visible distance and stays monotonic',()=>{
 const near=cueGeometry(12,0),mid=cueGeometry(12,.5),far=cueGeometry(12,1);
 assert.ok(mid.gap>near.gap+50);
 assert.ok(far.gap>mid.gap+50);
 assert.equal(far.reach-far.gap,355);
 assert.equal(mid.grip-mid.gap,243);
 assert.ok(cueGeometry(12,-1).gap===near.gap&&cueGeometry(12,2).gap===far.gap);
});
test('small distinct haptic detents only occur at useful power thresholds',()=>{
 assert.deepEqual([0,.26,.27,.54,.55,.81,.82,1].map(tensionStage),[0,0,1,1,2,2,3,3]);
});
test('the striking shaft goes forward and rebounds without changing physics',()=>{
 assert.equal(strokeOffset(0,.8),0);
 assert.ok(strokeOffset(.39,.8)>strokeOffset(.15,.8));
 assert.ok(strokeOffset(.6,.8)<strokeOffset(.39,.8));
});
test('camera flight begins and finishes exactly at the visual table destination',()=>{
 const begin=entrancePose(0,false),lift=entrancePose(.5,false),end=entrancePose(1,false);
 assert.equal(begin.travel,0);assert.equal(begin.unroll,0);
 assert.equal(end.travel,1);assert.equal(end.unroll,1);
 assert.equal(end.rotation,0);assert.equal(end.scale,1);assert.ok(Math.abs(end.lift)<1e-9);
 assert.ok(lift.lift<0&&lift.scale>1&&lift.rotation>0);
 assert.equal(entrancePose(1,true).rotation,-90);
});