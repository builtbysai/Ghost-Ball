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


/** One source of truth for the preview, confirm button and the renderer. */
export function cuePlacementDraft(sim,x,y,{breakOnly=false,maxDistance=48}={}){
 if(!sim||!Number.isFinite(x)||!Number.isFinite(y))return null;
 const legal=sim.canPlaceCue(x,y)&&(!breakOnly||x<=265);
 const suggestion=legal?null:nearbyLegalCuePlacement(sim,x,y,{breakOnly,maxDistance});
 const candidate=legal?{x,y}:suggestion?{x:suggestion.x,y:suggestion.y}:null;
 return {x,y,legal,suggestion,candidate};
}
/** An accessible initial placement when a scratched ball isn't visible. */
export function initialCuePlacement(sim,{breakOnly=false}={}){
 if(!sim)return null;
 const cue=sim.cue();
 const xs=breakOnly?[240,190,130]:[cue?.pocketed?240:cue?.x,240,300,400,500,600,700,800,130,900];
 const ys=[cue?.pocketed?250:cue?.y,250,180,320,110,390];
 for(const x of xs)for(const y of ys){
   if(!Number.isFinite(x)||!Number.isFinite(y))continue;
   const draft=cuePlacementDraft(sim,x,y,{breakOnly});
   if(draft?.candidate)return draft;
 }
 // Rare pathological racks: deterministic full-cloth scan, never force legality.
 for(let x=30;x<=(breakOnly?265:970);x+=16)
  for(let y=30;y<=470;y+=16){
   const draft=cuePlacementDraft(sim,x,y,{breakOnly,maxDistance:0});
   if(draft?.candidate)return draft;
  }
 return null;
}
