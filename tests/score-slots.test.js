import test from 'node:test';import assert from 'node:assert/strict';
import {slotModels,eightSlotModel,SOLIDS,STRIPES} from '../src/score-slots.js';
test('open table shows neutral ghost slots, never numbered sample balls',()=>{
 for(const player of [0,1]){
  const slots=slotModels([null,null],player,[3,12]);
  assert.equal(slots.length,7);
  assert.ok(slots.every(slot=>slot.ghost&&slot.id===null&&slot.color===null&&!slot.pocketed));
 }
});
test('assigned groups show correct numbers regardless of which player owns solids',()=>{const a=slotModels(['stripes','solids'],0,[9,12]),b=slotModels(['stripes','solids'],1,[2]);assert.deepEqual(a.map(x=>x.id),STRIPES);assert.deepEqual(b.map(x=>x.id),SOLIDS);assert.deepEqual(a.filter(x=>x.pocketed).map(x=>x.id),[9,12]);assert.deepEqual(b.filter(x=>x.pocketed).map(x=>x.id),[2]);assert.ok(a.every(x=>!x.preview&&!x.ghost));});
test('both players have seven independent slots in every state',()=>{for(const groups of [[null,null],['solids','stripes'],['stripes','solids']])for(const p of [0,1]){const a=slotModels(groups,p,[1,15]);assert.equal(a.length,7);if(groups[p])assert.ok(new Set(a.map(x=>x.id)).size===7&&a.every(x=>x.color.startsWith('#')))}});
test('the 8-ball slot wakes only once the player has cleared their group',()=>{
 const base={groups:['solids','stripes'],pocketed:[],over:false,winner:null,legalEight:false};
 assert.equal(eightSlotModel(base,0).state,'inactive');
 assert.equal(eightSlotModel({...base,groups:[null,null]},0).state,'inactive');
 assert.equal(eightSlotModel({...base,pocketed:SOLIDS},0).state,'active');
 assert.equal(eightSlotModel({...base,pocketed:SOLIDS},1).state,'inactive');
 assert.equal(eightSlotModel({...base,pocketed:[...SOLIDS,8]},0).state,'inactive','a pocketed 8 is not "on the 8"');
});
test('a legal 8-ball finish is shown pocketed in the winner slot only',()=>{
 const done={groups:['solids','stripes'],pocketed:[...SOLIDS,8],over:true,winner:0,legalEight:true};
 assert.equal(eightSlotModel(done,0).state,'pocketed');
 assert.equal(eightSlotModel(done,1).state,'inactive');
 assert.equal(eightSlotModel({...done,legalEight:false},0).state,'inactive');
});
