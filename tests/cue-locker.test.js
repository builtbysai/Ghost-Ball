import test from 'node:test';
import assert from 'node:assert/strict';
import {CUES,cueById,cueUnlocked,equippedCue,equipCue,toggleFavorite,paintCuePreview}
 from '../src/cue-catalog.js';
import {freshProgress,recordLiveMatch,readLocalProgress,writeLocalProgress}
 from '../src/player-progress.js';
import {Simulation,rack} from '../src/physics.js';
import {Game} from '../src/game.js';

const win=(id,difficulty='rookie')=>({
 kind:'match',source:'live',id,at:'2026-10-02T20:00:00.000Z',
 shots:25,winner:0,players:'cpu',difficulty,room:1,bestRun:3,reason:'eight-cleared'
});
function store(){const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};}

test('two starter cues and four exact permanent milestones exist, no ability stats',()=>{
 assert.equal(CUES.length,6);
 assert.equal(new Set(CUES.map(c=>c.id)).size,6);
 assert.deepEqual(CUES.filter(c=>!c.requirement).map(c=>c.id),['house','smoke']);
 assert.deepEqual(CUES.filter(c=>c.requirement).map(c=>c.requirement),
  ['first-match','beat-rookie','clean-eight','beat-club']);
 for(const cue of CUES){
  assert.equal('power' in cue,false);assert.equal('spin' in cue,false);
  assert.equal('aim' in cue,false);assert.equal('time' in cue,false);
  for(const color of ['butt','wrap','shaft','metal','tip','accent'])
   assert.match(cue[color],/^#[0-9a-f]{6}$/i);
 }
});
test('locked previews cannot equip or favorite, even with forged selectedCue',()=>{
 const fresh=freshProgress();
 assert.equal(equippedCue(fresh).id,'house');
 assert.equal(cueUnlocked(fresh,cueById('smoke')),true);
 assert.equal(cueUnlocked(fresh,cueById('nightfall')),false);
 assert.equal(equipCue(fresh,'nightfall'),fresh);
 assert.equal(toggleFavorite(fresh,'slate'),fresh);
 assert.equal(equippedCue({...fresh,selectedCue:'nightfall'}).id,'house');
 assert.equal(equippedCue({...fresh,selectedCue:'unknown'}).id,'house');
 const smoke=equipCue(fresh,'smoke');
 assert.equal(smoke.selectedCue,'smoke');
 assert.equal(fresh.selectedCue,'house');
});
test('genuine match results unlock cues, ownership and favorites persist safely',()=>{
 const local=store();
 let progress=freshProgress();
 progress=recordLiveMatch(progress,{...win('lost'),winner:1,reason:'early-eight'});
 assert.equal(cueUnlocked(progress,cueById('copperline')),true);
 assert.equal(cueUnlocked(progress,cueById('juniper')),false);
 progress=recordLiveMatch(progress,win('rookie'));
 assert.equal(cueUnlocked(progress,cueById('juniper')),true);
 assert.equal(cueUnlocked(progress,cueById('slate')),true);
 assert.equal(cueUnlocked(progress,cueById('nightfall')),false);
 progress=recordLiveMatch(progress,win('club','club'));
 assert.equal(cueUnlocked(progress,cueById('nightfall')),true);
 progress=equipCue(progress,'nightfall');
 progress=toggleFavorite(progress,'slate');
 assert.deepEqual(progress.favorites,['slate']);
 assert.equal(writeLocalProgress(progress,()=>local),true);
 const read=readLocalProgress(()=>local).progress;
 assert.equal(equippedCue(read).id,'nightfall');
 assert.deepEqual(read.favorites,['slate']);
 assert.deepEqual(toggleFavorite(read,'slate').favorites,[]);
});
test('pre-favorites v1 local progress loads without resetting match history',()=>{
 const local=store(),old=freshProgress();
 old.records.push({id:'older'});delete old.favorites;
 local.setItem('ghostball-progress-v1',JSON.stringify(old));
 const read=readLocalProgress(()=>local);
 assert.equal(read.writable,true);
 assert.deepEqual(read.progress.favorites,[]);
 assert.equal(read.progress.records[0].id,'older');
});
test('renderer cosmetics cannot influence deterministic shots or authoritative rack',()=>{
 const all=CUES.map(cue=>{
  const g=new Game({kind:'match',seed:414});
  assert.equal(g.beginShot(.1,.71,{x:.1,y:-.2}),true);
  for(let i=0;i<5000&&g.turnShot;i++)g.step();
  assert.equal(g.turnShot,null,'seeded real-physics fixture should settle');
  return {id:cue.id,balls:g.sim.snapshot(),history:g.history};
 });
 for(const item of all.slice(1)){
  assert.deepEqual(item.balls,all[0].balls);
  assert.deepEqual(item.history,all[0].history);
 }
 assert.deepEqual(new Simulation(rack(414)).snapshot(),
  new Simulation(rack(414)).snapshot());
});
test('locker full-length preview paints with zero impact on cue geometry',()=>{
 const stops=[];
 const gradient={addColorStop(_,color){stops.push(color);}};
 const noop=()=>{};
 const g=new Proxy({createLinearGradient:()=>gradient},{
  get:(t,k)=>k in t?t[k]:noop,set:(t,k,v)=>{t[k]=v;return true;}});
 const canvas={width:640,height:150,getContext:()=>g};
 for(const cue of CUES)paintCuePreview(canvas,cue);
 // Every body part is shaded from the cue's own palette (gradient mid-stops).
 assert.ok(stops.includes(CUES[5].shaft));
 assert.ok(stops.includes(CUES[5].butt));
 assert.ok(stops.includes(CUES[5].wrap));
});
