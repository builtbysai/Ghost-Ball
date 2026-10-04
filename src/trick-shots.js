/**
 * Showpiece shots for the CPU: banks, combinations, and draw / follow shots.
 * Pure geometry that proposes candidates; the planner still proves every one with the real physics before
 * a persona is allowed to attempt it, so a trick shot is never a guess or a cheat. A candidate has the same
 * shape as a direct one ({angle,power,spin?,target,pocket,cost}) plus `kind`.
 *
 * Ball centres live inside the rail line: x in [12,988], y in [12,488] (see TABLE.radius).
 */
import {TABLE,POCKETS} from './physics.js';
const R=TABLE.radius,W=TABLE.width,H=TABLE.height;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
/** The four cushion lines for ball centres: [axis, value]. */
const RAILS=[['y',R],['y',H-R],['x',R],['x',W-R]];
const reflect=(p,[axis,value])=>axis==='y'?{x:p.x,y:2*value-p.y}:{x:2*value-p.x,y:p.y};
/** Where the segment from `a` toward `b` crosses a cushion line, or null. */
function crossing(a,b,[axis,value]){
 const da=axis==='y'?a.y:a.x,db=axis==='y'?b.y:b.x;
 if((da-value)*(db-value)>=0)return null;
 const t=(value-da)/(db-da);
 return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}
const inMouthZone=q=>(q.y<30||q.y>H-30)?(q.x<75||q.x>W-75||Math.abs(q.x-W/2)<62):(q.y>0&&(q.x<30||q.x>W-30)&&(q.y<75||q.y>H-75));
const ghostFor=(ball,toward)=>{const d=dist(ball,toward)||1;return {x:ball.x-(toward.x-ball.x)/d*R*2,y:ball.y-(toward.y-ball.y)/d*R*2};};
const inside=g=>g.x>=14&&g.x<=W-14&&g.y>=14&&g.y<=H-14;
/**
 * @param sim the live simulation (cue at rest)
 * @param group 'open'|'solids'|'stripes'|'eight'|'any'|'low-N'
 * @param tools {groupContains, clearPath(from,to,balls,excluded), pocketAimPoint(ball,pocket)}
 */
export function trickCandidates(sim,group,{groupContains,clearPath,pocketAimPoint,ownPocket}){
 const cue=sim.cue();if(!cue||cue.pocketed)return [];
 const live=sim.balls.filter(b=>!b.pocketed&&b.id!==0);
 const mine=live.filter(b=>groupContains(b.id,group));
 const out=[];
 const pockets=[...POCKETS.keys()].filter(p=>ownPocket===undefined||p===ownPocket);
 // --- banks: object ball -> one cushion -> pocket ---------------------------------------------------------
 for(const ball of mine)for(const pocket of pockets){
  const aim=pocketAimPoint(ball,pocket)||{x:POCKETS[pocket][0],y:POCKETS[pocket][1]};
  for(const rail of RAILS){
   const mirror=reflect(aim,rail),q=crossing(ball,mirror,rail);
   if(!q||inMouthZone(q))continue;
   // The ball must head to the cushion and come back toward the pocket, not run along the rail.
   const leg1=dist(ball,q),leg2=dist(q,aim);
   if(leg1<40||leg2<40)continue;
   const ghost=ghostFor(ball,mirror);if(!inside(ghost))continue;
   const approach=dist(cue,ghost);if(approach<2)continue;
   if(!clearPath(cue,ghost,sim.balls,[0,ball.id])||!clearPath(ball,q,sim.balls,[ball.id])||!clearPath(q,aim,sim.balls,[ball.id]))continue;
   const ux=(mirror.x-ball.x)/dist(ball,mirror),uy=(mirror.y-ball.y)/dist(ball,mirror);
   const ax=(ghost.x-cue.x)/approach,ay=(ghost.y-cue.y)/approach,alignment=ax*ux+ay*uy;
   if(alignment<.4)continue;
   out.push({kind:'bank',angle:Math.atan2(ghost.y-cue.y,ghost.x-cue.x),power:clamp((approach+leg1+leg2)/1500+.18,.42,.8),
    cost:(1-alignment)*600+approach*.4+(leg1+leg2)*.6,target:ball.id,pocket});
  }
 }
 // --- combinations: cue -> A -> B -> pocket ---------------------------------------------------------------
 for(const a of mine)for(const b of live){
  if(a.id===b.id||dist(a,b)<R*2.4||dist(a,b)>420||!groupContains(b.id,group)&&group!=='open')continue;
  for(const pocket of pockets){
   const aim=pocketAimPoint(b,pocket);if(!aim)continue;
   const gB=ghostFor(b,aim),gA=ghostFor(a,gB);
   if(!inside(gB)||!inside(gA))continue;
   const approach=dist(cue,gA);if(approach<2)continue;
   if(!clearPath(cue,gA,sim.balls,[0,a.id])||!clearPath(a,gB,sim.balls,[a.id,b.id])||!clearPath(b,aim,sim.balls,[b.id]))continue;
   const u1={x:(gB.x-a.x)/dist(a,gB),y:(gB.y-a.y)/dist(a,gB)};
   const c={x:(gA.x-cue.x)/approach,y:(gA.y-cue.y)/approach};
   if(c.x*u1.x+c.y*u1.y<.55)continue;
   out.push({kind:'combo',angle:Math.atan2(gA.y-cue.y,gA.x-cue.x),power:clamp((approach+dist(a,b)+dist(b,aim))/1350+.16,.4,.85),
    cost:(1-(c.x*u1.x+c.y*u1.y))*700+approach*.35+dist(a,b)*.5+dist(b,aim)*.5,target:b.id,pocket});
  }
 }
 return out.sort((p,q)=>p.cost-q.cost||p.target-q.target||p.pocket-q.pocket);
}
/** Draw and follow variants of an existing direct pot: same line, cue ball loaded to travel back or on. */
export function spinVariants(direct){
 const out=[];
 for(const base of direct){
  out.push({...base,kind:'draw',spin:{x:0,y:-.85},power:Math.max(.5,Math.min(.8,base.power*1.25+.1))});
  out.push({...base,kind:'follow',spin:{x:0,y:.75},power:Math.max(.5,Math.min(.8,base.power*1.2+.08))});
 }
 return out;
}
/** A readable name for the toast and the recap. */
export const TRICK_LABELS={bank:'BANK SHOT',combo:'COMBINATION',draw:'DRAW SHOT',follow:'FOLLOW SHOT'};
