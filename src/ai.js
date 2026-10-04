import {Simulation,POCKETS,JAWS,TABLE} from './physics.js';
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
/** True when a ball travelling from `from` to `to` clears every rubber jaw
 * nose with a small margin. Pocket centres lie outside the cloth, so a naive
 * line to the centre often clips a jaw and rebounds into the table. */
function jawClear(from,to,margin=.5){
 const dx=to.x-from.x,dy=to.y-from.y,den=dx*dx+dy*dy||1,reach=TABLE.radius+4+margin;
 return JAWS.every(([jx,jy])=>{
  const t=clamp(((jx-from.x)*dx+(jy-from.y)*dy)/den,0,1);
  return Math.hypot(jx-from.x-t*dx,jy-from.y-t*dy)>reach;
 });
}
/** Aim points across a pocket mouth, ordered from the centre outward. The
 * first one whose line from the object ball clears the jaws is the real
 * scoring line; none means that pocket is not makeable from here. */
function pocketAimPoints(ball,pocket){
 const [x,y]=POCKETS[pocket],side=pocket===1||pocket===4;
 const d=Math.hypot(x-ball.x,y-ball.y)||1,px=-(y-ball.y)/d,py=(x-ball.x)/d;
 const reach=side?10:20,offsets=[0,.5,-.5,1,-1].map(k=>k*reach);
 return offsets.map(o=>({x:x+px*o,y:y+py*o,offset:Math.abs(o)}))
  .filter(point=>jawClear(ball,point));
}
/** Generate direct, legal first-contact ghost-ball opportunities. */
export function candidateShots(sim,group='open'){
 const cue=sim.cue();if(!cue||cue.pocketed)return [];
 const candidates=[];
 for(const ball of sim.balls){
  if(ball.pocketed||!groupContains(ball.id,group))continue;
  for(let pocket=0;pocket<POCKETS.length;pocket++){
   const aim=pocketAimPoints(ball,pocket)[0];
   if(!aim)continue;
   const {x,y}=aim,p={x,y},d=distance(ball,p);
   if(d<1)continue;
   const ux=(x-ball.x)/d,uy=(y-ball.y)/d;
   const ghost={x:ball.x-ux*TABLE.radius*2,y:ball.y-uy*TABLE.radius*2};
   if(ghost.x<14||ghost.x>986||ghost.y<14||ghost.y>486)continue;
   const approach=distance(cue,ghost);
   if(approach<2||!clearPath(cue,ghost,sim.balls,[0,ball.id]))continue;
   if(!clearPath(ball,p,sim.balls,[ball.id]))continue;
   const ax=(ghost.x-cue.x)/approach,ay=(ghost.y-cue.y)/approach;
   const alignment=clamp(ax*ux+ay*uy,-1,1);
   // A cut at or past ~78 degrees cannot send the object ball anywhere useful.
   if(alignment<.2)continue;
   // Both angle and distance increase difficulty, especially thin cuts.
   const difficulty=(1-alignment)*550+approach*.5+d*.67+aim.offset*3;
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
/**
 * One yielded step = at most one real 240 Hz simulation step. A full,
 * deterministic search can be performed synchronously in lab tests, while
 * the live browser can spread it over animation frames with no altered
 * physics or RNG behavior.
 */
function* simulateAssessment(sim,candidate,group='open',{maxSteps=960}={}){
 const predicted=new Simulation(sim.snapshot().balls);
 if(!predicted.strike(candidate.angle,candidate.power)){
   return {score:-Infinity,targetPocket:false,legalFirst:false,scratch:false,complete:false};
 }
 let targetPocket=false,targetWrongPocket=false,scratch=false,earlyEight=false,own=0,eightDown=false;
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
   else if(event.id===8)eightDown=true;
   else if(event.id===candidate.target){
    if(event.pocket===candidate.pocket)targetPocket=true;
    else targetWrongPocket=true;
   }else if(groupContains(event.id,group))own++;
  }
  if(!predicted.moving){complete=true;break;}
  yield; // cooperative browser scheduling without wall-clock-dependent decisions
 }
 const legalFirst=first!==null&&groupContains(first,group);
 // Sinking the 8 without hitting it first, or with the cue ball, loses the rack.
 if(eightDown&&(first!==8||scratch))earlyEight=true;
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
function drain(generator){
 let state=generator.next();
 while(!state.done)state=generator.next();
 return state.value;
}
export function assessShot(sim,candidate,group='open',options={}){
 return drain(simulateAssessment(sim,candidate,group,options));
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
/** Assess a handful of real, low-force safety strokes: legal first contact on
 * an object ball the player may hit, with a rail afterwards so the shot is
 * never an unforced foul. Shared by both tiers when no pot is on. */
function* safetyPlan(sim,group,random,targets,{maxOptions=2,maxSteps=1440,budget=14,legacy=false}={}){
 const cue=sim.cue();
 const visible=targets.filter(item=>clearPath(cue,item.ball,sim.balls,[0,item.ball.id]));
 const options=(visible.length?visible:targets).slice(0,maxOptions);
 const eight=sim.balls.find(ball=>ball.id===8&&!ball.pocketed);
 const nudge=(random()-.5)*.004;
 let safest=null,safestScore=-Infinity,spent=0;
 for(const {ball,range} of options){
  const bearing=Math.atan2(ball.y-cue.y,ball.x-cue.x);
  const eightBearing=eight?Math.atan2(eight.y-cue.y,eight.x-cue.x):bearing;
  const relative=Math.atan2(Math.sin(eightBearing-bearing),Math.cos(eightBearing-bearing));
  const away=relative>=0?-1:1;
  // A blocked target is approached around the blocker: thin contacts on
  // either edge. Powers rise so the ball still reaches a rail after contact.
  const blocked=!clearPath(cue,ball,sim.balls,[0,ball.id]);
  const offsets=blocked?[0,.04,-.04,.09,-.09,.15,-.15]:[0,away*.044,0,away*.044];
  const powers=blocked?[.4,.6]:[.3,.45,.62];
  const grid=[];
  if(legacy)for(const [offset,power] of [[0,.28],[0,.43],[away*.044,.35]])grid.push({offset,power});
  else for(const power of powers)for(const offset of offsets)
   if(!grid.some(g=>g.offset===offset&&g.power===power))grid.push({offset,power});
  for(const {offset,power} of grid){
   if(spent>=budget)break;
   spent++;
   const plan={angle:bearing+offset+nudge,power,target:ball.id,pocket:-1,cost:range*.1};
   const verdict=yield* simulateAssessment(sim,plan,group,{maxSteps});
   const rank=verdict.score-(verdict.complete?0:320)-(!legacy&&verdict.foul?900:0);
   if(rank>safestScore){safest={plan,verdict};safestScore=rank;}
   // The first stroke predicted legal and complete is good enough.
   if(!legacy&&verdict.complete&&!verdict.foul&&verdict.legalFirst)break;
  }
  if(!legacy&&safest&&safest.verdict.complete&&!safest.verdict.foul)break;
  if(spent>=budget)break;
 }
 if(legacy&&safest&&(safest.verdict.foul||!safest.verdict.complete)){
  // Club Pro's original three strokes found nothing legal: widen to the
  // same bounded search Rookie uses rather than play a known foul.
  const wider=yield* safetyPlan(sim,group,random,targets,{maxOptions,maxSteps,budget});
  if(wider&&wider.predictedLegal&&!wider.predictedEarlyEight)return wider;
 }
 if(!safest)return null;
 const {plan,verdict}=safest;
 return {angle:plan.angle,power:plan.power,target:plan.target,
   predictedLegal:verdict.legalFirst,predictedPot:false,
   predictedComplete:verdict.complete,predictedEarlyEight:verdict.earlyEight,
   plan:'safety-preview'};
}
/** A pure deterministic planning generator. Advance at most a fixed
 * number of yielded 240-Hz prediction steps per frame in the browser.
 * Draining the same generator yields exactly the same plan in headless CI.
 * `stalled` counts this seat's consecutive turns without a pot; it widens
 * Rookie's search so a stubborn last ball is never attempted the same
 * failing way forever. */
export function* createShotPlanner(sim,group='open',difficulty='rookie',random=createRandom(1),{stalled=0}={}){
 const cue=sim.cue();
 if(!cue||cue.pocketed)return {angle:0,power:.58};
 const candidates=candidateShots(sim,group);
 const targets=sim.balls.filter(ball=>!ball.pocketed&&groupContains(ball.id,group))
   .map(ball=>({ball,range:distance(cue,ball)}))
   .sort((a,b)=>a.range-b.range||a.ball.id-b.ball.id);
 if(candidates.length){
  if(difficulty==='club'){
   const short=candidates.slice(0,5),plans=[];
   for(let i=0;i<short.length;i++){
    const base=short[i];
    plans.push({...base});
    if(i<3)plans.push({...base,power:clamp(base.power*1.2,.24,.95)});
   }
   let best=null;
   for(const plan of plans){
    const verdict=yield* simulateAssessment(sim,plan,group);
    if(!best||verdict.score>best.verdict.score)best={plan,verdict};
    if(verdict.made&&verdict.score>1120)break;
   }
   const selected=best.plan;
   return {angle:selected.angle+(random()-.5)*.004,power:selected.power,
     target:selected.target,pocket:selected.pocket,
     predictedLegal:best.verdict.legalFirst,
     predictedPot:best.verdict.made,predictedComplete:best.verdict.complete,
     predictedEarlyEight:best.verdict.earlyEight,plan:'preview'};
  }
  // Rookie: geometry chooses the pot, a short noise-free look-ahead only vets
  // it. The first makeable line wins; otherwise the best non-fouling one.
  // Aim and power are blurred afterwards, so Rookie still misses like a
  // casual player but never walks into an avoidable foul.
  const pool=candidates.slice(0,Math.min(candidates.length,stalled>=2?8:4));
  let best=null;
  for(const base of pool){
   const verdict=yield* simulateAssessment(sim,base,group);
   const rank=verdict.score-(verdict.foul?900:0);
   if(!best||rank>best.rank)best={plan:base,verdict,rank};
   if(verdict.made)break;
  }
  if(best&&!best.verdict.foul){
   const selected=best.plan,wobble=stalled>=2?.02:.035;
   // Blur the aim like a casual player, but re-draw (bounded) when the
   // blurred stroke itself would be a foul: Rookie misses pots, not rules.
   for(let draw=0;draw<3;draw++){
    const plan={...selected,angle:selected.angle+(random()-.5)*wobble,
     power:clamp(selected.power*(.92+random()*.15),.23,.92)};
    const verdict=yield* simulateAssessment(sim,plan,group);
    if(verdict.foul)continue;
    return {angle:plan.angle,power:plan.power,target:selected.target,
     pocket:selected.pocket,predictedLegal:verdict.legalFirst,
     predictedPot:verdict.made,plan:'geometry'};
   }
   return {angle:selected.angle,power:selected.power,target:selected.target,
    pocket:selected.pocket,predictedLegal:best.verdict.legalFirst,
    predictedPot:best.verdict.made,plan:'geometry'};
  }
  // Every direct pot would foul: fall through to a deliberate safety.
 }
 if(!targets.length)return {angle:0,power:.5,plan:'none'};
 const safe=yield* safetyPlan(sim,group,random,targets,
   difficulty==='club'?{legacy:true,maxOptions:2}:{maxOptions:2,maxSteps:1440});
 if(safe)return safe;
 const target=targets[0].ball;
 return {angle:Math.atan2(target.y-cue.y,target.x-cue.x)+(random()-.5)*.06,
   power:.52,target:target.id,plan:'contact'};
}
/** Synchronous convenience for tests and batch matches, sharing every
 * decision with the frame-sliced live match generator. */
export function chooseShot(sim,group='open',difficulty='rookie',random=createRandom(1),options={}){
 return drain(createShotPlanner(sim,group,difficulty,random,options));
}
