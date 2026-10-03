/** Deterministic, non-rendered end-to-end P2.1 full-rack laboratory.
 * Run from repo root: node scripts/full-rack-lab.mjs
 * This is seeded CPU-vs-CPU use of production Game.beginShot, Game.step,
 * placement guide and chooseShot. It is NOT measured phone performance or
 * physical human input validation.
 */
import {performance} from 'node:perf_hooks';
import {Game,chooseShot} from '../src/game.js';
import {initialCuePlacement} from '../src/placement-guide.js';
import {TABLE} from '../src/physics.js';
import {groupContains} from '../src/casual-rules.js';

const MAX_SIM_STEPS=9000;
const pct=(arr,n)=>arr.length?[...arr].sort((a,b)=>a-b)[Math.min(arr.length-1,Math.floor((arr.length-1)*n))]:0;
const sig=g=>g.sim.balls.map(b=>b.pocketed?'p':`${b.id}:${Math.round(b.x)},${Math.round(b.y)}`).join('|')+';'+g.group;
const ensure=(assertion,message)=>{if(!assertion)throw Error(message);};

export function runRack(seed,{maxShots=120,tiers=['rookie','club']}={}){
 const game=new Game({kind:'match',players:'local',seed});
 const decisions=[],rulings=[],stagnant=[],counts={legal:0,missed:0,fouls:0,scratches:0,
   pots:0,plannedPots:0,decisionFallbacks:0,placements:0,earlyEight:0};
 let repeated=0,previousSignature=null,steps=0,decisionTotal=0;
 for(let n=0;n<maxShots&&!game.over;n++){
  if(game.ballInHand){
   const placement=initialCuePlacement(game.sim);
   ensure(placement?.candidate,`seed ${seed}, shot ${n+1}: no legal cue placement`);
   ensure(game.placeCue(placement.candidate.x,placement.candidate.y),
     `seed ${seed}, shot ${n+1}: legal placement rejected`);
   counts.placements++;
  }
  const tier=tiers[game.turn]||'rookie',before=sig(game),group=game.group;
  const now=performance.now();
  const plan=game.break?{angle:0,power:.82,plan:'break'}:
     chooseShot(game.sim,group,tier,game.random);
  const decisionMs=performance.now()-now;
  decisionTotal+=decisionMs;
  decisions.push({shot:n+1,tier,elapsedMs:decisionMs,plan:plan.plan||'break'});
  if(plan.plan==='contact'||plan.plan==='none')counts.decisionFallbacks++;
  ensure(Number.isFinite(plan.angle)&&Number.isFinite(plan.power),
    `seed ${seed}, shot ${n+1}: invalid plan`);
  ensure(game.beginShot(plan.angle,plan.power),`seed ${seed}, shot ${n+1}: strike rejected`);
  const shot=game.turnShot;let elapsed=0;
  while(game.turnShot&&elapsed++<MAX_SIM_STEPS)game.step();
  ensure(!game.turnShot,`seed ${seed}, shot ${n+1}: did not settle after ${MAX_SIM_STEPS} steps`);
  ensure(game.sim.atRest(),`seed ${seed}, shot ${n+1}: velocities remained`);
  steps+=elapsed;
  const ruling=game.history.at(-1);
  ensure(ruling?.kind==='ruling'&&ruling.shot===n+1,`seed ${seed}: missing ruling`);
  const info={shot:n+1,tier,group,first:ruling.firstContact??shot.first,
    planned:plan.target??null,plannedPocket:plan.pocket??null,
    pots:[...shot.pots],reason:ruling.reason||null,
    result:ruling.result,turn:ruling.turn,remaining:game.sim.balls.filter(b=>b.id>0&&!b.pocketed).length};
  rulings.push(info);
  if(ruling.result==='foul')counts.fouls++;
  if(shot.pots.includes(0))counts.scratches++;
  if(ruling.reason==='early-eight')counts.earlyEight++;
  counts.pots+=shot.pots.filter(id=>id>0&&id!==8).length;
  if(shot.first===null)counts.missed++;
  else if(group==='open'?shot.first>0&&shot.first!==8:groupContains(shot.first,group))counts.legal++;
  if(plan.target!==undefined&&shot.pots.includes(plan.target))counts.plannedPots++;
  for(const b of game.sim.balls){
   ensure([b.x,b.y,b.vx,b.vy].every(Number.isFinite),
     `seed ${seed}, shot ${n+1}: nonfinite ball ${b.id}`);
   ensure(b.pocketed||(b.x>=-36&&b.x<=1036&&b.y>=-36&&b.y<=536),
     `seed ${seed}, shot ${n+1}: out-of-table ball ${b.id}`);
  }
  const after=sig(game);
  if(after===before&&before===previousSignature)repeated++;
  else repeated=0;
  previousSignature=after;
  if(repeated>=16)stagnant.push({shot:n+1,turn:game.turn,group:game.group});
  ensure(game.groups[0]===null&&game.groups[1]===null||
    game.groups[0]!==game.groups[1],`seed ${seed}: contradictory groups`);
 }
 ensure(rulings.length===game.shots,`seed ${seed}: ruling/shot mismatch`);
 const winner=game.winner;
 ensure(!game.over||winner===0||winner===1,`seed ${seed}: finished match without winner`);
 return {
  seed,tiers,maxShots,shots:game.shots,finished:game.over,winner,
  reason:rulings.at(-1)?.reason||null,
  remaining:game.sim.balls.filter(b=>b.id>0&&!b.pocketed).length,
  counts,stagnant,steps,simulationSeconds:steps*TABLE.step,
  planning:{totalMs:decisionTotal,meanMs:decisionTotal/decisions.length,
    p95Ms:pct(decisions.map(x=>x.elapsedMs),.95),maxMs:Math.max(...decisions.map(x=>x.elapsedMs))},
  decisions,rulings,history:game.history,finalSnapshot:game.sim.snapshot()
 };
}

export function summary(run){
 const {seed,tiers,shots,finished,winner,remaining,counts,stagnant,steps,planning}=run;
 return {seed,tiers,shots,finished,winner,remaining,counts,stagnant,
   steps,planning:{meanMs:+planning.meanMs.toFixed(2),
    p95Ms:+planning.p95Ms.toFixed(2),maxMs:+planning.maxMs.toFixed(2)}};
}

if(process.argv[1]?.endsWith('/full-rack-lab.mjs')){
 const seeds=(process.env.GHOST_SEEDS||'17,41,73,109').split(',').map(Number);
 const maxShots=Number(process.env.GHOST_MAX_SHOTS||120);
 const runs=seeds.map(seed=>runRack(seed,{maxShots}));
 console.log(JSON.stringify({generatedAt:new Date().toISOString(),
   benchmark:'headless Node reference hardware, NOT Android',
   fixture:{seeds,maxShots,tiers:['rookie','club']},
   runs:runs.map(summary)},null,2));
 if(process.env.GHOST_REPLAY==='1'){
  for(const run of runs){
   const replay=runRack(run.seed,{maxShots,tiers:run.tiers});
   ensure(JSON.stringify(replay.history)===JSON.stringify(run.history),
     `seed ${run.seed}: deterministic replay history mismatch`);
   ensure(JSON.stringify(replay.finalSnapshot)===JSON.stringify(run.finalSnapshot),
     `seed ${run.seed}: deterministic physical replay mismatch`);
  }
  console.log('PASS: full recorded rulings and ball snapshots replay identically');
 }
}