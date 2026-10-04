import test from 'node:test';
import assert from 'node:assert/strict';
import {CRESTS,crestSummary} from '../src/crests.js';
import {freshProgress,recordLiveMatch} from '../src/player-progress.js';

const win=(p,extra)=>recordLiveMatch(p,{kind:'match',source:'live',id:'m'+Math.random(),at:'2026-10-04T10:00:00Z',shots:30,winner:0,
 players:'cpu',difficulty:'club',persona:'vera',room:1,reason:'eight-cleared',bestRun:3,ruleset:'eight',official:false,...extra});

test('a fresh player has no crests and every crest has a name and a hint',()=>{
 const s=crestSummary(freshProgress());
 assert.equal(s.earned,0);assert.equal(s.total,CRESTS.length);
 for(const c of CRESTS)assert.ok(c.name&&c.hint&&typeof c.test==='function');
});
test('crests come only from real, recorded results',()=>{
 let p=win(freshProgress(),{official:true});
 let ids=new Set(crestSummary(p).list.filter(c=>c.earned).map(c=>c.id));
 assert.ok(ids.has('first-match')&&ids.has('official')&&ids.has('vera'));
 assert.ok(!ids.has('nine')&&!ids.has('dex')&&!ids.has('run-5'));
 p=win(p,{ruleset:'nine',reason:'nine-potted',bestRun:6,persona:'dex',difficulty:'rookie'});
 ids=new Set(crestSummary(p).list.filter(c=>c.earned).map(c=>c.id));
 assert.ok(ids.has('nine')&&ids.has('dex')&&ids.has('run-5'));
 // a loss earns nothing for the winning crest
 const lost=win(freshProgress(),{winner:1,ruleset:'straight',reason:'race-won'});
 assert.ok(!crestSummary(lost).list.find(c=>c.id==='straight').earned);
});
