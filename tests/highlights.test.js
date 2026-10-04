import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeShot,decodeShot,addHighlight,validHighlights,MAX_HIGHLIGHTS} from '../src/highlights.js';
import {freshProgress,readLocalProgress,writeLocalProgress} from '../src/player-progress.js';
import {rack,Simulation} from '../src/physics.js';
import {Game} from '../src/game.js';

const sample=()=>({balls:rack(3),angle:.12,power:.8,spin:{x:.2,y:-.1},room:2,ruleset:'eight',pots:3});
test('a shot code round-trips and replays to exactly the same table',()=>{
 const shot=sample(),code=encodeShot(shot);
 assert.ok(code.startsWith('GB1.')&&code.length<2000);
 const back=decodeShot(code);assert.ok(back);
 assert.equal(back.balls.length,16);assert.equal(back.room,2);assert.equal(back.pots,3);
 const a=new Simulation(shot.balls.map(b=>({...b}))),b=new Simulation(back.balls);
 for(const sim of [a,b]){sim.strike(.12,.8,{x:.2,y:-.1});let k=0;while(sim.moving&&k++<12000)sim.step();}
 const rounded=sim=>sim.balls.map(x=>[x.id,x.pocketed,x.x,x.y]);
 assert.deepEqual(rounded(b),rounded(a));
});
test('malformed, oversized or out-of-range codes are refused',()=>{
 for(const bad of ['','nonsense','GB1.','GB1.@@@','GB1.'+btoa('{"v":2}'),'GB1.'+'A'.repeat(5000)])assert.equal(decodeShot(bad),null);
 const forge=patch=>'GB1.'+btoa(JSON.stringify({v:1,r:0,g:'eight',p:1,a:0,w:.5,s:[0,0],b:[[0,100,100,0],[1,200,200,0]],...patch}));
 assert.ok(decodeShot(forge({})));
 assert.equal(decodeShot(forge({w:9})),null);
 assert.equal(decodeShot(forge({b:[[1,200,200,0],[2,300,300,0]]})),null,'the cue ball must be present');
 assert.equal(decodeShot(forge({b:[[0,100,100,0],[0,200,200,0]]})),null,'no duplicate ids');
 assert.equal(decodeShot(forge({b:[[0,1e9,100,0],[1,200,200,0]]})),null);
});
test('highlights are kept best-first, one per match, capped, and survive a reload',()=>{
 let p=freshProgress();const code=encodeShot(sample());
 for(let i=0;i<MAX_HIGHLIGHTS+4;i++)p=addHighlight(p,{id:'m'+i,at:`2026-10-04T10:${String(i).padStart(2,'0')}:00Z`,pots:2+(i%4),ruleset:'eight',room:1,shot:code});
 assert.equal(p.highlights.length,MAX_HIGHLIGHTS);
 assert.ok(p.highlights[0].pots>=p.highlights.at(-1).pots);
 p=addHighlight(p,{id:'m3',at:'2026-10-05T00:00:00Z',pots:9,ruleset:'eight',room:1,shot:code});
 assert.equal(p.highlights.filter(h=>h.id==='m3').length,1);assert.equal(p.highlights[0].id,'m3');
 assert.equal(addHighlight(p,{id:'x',at:'2026',pots:2,ruleset:'eight',room:0,shot:'GB1.bad'}),p,'an invalid code is not saved');
 const values=new Map();const store={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 assert.ok(writeLocalProgress(p,()=>store));
 assert.equal(readLocalProgress(()=>store).progress.highlights.length,MAX_HIGHLIGHTS);
 assert.equal(validHighlights([{id:'a'}]),false);
});
test('a match remembers its best multi-ball shot',()=>{
 const g=new Game({kind:'match',players:'local',seed:2});
 g.beginShot(0,1);let k=0;while(g.turnShot&&k++<12000)g.step();
 // the break pots at least one ball for some seeds; force a two-ball shot through the referee instead
 g.break=false;g.turn=0;g.lastShot={...g.lastShot,turn:0};
 g.turnShot={first:1,pots:[1,2],potRecords:[],rail:true,groupAtStart:'open'};g.resolve();
 assert.equal(g.bestShot.pots,2);
 g.turnShot={first:1,pots:[3],potRecords:[],rail:true,groupAtStart:'open'};g.resolve();
 assert.equal(g.bestShot.pots,2,'a smaller shot never replaces it');
});
