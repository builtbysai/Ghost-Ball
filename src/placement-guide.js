import {TABLE} from './physics.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
/**
 * Search a small, deterministic neighbourhood around a blocked drop.
 * The exact landing position is always previewed; we never silently move
 * the cue across the table or bypass the simulation's collision checks.
 * World units: ball radius = ${TABLE.radius}.
 */
export function nearbyLegalCuePlacement(sim,x,y,{breakOnly=false,maxDistance=48}={}){
 if(!sim||!Number.isFinite(x)||!Number.isFinite(y))return null;
 const minX=30,maxX=breakOnly?265:TABLE.width-30,minY=30,maxY=TABLE.height-30;
 const eligible=(px,py)=>px>=minX&&px<=maxX&&py>=minY&&py<=maxY&&sim.canPlaceCue(px,py);
 if(eligible(x,y))return {x,y,distance:0,snapped:false};
 const centerX=clamp(x,minX,maxX),centerY=clamp(y,minY,maxY);
 const ring=8,samples=24;
 let best=null;
 for(let radius=0;radius<=maxDistance+ring;radius+=ring){
  for(let i=0;i<(radius? samples:1);i++){
   const theta=i*2*Math.PI/samples;
   const px=clamp(centerX+radius*Math.cos(theta),minX,maxX);
   const py=clamp(centerY+radius*Math.sin(theta),minY,maxY);
   const distance=Math.hypot(px-x,py-y);
   if(distance>maxDistance+1e-6||!eligible(px,py))continue;
   if(!best||distance<best.distance)best={x:px,y:py,distance,snapped:true};
  }
  // A complete ring is enough once it contains a valid landing position.
  if(best)return best;
 }
 return null;
}
