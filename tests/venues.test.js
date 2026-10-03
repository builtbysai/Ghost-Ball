import test from 'node:test';
import assert from 'node:assert/strict';
import {halls} from '../src/render.js';
import {FINISHES} from '../src/table-finishes.js';
import {Game} from '../src/game.js';

test('each original playable room has a complete one-to-one material finish',()=>{
 assert.equal(halls.length,5);
 assert.equal(FINISHES.length,halls.length);
 assert.equal(new Set(halls.map(h=>h.name)).size,5);
 assert.equal(new Set(halls.map(h=>h.year)).size,5);
 assert.equal(new Set(FINISHES.map(f=>f.name)).size,5);
 for(let i=0;i<halls.length;i++){
  assert.match(halls[i].felt,/^#[0-9a-f]{6}$/i);
  assert.ok(halls[i].detail.length>25);
  for(const field of ['trim','inlay','grain','cushion','pocket','light','vignette'])
   assert.match(FINISHES[i][field],/^#[0-9a-f]{6}$/i);
 }
});
test('new venues have recognizable non-recolor sight and wood treatments',()=>{
 assert.equal(halls[3].name,'The Wintergarden');
 assert.equal(halls[4].name,'The Afterhours');
 assert.equal(FINISHES[3].motif,'brass-disc');
 assert.equal(FINISHES[4].motif,'twin-bars');
 assert.notEqual(FINISHES[3].grain,FINISHES[4].grain);
 assert.notEqual(FINISHES[3].cushion,FINISHES[4].cushion);
});
test('changing a visual venue does not touch authoritative rack, seeded shots or rulings',()=>{
 const before=new Game({kind:'match',seed:123});
 const after=new Game({kind:'match',seed:123});
 const initial=before.sim.snapshot();
 for(const hall of halls){
  assert.ok(hall.felt&&hall.wood);
  assert.deepEqual(after.sim.snapshot(),initial);
 }
 for(const game of [before,after]){
  assert.equal(game.beginShot(0,.82),true);
  for(let i=0;i<5000&&game.turnShot;i++)game.step();
  assert.equal(game.turnShot,null);
 }
 assert.deepEqual(after.sim.snapshot(),before.sim.snapshot());
 assert.deepEqual(after.history,before.history);
});
