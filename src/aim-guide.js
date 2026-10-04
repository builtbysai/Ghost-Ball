import {TABLE} from './physics.js';

const EPSILON=1e-7;
function firstWallDistance(x,y,dx,dy,radius){
 const distances=[];
 if(dx>EPSILON)distances.push((TABLE.width-radius-x)/dx);
 if(dx< -EPSILON)distances.push((radius-x)/dx);
 if(dy>EPSILON)distances.push((TABLE.height-radius-y)/dy);
 if(dy< -EPSILON)distances.push((radius-y)/dy);
 return Math.min(...distances.filter(value=>value>=0));
}
function firstBallDistance(origin,dx,dy,balls,excluded,radius){
 let closest=Infinity,target=null;
 for(const ball of balls){
  if(ball.pocketed||excluded.includes(ball.id))continue;
  const rx=ball.x-origin.x,ry=ball.y-origin.y;
  const along=rx*dx+ry*dy;
  const perpendicular2=rx*rx+ry*ry-along*along;
  if(along<=0||perpendicular2>(radius*2)**2)continue;
  const distance=along-Math.sqrt(Math.max(0,(radius*2)**2-perpendicular2));
  if(distance>=0&&distance<closest){closest=distance;target=ball;}
 }
 return {distance:closest,target};
}
/** First-contact aim assist for the current layout. No spin, throw or cushion prediction. */
export function projectAim(balls,cue,angle,{maxObjectLength=180,maxCueLength=1300,maxDeflectLength=90}={}){
 if(!cue||cue.pocketed||!Number.isFinite(angle))return null;
 const r=TABLE.radius,dx=Math.cos(angle),dy=Math.sin(angle);
 const wall=firstWallDistance(cue.x,cue.y,dx,dy,r);
 const collision=firstBallDistance(cue,dx,dy,balls,[0],r);
 const distance=Math.max(0,Math.min(maxCueLength,wall,collision.distance));
 const cueEnd={x:cue.x+dx*distance,y:cue.y+dy*distance};
 if(!collision.target||collision.distance>wall||collision.distance>maxCueLength)return {cueEnd,ghost:null,target:null,objectEnd:null};
 const target=collision.target;
 const ox=(target.x-cueEnd.x)/(r*2),oy=(target.y-cueEnd.y)/(r*2);
 const normalization=Math.hypot(ox,oy);
 if(normalization<EPSILON)return {cueEnd,ghost:cueEnd,target,objectEnd:null};
 const vx=ox/normalization,vy=oy/normalization;
 const rail=firstWallDistance(target.x,target.y,vx,vy,r);
 const obstruction=firstBallDistance(target,vx,vy,balls,[0,target.id],r).distance;
 const path=Math.max(0,Math.min(maxObjectLength,rail,obstruction));
 // Stun-shot deflection: with no spin the cue ball leaves along the tangent line,
 // and keeps energy in proportion to how thin the cut is (sin of the cut angle).
 const along=dx*vx+dy*vy,tx=dx-along*vx,ty=dy-along*vy,tl=Math.hypot(tx,ty);
 let cueAfter=null;
 if(tl>.06){
  const ux=tx/tl,uy=ty/tl,reach=Math.max(0,Math.min(maxDeflectLength*Math.min(1,tl*1.15),firstWallDistance(cueEnd.x,cueEnd.y,ux,uy,r),
   firstBallDistance(cueEnd,ux,uy,balls,[0,target.id],r).distance));
  cueAfter={x:cueEnd.x+ux*reach,y:cueEnd.y+uy*reach};
 }
 return {cueEnd,ghost:cueEnd,target,objectEnd:{x:target.x+vx*path,y:target.y+vy*path},cueAfter};
}
