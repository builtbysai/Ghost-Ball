/** Invariant stress: random human-like strokes and CPU shots across rulesets.
 * node scripts/stress.mjs [racks]  — flags NaN, escaped or overlapping balls, stuck turns. */
import {Game,chooseShot} from '../src/game.js';
import {chooseAiCuePlacement} from '../src/ai.js';
import {PERSONAS,PERSONA_ORDER} from '../src/ai-personas.js';
import {createRandom} from '../src/random.js';
import {TABLE} from '../src/physics.js';

const racks=Number(process.argv[2])||30,problems=[];
const check=(game,label)=>{
 const live=game.sim.balls.filter(b=>!b.pocketed);
 for(const b of live){
  if(![b.x,b.y,b.vx,b.vy].every(Number.isFinite))problems.push(`${label}: NaN ball ${b.id}`);
  else if(b.x<-5||b.x>1005||b.y<-5||b.y>505)problems.push(`${label}: ball ${b.id} escaped ${b.x|0},${b.y|0}`);
 }
 for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++)
  if(Math.hypot(live[i].x-live[j].x,live[i].y-live[j].y)<TABLE.radius*2-1.5)problems.push(`${label}: overlap ${live[i].id}/${live[j].id}`);
};
for(const ruleset of ['eight','nine','ten'])for(let i=0;i<racks;i++){
 const rnd=createRandom(9000+i),ids=[PERSONA_ORDER[rnd()*4|0],PERSONA_ORDER[rnd()*4|0]],label=`${ruleset}#${i}`;
 const game=new Game({kind:'match',players:'local',seed:700+i,ruleset,callEight:ruleset==='eight'&&i%3===0});
 let n=0;
 for(;n<260&&!game.over;n++){
  const persona=PERSONAS[ids[game.turn]];
  if(game.ballInHand){
   const p=chooseAiCuePlacement(game.sim,game.group,persona.tier,{kitchen:game.kitchen});
   if(p){if(!game.placeCue(p.x,p.y))problems.push(`${label}: AI placement rejected`);}
   else if(!game.placeCue(game.kitchen?150:300,250))problems.push(`${label}: no placement at all`);
  }
  // one shot in five is a wild human stroke
  const wild=rnd()<.2;
  const plan=game.break?{angle:(rnd()-.5)*.02,power:ruleset==='eight'?.85:1}:wild?{angle:rnd()*Math.PI*2,power:.15+rnd()*.85}:chooseShot(game.sim,game.group,persona.tier,game.random,{persona});
  const call=game.needsCall()?(plan.pocket??(rnd()*6|0)):null;
  if(!game.beginShot(plan.angle,plan.power,wild?{x:rnd()-.5,y:rnd()-.5}:0,call)){problems.push(`${label}: strike rejected`);break;}
  let k=0;while(game.turnShot&&k++<12000)game.step();
  if(game.turnShot){problems.push(`${label}: shot never settled`);break;}
  check(game,`${label} shot ${n+1}`);
 }
 if(!game.over)problems.push(`${label}: unfinished after ${n} shots`);
}
const seen=new Set();for(const p of problems){const key=p.replace(/#\d+ shot \d+/,'').replace(/ball \d+/,'ball N').replace(/\d+,\d+/,'x,y');if(seen.has(key))continue;seen.add(key);console.log(p);}
console.log(problems.length?`${problems.length} problems (${seen.size} kinds)`:'no invariant violations');
