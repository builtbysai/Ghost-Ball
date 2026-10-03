import test from 'node:test';
import assert from 'node:assert/strict';
import {impactEffectFor} from '../src/impact-effects.js';
import {Game} from '../src/game.js';
const sim={balls:[{id:0,x:100,y:100,pocketed:false},{id:1,x:124,y:100,pocketed:false}]};
test('impact FX need measurable real impulse, exclude jaw and stay bounded',()=>{
 assert.equal(impactEffectFor({type:'contact',a:0,b:1,speed:159},sim),null);
 assert.equal(impactEffectFor({type:'rail',id:1,speed:1000,jaw:true},sim),null);
 assert.equal(impactEffectFor({type:'contact',a:0,b:7,speed:1000},sim),null);
 assert.deepEqual(impactEffectFor({type:'contact',a:0,b:1,speed:625},sim),
  {type:'impact',x:112,y:100,strength:.5,life:1});
 assert.equal(impactEffectFor({type:'rail',id:1,speed:14000},sim).strength,1);
 assert.equal(impactEffectFor({type:'contact',a:0,b:1,speed:Infinity},sim),null);
});
test('a genuine shot yields short-lived impact marks without changing the ruling',()=>{
 const g=new Game({kind:'drill',drillId:'center-drop',seed:17});
 assert.equal(g.beginShot(-Math.PI/2,.53,{x:0,y:0}),true);
 let seen=false;
 for(let i=0;i<3000&&g.turnShot;i++){
  g.step();seen=seen||g.fx.some(mark=>mark.type==='impact');
  assert.ok(g.fx.length<=10,'do not allocate unlimited simultaneous effects');
  g.update(1/240);
 }
 assert.ok(seen,'physical cue/object contact should show an impact');
 assert.equal(g.drillOutcome,'completed');
 assert.equal(g.history.at(-1).status,'completed');
});
