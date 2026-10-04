import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOnePocket} from '../src/casual-rules.js';
import {Game} from '../src/game.js';
import {chooseShot,chooseAiCuePlacement} from '../src/ai.js';
import {PERSONAS} from '../src/ai-personas.js';

const owner=[3,5];
const play=(s,turn=0)=>resolveOnePocket({turn,owner,shot:{first:4,pots:[],rail:true,potRecords:[],...s}});

test('a ball in your own pocket is yours and keeps the turn',()=>{
 const r=play({pots:[4],potRecords:[{id:4,pocket:3}]});
 assert.equal(r.type,'retain');assert.deepEqual(r.credit[0],[4]);assert.equal(r.turn,0);
});
test('a ball in the opponent\'s pocket counts for them, and any other pocket spots it',()=>{
 const gift=play({pots:[4],potRecords:[{id:4,pocket:5}]});
 assert.equal(gift.type,'turn');assert.deepEqual(gift.credit[1],[4]);assert.equal(gift.turn,1);
 const stray=play({pots:[4],potRecords:[{id:4,pocket:1}]});
 assert.deepEqual(stray.spot,[4]);assert.deepEqual(stray.credit[0],[]);
});
test('a foul costs the shooter a ball and spots what they potted, but the opponent keeps theirs',()=>{
 const f=play({first:null,pots:[4,6],potRecords:[{id:4,pocket:3},{id:6,pocket:5}]});
 assert.equal(f.type,'foul');assert.equal(f.penalty,1);assert.equal(f.ballInHand,true);
 assert.deepEqual(f.spot,[4]);assert.deepEqual(f.credit[1],[6]);
 assert.equal(play({pots:[0],potRecords:[{id:0,pocket:1}]}).reason,'scratch');
});
test('one-pocket tracks credit by ball, wins at eight and a penalty puts a real ball back',()=>{
 const g=new Game({kind:'match',players:'local',ruleset:'onepocket',seed:6});
 assert.equal(g.target,8);assert.deepEqual(g.ownerPockets,[3,5]);g.break=false;
 for(let id=1;id<=3;id++){const b=g.sim.balls.find(x=>x.id===id);b.pocketed=true;}
 g.turnShot={first:1,pots:[1,2,3],potRecords:[{id:1,pocket:3},{id:2,pocket:3},{id:3,pocket:3}],rail:true,groupAtStart:'any'};g.resolve();
 assert.deepEqual(g.points,[3,0]);assert.equal(g.turn,0);
 g.turnShot={first:null,pots:[],potRecords:[],rail:false,groupAtStart:'any'};g.resolve();
 assert.deepEqual(g.points,[2,0],'the foul returns one ball');
 assert.equal(g.sim.balls.filter(b=>b.id>0&&!b.pocketed).length,13,'one of them is physically back on the table');
 assert.equal(g.turn,1);assert.equal(g.ballInHand,true);
 // eight in the owner's pocket wins
 const h=new Game({kind:'match',players:'local',ruleset:'onepocket',seed:7});h.break=false;
 for(let id=1;id<=8;id++)h.sim.balls.find(x=>x.id===id).pocketed=true;
 h.turnShot={first:1,pots:[1,2,3,4,5,6,7,8],potRecords:[1,2,3,4,5,6,7,8].map(id=>({id,pocket:3})),rail:true,groupAtStart:'any'};h.resolve();
 assert.equal(h.over,true);assert.equal(h.winner,0);
});
const settle=g=>{let k=0;while(g.turnShot&&k++<12000)g.step();};
test('CPU players play one-pocket, aiming only at their own pocket',()=>{
 let finished=0;
 for(const seed of [3,8,12]){
  const g=new Game({kind:'match',players:'local',ruleset:'onepocket',seed});
  for(let n=0;n<420&&!g.over;n++){
   const persona=PERSONAS[['club','rookie'][g.turn]];
   if(g.ballInHand){const p=chooseAiCuePlacement(g.sim,g.group,persona.tier,{kitchen:false});if(p)g.placeCue(p.x,p.y);}
   const own=g.ownerPockets[g.turn],opp=g.ownerPockets[1-g.turn];
   const plan=g.break?{angle:0,power:.9}:chooseShot(g.sim,g.group,persona.tier,g.random,{persona,ownPocket:own,oppPocket:opp});
   if(plan.pocket!==undefined&&!g.break)assert.equal(plan.pocket,own,'the CPU only plans pots into its own pocket');
   assert.ok(g.beginShot(plan.angle,plan.power));settle(g);
  }
  if(g.over){finished++;assert.ok(g.points[g.winner]>=8);}
 }
 assert.ok(finished>=1,'at least one one-pocket race finished');
});
