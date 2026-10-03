import {Simulation,POCKETS,TABLE} from './physics.js';
import {createRandom} from './random.js';
import {groupContains} from './casual-rules.js';

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
export function previewShot(sim,candidate,group='open',{maxSteps=960}={}){
 const predicted=new Simulation(sim.snapshot().balls);
 if(!predicted.strike(candidate.angle,candidate.power))return -Infinity;
 let targetPocket=false,targetWrongPocket=false,scratch=false,earlyEight=false,own=0;
 const visited=new Set();
 for(let step=0;step<maxSteps;step++){
  const events=predicted.step();
  for(const event of events){
   if(event.type!=='pocket'||visited.has(event.id))continue;
   visited.add(event.id);
   if(event.id===0)scratch=true;
   else if(event.id===8&&group!=='eight')earlyEight=true;
   else if(event.id===candidate.target){
    if(event.pocket===candidate.pocket)targetPocket=true;else targetWrongPocket=true;
   }else if(groupContains(event.id,group))own++;
  }
  if(!predicted.moving)break;
 }
 // Deliberately favor making the planned shot and avoiding the cue scratch.
 // Unexpected good pots can help, but cannot completely override a scratch.
 return (targetPocket?760:targetWrongPocket?260:0)+own*130
   -(scratch?1250:0)-(earlyEight?1750:0)-candidate.cost*.5
   -candidate.power*30;
}
/** Purely local shot selection, deterministic with the supplied seeded PRNG.
 * Both opponents get exactly the same physics; only planning changes. */
export function chooseShot(sim,group='open',difficulty='rookie',random=createRandom(1)){
 const cue=sim.cue();
 if(!cue||cue.pocketed)return {angle:0,power:.58};
 const candidates=candidateShots(sim,group);
 if(candidates.length){
  if(difficulty==='club'){
   // Evaluate a handful of realistic options rather than a huge search that
   // stalls budget Android phones. Also try a softer tempo when worthwhile.
   let best=null;
   for(const base of candidates.slice(0,3)){
    for(const factor of [1,.82]){
     const plan={...base,power:clamp(base.power*factor,.2,.9)};
     const score=previewShot(sim,plan,group);
     if(!best||score>best.score)best={plan,score};
    }
   }
   const selected=best.plan;
   return {angle:selected.angle+(random()-.5)*.009,power:selected.power,
     target:selected.target,pocket:selected.pocket,plan:'preview'};
  }
  const range=Math.min(3,candidates.length);
  // Rookie usually spots easy pots but sometimes selects a harder cut.
  const selected=candidates[Math.floor(random()*range)];
  return {angle:selected.angle+(random()-.5)*.06,
    power:clamp(selected.power*(.9+random()*.16),.2,.91),
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
