import {Simulation,POCKETS,TABLE} from './physics.js';
import {createRandom} from './random.js';
import {groupContains} from './casual-rules.js';
import {initialCuePlacement} from './placement-guide.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

/** Exact line-segment clearance in world units; the ghost point is excluded
 * from collisions with its own target, but every other object can block it. */
function clearPath(from,to,balls,excluded){
 const dx=to.x-from.x,dy=to.y-from.y,den=dx*dx+dy*dy;
 if(den<1)return false;
 return !balls.some(ball=>{
   if(ball.pocketed||excluded.includes(ball.id))return false;
   const t=clamp(((ball.x-from.x)*dx+(ball.y-from.y)*dy)/den,0,1);
   return Math.hypot(ball.x-from.x-t*dx,ball.y-from.y-t*dy)<TABLE.radius*2.18;
 });
}
/** Generate direct, legal first-contact ghost-ball opportunities. */
export function candidateShots(sim,group='open'){
 const cue=sim.cue();if(!cue||cue.pocketed)return [];
 const candidates=[];
 for(const ball of sim.balls){
  if(ball.pocketed||!groupContains(ball.id,group))continue;
  for(let pocket=0;pocket<POCKETS.length;pocket++){
   const [x,y]=POCKETS[pocket],p={x,y},d=distance(ball,p);
   if(d<1)continue;
   const ux=(x-ball.x)/d,uy=(y-ball.y)/d;
   const ghost={x:ball.x-ux*TABLE.radius*2,y:ball.y-uy*TABLE.radius*2};
   if(ghost.x<20||ghost.x>980||ghost.y<20||ghost.y>480)continue;
   const approach=distance(cue,ghost);
   if(approach<2||!clearPath(cue,ghost,sim.balls,[0,ball.id]))continue;
   if(!clearPath(ball,p,sim.balls,[ball.id]))continue;
   const ax=(ghost.x-cue.x)/approach,ay=(ghost.y-cue.y)/approach;
   const alignment=clamp(ax*ux+ay*uy,-1,1);
   // Both angle and distance increase difficulty, especially thin cuts.
   const difficulty=(1-alignment)*550+approach*.5+d*.67;
   const basePower=clamp((approach+d*.45)/1450,.23,.9);
   candidates.push({angle:Math.atan2(ghost.y-cue.y,ghost.x-cue.x),
     power:basePower,cost:difficulty,target:ball.id,pocket,approach,cut:1-alignment});
  }
 }
 return candidates.sort((a,b)=>a.cost-b.cost||a.target-b.target||a.pocket-b.pocket);
}
/** Cheap bounded deterministic preview. Only the stronger Club Pro executes
 * these trajectories; Rookie uses geometry with looser aim and tempo. */
/** Lightweight real-physics prediction. Evaluate the ruling along with
 * target pocket instead of treating an illegal pocket as a successful shot.
 * maxSteps is a bounded planning window, NOT a replacement for the referee. */
export function assessShot(sim,candidate,group='open',{maxSteps=960}={}){
 const predicted=new Simulation(sim.snapshot().balls);
 if(!predicted.strike(candidate.angle,candidate.power)){
   return {score:-Infinity,targetPocket:false,legalFirst:false,scratch:false,complete:false};
 }
 let targetPocket=false,targetWrongPocket=false,scratch=false,earlyEight=false,own=0;
 let first=null,railAfterContact=false,complete=false,anyPocket=false;
 const visited=new Set();
 for(let step=0;step<maxSteps;step++){
  const events=predicted.step();
  for(const event of events){
   if(event.type==='contact'&&first===null&&(event.a===0||event.b===0))
    first=event.a===0?event.b:event.a;
   if(event.type==='rail'&&first!==null)railAfterContact=true;
   if(event.type!=='pocket'||visited.has(event.id))continue;
   visited.add(event.id);anyPocket=true;
   if(event.id===0)scratch=true;
   else if(event.id===8&&group!=='eight')earlyEight=true;
   else if(event.id===candidate.target){
    if(event.pocket===candidate.pocket)targetPocket=true;
    else targetWrongPocket=true;
   }else if(groupContains(event.id,group))own++;
  }
  if(!predicted.moving){complete=true;break;}
 }
 const legalFirst=first!==null&&groupContains(first,group);
 // Predict a legal made ball, not a visually successful but foul-ridden pot.
 // A clean positional fallback remains preferable when the planned target
 // cannot be made during the bounded preview window.
 const foul=scratch||earlyEight||!legalFirst||
   (complete&&!anyPocket&&!railAfterContact);
 const made=legalFirst&&targetPocket&&!foul;
 const score=(made?1200:targetWrongPocket&&legalFirst&&!foul?460:0)
   +(!foul?own*170:0)+(legalFirst?160:0)
   -(scratch?1600:0)-(earlyEight?2200:0)
   -(!legalFirst?950:0)
   -(complete&&!anyPocket&&!railAfterContact?420:0)
   -candidate.cost*.25-candidate.power*25;
 return {score,targetPocket,legalFirst,scratch,earlyEight,first,
   complete,railAfterContact,foul,made};
}
/**
 * Find an actually legal and geometrically useful ball-in-hand position.
 * This is shared by live AI and the full-rack lab; neither gets a shortcut
 * or a magic ghost placement. No mutations to the authoritative sim.
 * The benchmark intentionally does not use any candidate that the real
 * opponent cannot legally place.
 */
