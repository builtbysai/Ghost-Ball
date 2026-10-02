/** Pointer-first pool controls. DOM-independent gesture maths are exported for tests. */
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function pullPower(startY,nowY,travel){return clamp((nowY-startY)/Math.max(1,travel),0,1);}
export function wheelAngle(startAngle,deltaY,sensitivity=.004){return Math.atan2(Math.sin(startAngle-deltaY*sensitivity),Math.cos(startAngle-deltaY*sensitivity));}
/**
 * Every shot must start on the pull handle, travel downward beyond the safety
 * threshold and end inside the control. Cancel/leave never commits a shot.
 * A pointer gesture is separate from keyboard operation; this eliminates
 * accidental shots caused by changing a native slider.
 */
export function bindPower({track,handle,canShoot,onPower,onShoot,onPull=()=>{},onCancel=()=>{},minimumTravel=22}){
 let pointer=null,startY=0,current=0,travel=1;
 const rotated=()=>typeof window!=='undefined'&&window.matchMedia('(orientation:portrait) and (max-width:820px)').matches;
 const axis=e=>rotated()?-e.clientX:e.clientY;
 const draw=p=>{
   current=clamp(p,0,1);
   if(current>0)onPower(Math.max(.08,current));
   track.style.setProperty('--pull',Math.round(current*100)+'%');
   track.style.setProperty('--tension',current.toFixed(3));
   track.style.setProperty('--glow',(4+27*current).toFixed(1)+'px');
   track.style.setProperty('--handle-scale',(1-.16*current).toFixed(3));
   track.style.setProperty('--pull-y',Math.max(0,(track.clientHeight-44)*current)+'px');
   track.classList.toggle('charging',current>.025);
   track.setAttribute('aria-valuenow',String(Math.round(Math.max(.08,current)*100)));
   track.setAttribute('aria-valuetext',current>0?Math.round(Math.max(.08,current)*100)+' percent power':'Ready to pull');
   onPull(current);
  };
 draw(0);
 function down(e){if(pointer!==null||!canShoot())return;
   const rect=track.getBoundingClientRect(),h=handle.getBoundingClientRect();
   // Start on the handle or in the upper third. A deliberate downward
   // gesture is still required before release is allowed to shoot.
   const start=axis(e),top=rotated()?-rect.right:rect.top;
   const available=rotated()?rect.width:rect.height;
   if(start<top-20||start>top+Math.max(48,available*.38))return;
   pointer=e.pointerId;startY=axis(e);travel=Math.max(42,(rotated()?rect.width-h.width:rect.height-h.height)-9);track.classList.remove('held');draw(0);track.setPointerCapture?.(pointer);e.preventDefault();}
 function move(e){if(e.pointerId!==pointer)return;draw(pullPower(startY,axis(e),travel));e.preventDefault();}
 function finish(e,cancel=false){if(e.pointerId!==pointer)return;const moved=axis(e)-startY;
   if(!cancel)move(e);const valid=!cancel&&moved>=minimumTravel&&current>=.08&&canShoot();
   pointer=null;try{track.releasePointerCapture?.(e.pointerId);}catch{}
   if(valid){
    const retained=onShoot()===false;
    if(retained){track.classList.add('held');}
    else{track.classList.add('releasing');draw(0);setTimeout(()=>track.classList.remove('releasing'),220);}
   }else{onCancel();draw(0);}
   e.preventDefault();}
 track.addEventListener('pointerdown',down);
 track.addEventListener('pointermove',move);
 track.addEventListener('pointerup',e=>finish(e));
 track.addEventListener('pointercancel',e=>finish(e,true));
 track.addEventListener('lostpointercapture',()=>{if(pointer!==null){pointer=null;draw(0);onCancel();}});
 track.addEventListener('keydown',e=>{if(!canShoot())return;
   const old=current;
   if(['ArrowDown','ArrowRight'].includes(e.key))draw(clamp(old+.05,.08,1));
   else if(['ArrowUp','ArrowLeft'].includes(e.key))draw(clamp(old-.05,.08,1));
   else if(e.key==='Home')draw(.08);
   else if(e.key==='End')draw(1);
   else if(e.key==='Enter'||e.key===' '){onPower(Math.max(.08,current));const retained=onShoot()===false;if(retained)track.classList.add('held');else{track.classList.add('releasing');draw(0);setTimeout(()=>track.classList.remove('releasing'),220);}}
   else return;e.preventDefault();});
 return {reset:()=>{track.classList.remove('held','releasing');draw(0);},isDragging:()=>pointer!==null,getProgress:()=>current};
}
export function bindAimWheel({element,canAim,getAngle,setAngle}){
 let pointer=null,lastY=0;
 const axis=e=>typeof window!=='undefined'&&window.matchMedia('(orientation:portrait) and (max-width:820px)').matches?-e.clientX:e.clientY;
 element.addEventListener('pointerdown',e=>{if(pointer!==null||!canAim())return;pointer=e.pointerId;lastY=axis(e);element.setPointerCapture?.(pointer);e.preventDefault();});
 element.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;setAngle(wheelAngle(getAngle(),axis(e)-lastY));lastY=axis(e);e.preventDefault();});
 function stop(e){if(e.pointerId===pointer){pointer=null;try{element.releasePointerCapture?.(e.pointerId);}catch{}}}
 element.addEventListener('pointerup',stop);element.addEventListener('pointercancel',stop);
 element.addEventListener('lostpointercapture',()=>{pointer=null;});
 element.addEventListener('wheel',e=>{if(!canAim())return;setAngle(wheelAngle(getAngle(),e.deltaY*.45));e.preventDefault();},{passive:false});
 element.addEventListener('keydown',e=>{if(!canAim())return;
   if(e.key==='ArrowUp'||e.key==='ArrowLeft')setAngle(getAngle()+Math.PI/1440);
   else if(e.key==='ArrowDown'||e.key==='ArrowRight')setAngle(getAngle()-Math.PI/1440);
   else return;e.preventDefault();});
}
export function spinFromPoint(x,y,rect){const rx=(x-(rect.left+rect.width/2))/(rect.width*.42),ry=(y-(rect.top+rect.height/2))/(rect.height*.42),d=Math.hypot(rx,ry)||1,s=Math.min(1,1/d);return {x:Math.round(rx*s*100)/100 || 0,y:Math.round(-ry*s*100)/100 || 0};}

// Aiming is only acquired on the visible shaft, never on the guide line ahead
// of the cue ball. Pixel-space hit testing keeps the touch target consistent
// regardless of perspective or viewport size.
export const wrapAngle = radians => Math.atan2(Math.sin(radians),Math.cos(radians));
export function cueShaftHit(point,ball,tip,butt,tolerance=26){
 const dx=butt.x-tip.x,dy=butt.y-tip.y,den=dx*dx+dy*dy;
 if(den<1)return false;
 const t=((point.x-tip.x)*dx+(point.y-tip.y)*dy)/den;
 const cx=tip.x+Math.max(0,Math.min(1,t))*dx,cy=tip.y+Math.max(0,Math.min(1,t))*dy;
 const behind=(point.x-ball.x)*(butt.x-ball.x)+(point.y-ball.y)*(butt.y-ball.y);
 return t>=-.03&&t<=1.08&&behind>0&&Math.hypot(point.x-cx,point.y-cy)<=tolerance;
}
export function rearAimAngle(cue,point){
 const dx=cue.x-point.x,dy=cue.y-point.y;
 return Math.hypot(dx,dy)<2?null:Math.atan2(dy,dx);
}
