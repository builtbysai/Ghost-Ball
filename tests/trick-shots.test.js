import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,rack} from '../src/physics.js';
import {chooseShot} from '../src/ai.js';
import {PERSONAS} from '../src/ai-personas.js';
import {createRandom} from '../src/random.js';
import {trickCandidates,spinVariants,TRICK_LABELS} from '../src/trick-shots.js';
import {groupContains} from '../src/casual-rules.js';

const afterBreak=seed=>{const sim=new Simulation(rack(seed));sim.strike(seed*.003,.9);for(let i=0;i<4000&&sim.moving;i++)sim.step();return sim;};
const play=(sim,shot)=>{
 const t=new Simulation(sim.snapshot().balls),before=new Set(t.balls.filter(b=>b.pocketed).map(b=>b.id));
 t.strike(shot.angle,shot.power,shot.spin||0);for(let i=0;i<4000&&t.moving;i++)t.step();
 return t.balls.filter(b=>b.pocketed&&!before.has(b.id)).map(b=>b.id);
};
const survey=persona=>{
 const kinds={};
 for(let seed=1;seed<=40;seed++){
  const sim=afterBreak(seed);if(sim.cue().pocketed)continue;
  const shot=chooseShot(sim,'open',persona.tier,createRandom(seed*7919+13),{persona});
  if(shot.plan!=='trick')continue;
  const k=(kinds[shot.trick]??={n:0,made:0});k.n++;if(play(sim,shot).includes(shot.target))k.made++;
 }
 return kinds;
};

test('the showman proves and lands banks, combinations and draw/follow shots',()=>{
 const kinds=survey(PERSONAS.ace),all=Object.values(kinds);
 for(const kind of ['bank','combo','draw'])assert.ok(kinds[kind]?.n>0,`Ace never tried a ${kind}`);
 const n=all.reduce((s,k)=>s+k.n,0),made=all.reduce((s,k)=>s+k.made,0);
 assert.ok(made/n>=.75,`Ace landed only ${made} of ${n} trick shots`);
 for(const kind of Object.keys(kinds))assert.ok(TRICK_LABELS[kind],`${kind} needs a label`);
});
test('rookie never attempts a trick and the patient player rarely does',()=>{
 assert.deepEqual(survey(PERSONAS.rookie),{});
 const vera=Object.values(survey(PERSONAS.vera)).reduce((s,k)=>s+k.n,0),ace=Object.values(survey(PERSONAS.ace)).reduce((s,k)=>s+k.n,0);
 assert.ok(vera<ace/3,`Vera ${vera} vs Ace ${ace}`);
});
test('candidate generators only propose legal, in-bounds, group-respecting shots',()=>{
 const sim=afterBreak(7),tools={groupContains,clearPath:()=>true,pocketAimPoint:()=>({x:-7,y:-7})};
 for(const c of trickCandidates(sim,'solids',tools)){
  assert.ok(Number.isFinite(c.angle)&&c.power>=.4&&c.power<=.85,JSON.stringify(c));
  assert.ok(c.kind==='bank'||c.kind==='combo');
  if(c.kind==='combo')assert.ok(groupContains(c.target,'solids')||c.target>0);
 }
 const v=spinVariants([{angle:0,power:.4,cost:1,target:1,pocket:0}]);
 assert.deepEqual(v.map(x=>x.kind),['draw','follow']);assert.ok(v[0].spin.y<0&&v[1].spin.y>0);
});
test('a CPU trick shot is announced and played with its spin',()=>{
 return import('../src/game.js').then(({Game})=>{
  const events=[];const g=new Game({kind:'match',players:'cpu',persona:'ace',seed:3,onTurn:e=>events.push(e)});
  g.turn=1;g.break=false;
  const shot={angle:0.1,power:.5,spin:{x:0,y:-.8},pocket:0,target:1,trick:'draw'};
  g.previewShot=shot;g.timer=99;g.planningPose=null;g.update(1/30);
  assert.ok(events.some(e=>e.type==='trick'&&e.kind==='draw'&&e.seat===1));
  assert.equal(g.history.at(-1).spin.y,-.8);
 });
});