export function chooseAiCuePlacement(sim,group='open',difficulty='rookie'){
 if(!sim||!sim.atRest())return null;
 const fallback=initialCuePlacement(sim)?.candidate;
 const targets=sim.balls.filter(ball=>!ball.pocketed&&groupContains(ball.id,group))
   .map(ball=>({ball,pockets:POCKETS
     .map(([x,y],pocket)=>({x,y,pocket,distance:Math.hypot(x-ball.x,y-ball.y)}))
     .sort((a,b)=>a.distance-b.distance||a.pocket-b.pocket)}))
   .sort((a,b)=>a.pockets[0].distance-b.pockets[0].distance||a.ball.id-b.ball.id);
 const candidateSpots=[];
 // Direct target-to-pocket lines create sensible achievable ball-in-hand
 // chances. Cap evaluation explicitly for predictable mobile CPU costs.
 for(const {ball,pockets} of targets.slice(0,difficulty==='club'?5:3)){
  for(const pocket of pockets.slice(0,difficulty==='club'?3:2)){
   const dx=(pocket.x-ball.x)/pocket.distance;
   const dy=(pocket.y-ball.y)/pocket.distance;
   for(const approach of difficulty==='club'?[100,175]:[135]){
    candidateSpots.push({x:ball.x-dx*(TABLE.radius*2+approach),
      y:ball.y-dy*(TABLE.radius*2+approach)});
   }
  }
 }
 // Common safe sites make the routine robust when a cut's ideal point
 // collides with a blocker or lies beyond the cloth.
 candidateSpots.push({x:240,y:250},{x:370,y:250},{x:500,y:250},{x:640,y:250});
 let best=null;
 const initial=sim.snapshot();
 for(const site of candidateSpots){
  if(!sim.canPlaceCue(site.x,site.y))continue;
  const trial=new Simulation(initial.balls.map(ball=>({
   ...ball,orientation:[...(ball.orientation||[1,0,0,0])]
  })));
  if(!trial.placeCue(site.x,site.y))continue;
  const options=candidateShots(trial,group);
  const first=options[0];
  if(!first)continue;
  const rank=first.cost;
  if(!best||rank<best.cost)best={x:site.x,y:site.y,cost:rank,
    target:first.target,pocket:first.pocket};
  // A low-cost, legal, unblocked approach deserves early termination.
  if(best.cost<120)break;
 }
 if(best)return best;
 return fallback?{x:fallback.x,y:fallback.y,cost:Infinity}:null;
}

/** Numeric compatibility wrapper for existing simple AI tests. */
export function previewShot(sim,candidate,group='open',options={}){
 return assessShot(sim,candidate,group,options).score;
}
/** Purely local shot selection, deterministic with the supplied seeded PRNG.
 * Both opponents get exactly the same physics; only planning changes. */
export function chooseShot(sim,group='open',difficulty='rookie',random=createRandom(1)){
 const cue=sim.cue();
 if(!cue||cue.pocketed)return {angle:0,power:.58};
 const candidates=candidateShots(sim,group);
 if(candidates.length){
  if(difficulty==='club'){
   // Keep evaluation bounded and deterministic on modest devices. Vary
   // target/pocket before replaying the same narrow cut with many strengths.
   // Six to eight previews per turn; never run an exhaustive tree.
   const short=candidates.slice(0,5);
   const plans=[];
   for(let i=0;i<short.length;i++){
    const base=short[i];
    plans.push({...base});
    if(i<3)plans.push({...base,power:clamp(base.power*1.2,.24,.95)});
   }
   let best=null;
   for(const plan of plans){
    const verdict=assessShot(sim,plan,group);
    if(!best||verdict.score>best.verdict.score)best={plan,verdict};
    // A genuinely predicted legal pocket is stronger evidence than trying
    // more expensive speculative lines. Keep the selected result stable.
    if(verdict.made&&verdict.score>1120)break;
   }
   const selected=best.plan;
   return {angle:selected.angle+(random()-.5)*.004,power:selected.power,
     target:selected.target,pocket:selected.pocket,
     predictedLegal:best.verdict.legalFirst,
     predictedPot:best.verdict.made,plan:'preview'};
  }
  const range=Math.min(2,candidates.length);
  // Rookie reads a decent simple angle but remains noticeably imprecise.
  const selected=candidates[Math.floor(random()*range)];
  return {angle:selected.angle+(random()-.5)*.035,
    power:clamp(selected.power*(.92+random()*.15),.23,.92),
    target:selected.target,pocket:selected.pocket,plan:'geometry'};
 }
 // No clean pot: use an unobstructed legal first contact if possible.
 const targets=sim.balls.filter(ball=>!ball.pocketed&&groupContains(ball.id,group))
   .map(ball=>({ball,range:distance(cue,ball)}))
   .sort((a,b)=>a.range-b.range||a.ball.id-b.ball.id);
 const direct=targets.find(({ball})=>clearPath(cue,ball,sim.balls,[0,ball.id]));
 const target=(direct||targets[0])?.ball;
 if(!target)return {angle:0,power:.5,plan:'none'};
 return {angle:Math.atan2(target.y-cue.y,target.x-cue.x)
     +(random()-.5)*(difficulty==='club'?.01:.06),
   power:difficulty==='club'?.45:.52,target:target.id,plan:'contact'};
}
