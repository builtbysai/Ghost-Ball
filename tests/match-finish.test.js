import test from 'node:test';
import assert from 'node:assert/strict';
import {decisiveShot,POCKET_LABELS} from '../src/match-finish.js';
test('the deciding shot is grounded only in terminal actual referee rulings',()=>{
 assert.equal(POCKET_LABELS.length,6);
 assert.equal(decisiveShot([]),null);
 assert.equal(decisiveShot([{kind:'ruling',result:'retain',reason:'eight-cleared'}]),null);
 const legal={kind:'ruling',result:'end',reason:'eight-cleared',potRecords:[{id:8,pocket:2}]};
 assert.deepEqual(decisiveShot([{kind:'ruling',result:'retain',reason:'pot'},legal]),
  {label:'EIGHT · TOP RIGHT',pocket:2,clean:true});
 assert.deepEqual(decisiveShot([{...legal,potRecords:[]}]),
  {label:'CLEAN EIGHT',pocket:null,clean:true});
 assert.deepEqual(decisiveShot([{...legal,potRecords:[{id:8,pocket:99}]}]),
  {label:'CLEAN EIGHT',pocket:null,clean:true});
 for(const reason of ['early-eight','scratch-on-eight','wrong-ball-first']){
  const outcome=decisiveShot([{...legal,reason}]);
  assert.equal(outcome.clean,false);
  assert.equal(outcome.pocket,null,'an illegal finish never highlights a victory pocket');
 }
 assert.equal(decisiveShot([{kind:'ruling',result:'end',reason:'fictional'}]),null);
});
