import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {PERSONAS,PERSONA_ORDER,personaFor,exhibitionPair,moodScale} from '../src/ai-personas.js';

test('personas map to planner tiers and unknown ids fall back to Rookie',()=>{
 assert.deepEqual(PERSONA_ORDER.map(id=>PERSONAS[id].tier),['rookie','rookie','club','club','club']);
 assert.equal(personaFor('nobody').id,'rookie');
 for(const id of PERSONA_ORDER){assert.ok(PERSONAS[id].blurb&&PERSONAS[id].style&&PERSONAS[id].name);}
});
test('exhibition pairings rotate and never seat a persona against itself',()=>{
 const seen=new Set();
 for(let i=0;i<12;i++){const [a,b]=exhibitionPair(i);assert.notEqual(a,b);seen.add(a+b);}
 assert.ok(seen.size>=5);
});
test('dynamic difficulty loosens a leading CPU and sharpens a trailing one',()=>{
 assert.ok(moodScale(3)>1&&moodScale(-3)<1&&moodScale(0)===1);
 assert.ok(moodScale(99)<=1.33&&moodScale(-99)>=.67);
});
test('a watched exhibition is a refereed match with two CPU seats and no human',()=>{
 const game=new Game({kind:'match',players:'ai',seats:['vera','dex'],shotClock:0,seed:21});
 assert.equal(game.personaAt(0).name,'Vera');assert.equal(game.personaAt(1).name,'Dex');
 assert.ok(game.isAI());game.turn=1;assert.ok(game.isAI());game.turn=0;
 let frames=0;
 while(!game.over&&frames++<60*60*12){game.update(1/60);for(let i=0;i<4;i++)game.step();}
 assert.ok(game.over,'the exhibition finished a rack under the referee');
 assert.ok(game.shots>=8);
 assert.ok(game.winner===0||game.winner===1);
});

test('the breaker alternates each rack in a match, and practice always starts on seat 0',()=>{
 const g=new Game({kind:'match',players:'cpu',seed:5});
 assert.equal(g.turn,0);g.reset(true);assert.equal(g.turn,1);g.reset(true);assert.equal(g.turn,0);g.reset(true);g.reset();assert.equal(g.turn,0,'a restart is a fresh match');
 const p=new Game({kind:'practice',seed:5});p.reset(true);p.reset(true);assert.equal(p.turn,0);
});

import {OPPONENT_CUES,CUES,cueById} from '../src/cue-catalog.js';
test('every named opponent shoots with a unique cue that is not in the locker',()=>{
 const used=PERSONA_ORDER.map(id=>PERSONAS[id].cue);
 assert.equal(new Set(used).size,used.length,'cues must be unique per opponent');
 for(const id of used){assert.ok(OPPONENT_CUES.some(c=>c.id===id),id);assert.ok(!CUES.some(c=>c.id===id),'opponent cues are never equippable');assert.equal(cueById(id).id,id);}
});
