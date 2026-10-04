/**
 * Rack flocking: balls glide from wherever they lie (or from the ball-return
 * gate, if pocketed) into their rack slots like a flock settling. Each ball
 * seeks its slot with a smooth arrival, balls steer away from and loosely match
 * the velocity of close neighbours, and a hard exclusion step guarantees no two
 * visible balls ever overlap. The motion is precomputed once on a fixed step
 * and played back by interpolation, so it is deterministic, cheap and never
 * depends on frame rate. Presentation only: it never touches physics.
 */
import {TABLE} from './physics.js';
import {advanceRoll} from './ball-orientation.js';

const R=TABLE.radius,GAP=2*R+.2,CLEARANCE=GAP*1.12;
/** Where returned balls re-enter: the foot of the table, by the return rail. */
export const GATE={x:960,y:462};
const smooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
const clampN=(n,a,b)=>Math.max(a,Math.min(b,n));

export function planFlock(before,after,{seconds=1.45,fps=120,sub=1}={}){
 const origin=new Map(before.map(b=>[b.id,b]));
 const xs=after.map(b=>b.x),minX=Math.min(...xs),span=Math.max(1,Math.max(...xs)-minX);
 let returnedCount=0;
 const balls=after.map(target=>{
  const from=origin.get(target.id),returned=!from||from.pocketed;
  // Slots at the back of the rack are filled first so later balls never have to
  // push through a finished triangle; the cue ball leads.
  const order=target.id===0?0:1-(target.x-minX)/span;
  // Returned balls leave the gate one after another, like a rack being fed back.
  const slot=returned?returnedCount++:0;
  const delay=(target.id===0?0:.03+order*.2)*seconds+(returned?.04*seconds+slot*.028*seconds:0);
  const start=returned?{x:GATE.x-(slot%3)*4,y:GATE.y+(slot%2)*3}:{x:from.x,y:from.y};
  return {id:target.id,tx:target.x,ty:target.y,x:start.x,y:start.y,vx:0,vy:0,delay,returned,
   opacity:returned?0:1,settled:false,pose:{orientation:[...(from?.orientation||target.orientation||[1,0,0,0])],
   rotation:from?.rotation||target.rotation||0},distance:Math.hypot(target.x-start.x,target.y-start.y),
   // Each ball's own arrival time keeps the wave from finishing in lockstep.
   speed:0};
 });

 // A fixed brisk cruise speed settles reliably; playback then stretches the finished
 // motion over the whole timeline.
 for(const b of balls)b.speed=1180+(b.id*53%7)*34;
 const total=Math.round(seconds*fps*.5),limit=Math.round(seconds*fps*2.4),dt=1/(fps*sub);
 const frames=[];
 const record=()=>frames.push(balls.map(b=>({id:b.id,x:b.x,y:b.y,opacity:b.opacity,
  rotation:b.pose.rotation,orientation:[...b.pose.orientation]})));
 record();
 const tau=.11;
 for(let frame=1;frame<=limit;frame++){
  for(let s=0;s<sub;s++){
   const now=((frame-1)*sub+s+1)*dt;
   for(const b of balls){
    if(now<b.delay||b.settled)continue;
    const dx=b.tx-b.x,dy=b.ty-b.y,dist=Math.hypot(dx,dy);
    // Seek with arrival: speed falls off linearly inside the braking zone.
    const want=Math.min(b.speed,dist*7.5),ux=dx/(dist||1),uy=dy/(dist||1);
    let ax=(ux*want-b.vx)/tau,ay=(uy*want-b.vy)/tau;
    // Separation and alignment against neighbours that are already on the move or placed.
    let sx=0,sy=0,avx=0,avy=0,near=0;
    for(const o of balls){
     if(o===b||(o.returned&&now<o.delay))continue;
     const ox=b.x-o.x,oy=b.y-o.y,d=Math.hypot(ox,oy);
     if(d>=CLEARANCE*2.1||d<1e-6)continue;
     // Two balls both close to their own slots are already in formation: no steering between them.
     if(dist<44&&Math.hypot(o.tx-o.x,o.ty-o.y)<44)continue;
     const k=1-d/(CLEARANCE*2.1);
     // A small sideways component breaks head-on deadlocks, in a direction fixed by the pair.
     const side=b.id>o.id?1:-1;
     sx+=(ox/d-oy/d*.7*side)*k*k;sy+=(oy/d+ox/d*.7*side)*k*k;
     if(d<CLEARANCE*1.6&&now>=o.delay){avx+=o.vx;avy+=o.vy;near++;}
    }
    ax+=sx*2600;ay+=sy*2600;
    // Obstacle avoidance: sidestep a ball that sits on the straight line to my slot,
    // which also resolves two balls that each stand in the other's slot.
    // Only a ball that has stalled short of its slot needs to steer around blockers.
    const stalled=Math.hypot(b.vx,b.vy)<150&&dist>GAP*.8;
    for(const o of stalled?balls:[]){
     if(o===b||(o.returned&&now<o.delay))continue;
     const rx=o.x-b.x,ry=o.y-b.y,ahead=rx*ux+ry*uy;
     if(ahead<=0||ahead>Math.min(dist+GAP*.6,GAP*2.6))continue;
     const lx=rx-ahead*ux,ly=ry-ahead*uy,lat=Math.hypot(lx,ly);
     if(lat>=GAP*.95)continue;
     const k=(1-lat/(GAP*.95))*(1-ahead/(GAP*2.6));
     // Away from the obstacle's side; exactly head-on picks a side fixed by the pair.
     // Head-on pairs each turn to their own right, so they pass instead of mirroring.
     const px=lat>1e-3?-lx/lat:-uy,py=lat>1e-3?-ly/lat:ux;
     ax+=px*k*5200;ay+=py*k*5200;
    }
    if(near){ax+=(avx/near-b.vx)*.9/tau*.3;ay+=(avy/near-b.vy)*.9/tau*.3;}
    b.vx+=ax*dt;b.vy+=ay*dt;
    const sp=Math.hypot(b.vx,b.vy),cap=b.speed*1.08;
    if(sp>cap){b.vx*=cap/sp;b.vy*=cap/sp;}
   }
   for(const b of balls){
    if(now<b.delay||b.settled)continue;
    const px=b.x,py=b.y;
    b.x=clampN(b.x+b.vx*dt,R,TABLE.width-R);b.y=clampN(b.y+b.vy*dt,R,TABLE.height-R);
    if(b.returned)b.opacity=Math.min(1,b.opacity+dt/(.16*seconds));
    // Close enough and slow enough: lock onto the exact rack coordinate.
    if(Math.hypot(b.tx-b.x,b.ty-b.y)<.6&&Math.hypot(b.vx,b.vy)<40){b.x=b.tx;b.y=b.ty;b.vx=b.vy=0;b.settled=true;}
   }
   // Exclusion: visible balls never overlap. A ball that has not set off yet is immovable.
   for(let pass=0;pass<16;pass++){
    let moved=false;
    for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
     const a=balls[i],c=balls[j];
     if((a.returned&&now<a.delay)||(c.returned&&now<c.delay))continue;
     let dx=c.x-a.x,dy=c.y-a.y,d=Math.hypot(dx,dy);
     if(d>=GAP)continue;
     if(d<1e-4){const seed=(a.id*19+c.id*11)*2.39996;dx=Math.cos(seed);dy=Math.sin(seed);d=1;}
     const push=(GAP-d)+.001,ux=dx/d,uy=dy/d;
     const aFixed=now<a.delay||a.settled,cFixed=now<c.delay||c.settled;
     const wa=aFixed&&!cFixed?0:cFixed&&!aFixed?1:.5;
     a.x-=ux*push*wa;a.y-=uy*push*wa;c.x+=ux*push*(1-wa);c.y+=uy*push*(1-wa);moved=true;
    }
    if(!moved)break;
   }
  }
  // Roll the visible sphere by the distance actually travelled this frame.
  for(const b of balls){
   const last=frames[frames.length-1].find(f=>f.id===b.id);
   advanceRoll(b.pose,b.x-last.x,b.y-last.y,R);
  }
  record();
  if(frame>=total&&balls.every(b=>b.settled))break;
 }
 // Anything that has not settled (a jammed pathological scatter) glides the last stretch.
 const lastIndex=frames.length-1,loose=balls.filter(b=>!b.settled);
 if(loose.length){
  const glide=Math.max(10,Math.floor(fps*.3));
  for(let g=1;g<=glide;g++){
   const w=smooth(g/glide);
   const next=frames[lastIndex].map(f=>{const b=balls.find(x=>x.id===f.id);return b.settled?{...f}:{...f,x:f.x+(b.tx-f.x)*w,y:f.y+(b.ty-f.y)*w,orientation:[...f.orientation]};});
   // Keep the exclusion guarantee through the glide as well.
   for(let pass=0;pass<12;pass++){
    let moved=false;
    for(let i=0;i<next.length;i++)for(let j=i+1;j<next.length;j++){
     const a=next[i],c=next[j],ia=balls[i],ic=balls[j];
     let dx=c.x-a.x,dy=c.y-a.y,d=Math.hypot(dx,dy);
     if(d>=GAP)continue;
     if(d<1e-4){dx=1;dy=0;d=1;}
     const push=(GAP-d)+.001,ux=dx/d,uy=dy/d,wa=ia.settled&&!ic.settled?0:ic.settled&&!ia.settled?1:.5;
     a.x-=ux*push*wa;a.y-=uy*push*wa;c.x+=ux*push*(1-wa);c.y+=uy*push*(1-wa);moved=true;
    }
    if(!moved)break;
   }
   frames.push(next);
  }
 }
 for(const f of frames[frames.length-1]){const b=balls.find(x=>x.id===f.id);f.x=b.tx;f.y=b.ty;f.opacity=1;}
 // Playback spends the whole timeline on visible motion: cut the frames at the moment every
 // ball is within a pixel or two of its slot, and land that frame exactly on the rack.
 const near=f=>f.every(p=>{const b=balls.find(x=>x.id===p.id);return Math.hypot(b.tx-p.x,b.ty-p.y)<1.4;});
 let active=0;while(active<frames.length-1&&!near(frames[active]))active++;
 frames.length=Math.max(2,active+1);
 for(const f of frames[frames.length-1]){const b=balls.find(x=>x.id===f.id);f.x=b.tx;f.y=b.ty;f.opacity=1;}
 active=frames.length-1;
 return {frames,seconds:frames.length/fps,fps,active:Math.max(1,active),count:balls.length,settledNaturally:loose.length===0};
}
/** The poses at normalised time t in [0,1] (linear between planned frames). */
export function flockAt(plan,t){
 const last=plan.frames.length-1,at=clampN(t/.94,0,1)*Math.min(last,plan.active),i=Math.min(last-1,Math.floor(at)),f=at-i;
 if(t>=1)return plan.frames[last].map(p=>({...p,orientation:[...p.orientation],pocketed:false,trail:null}));
 return plan.frames[i].map((a,k)=>{
  const b=plan.frames[i+1][k];
  // A short motion streak behind balls that are really travelling.
  const moved=Math.hypot(b.x-a.x,b.y-a.y),x=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f;
  return {id:a.id,x,y,opacity:a.opacity+(b.opacity-a.opacity)*f,
   rotation:a.rotation+(b.rotation-a.rotation)*f,orientation:f<.5?[...a.orientation]:[...b.orientation],
   pocketed:false,trail:moved>1.6?{x:a.x,y:a.y,opacity:Math.min(.16,moved*.03)}:null};
 });
}
