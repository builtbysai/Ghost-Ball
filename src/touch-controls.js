/** Pointer-first pool controls. DOM-independent gesture maths are exported for tests. */
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
/** Keyboard and button aim steps: a deliberate 2 degrees, Shift for 0.25. */
export const AIM_STEP=2*Math.PI/180,AIM_FINE_STEP=Math.PI/720;
export const aimStep=fine=>fine?AIM_FINE_STEP:AIM_STEP;
/** Keyboard pull: power climbs 0-100% over this many seconds while Space is held. */
export const KEY_PULL_SECONDS=1.2,KEY_PULL_MIN_HOLD=.15;
export const keyPullAmount=heldSeconds=>clamp(heldSeconds/KEY_PULL_SECONDS,0,1);
export function pullPower(startY,nowY,travel){return clamp((nowY-startY)/Math.max(1,travel),0,1);}
// Pointer capture delivers releases even after the finger leaves the rail.
// Only a release near the actual track is a deliberate shot.
export function safePowerRelease(point,rect,margin=18){
 return Number.isFinite(point?.x)&&Number.isFinite(point?.y)&&
  point.x>=rect.left-margin&&point.x<=rect.right+margin&&
  point.y>=rect.top-margin&&point.y<=rect.bottom+margin;
}
/** A committed, near-maximum pull stays valid past the end of the rail,
 * but never past its lateral lane. On rotated screens the pull moves left. */
export function alignedMaxPull(point,rect,{rotated=false,margin=18,endInset=8}={}){
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return false;
 return rotated
  ?point.y>=rect.top-margin&&point.y<=rect.bottom+margin&&point.x<=rect.left+endInset
  :point.x>=rect.left-margin&&point.x<=rect.right+margin&&point.y>=rect.bottom-endInset;
}
export function wheelAngle(startAngle,deltaY,sensitivity=.0015){return Math.atan2(Math.sin(startAngle-deltaY*sensitivity),Math.cos(startAngle-deltaY*sensitivity));}
/**
 * Every shot must start on the pull handle, travel downward beyond the safety
 * threshold. Near-maximum travel fires at the end of the rail before a
 * finger can slip off the physical screen; releasing beyond the rail also
 * works as long as it remains in the same narrow pull lane.
 * A generic pointercancel does not fire a shot.
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
   track.setAttribute('aria-valuetext',current>=.96?'Maximum power. Release or pull to the end to shoot':current>0?Math.round(Math.max(.08,current)*100)+' percent power':'Ready to pull');
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
 function commit(id){
   // Disarm first: a captured pointerup/lostpointercapture cannot fire again.
   if(pointer!==id||!canShoot())return false;
   pointer=null;try{track.releasePointerCapture?.(id);}catch{}
   const retained=onShoot()===false;
   if(retained)track.classList.add('held');
   else{
     track.classList.add('releasing');draw(0);
     setTimeout(()=>track.classList.remove('releasing'),220);
   }
   return true;
 }
 function move(e){
   if(e.pointerId!==pointer)return;
   const moved=axis(e)-startY;
   draw(pullPower(startY,axis(e),travel));
   // The handle can be held at 100%. Only an intentional continuation all
   // the way to the rail's end is auto-fired before physical screen loss.
   if(moved>=minimumTravel&&current>=.96&&
       alignedMaxPull({x:e.clientX,y:e.clientY},track.getBoundingClientRect(),{rotated:rotated()})&&
       canShoot())commit(e.pointerId);
   e.preventDefault();
 }
 function finish(e,cancel=false){
   if(e.pointerId!==pointer)return;
   const moved=axis(e)-startY;
   // Always update power on release; do not use move() here because it may
   // auto-fire. A canceled system gesture never commits a new shot.
   if(!cancel)draw(pullPower(startY,axis(e),travel));
   const rect=track.getBoundingClientRect(),point={x:e.clientX,y:e.clientY};
   const aligned=alignedMaxPull(point,rect,{rotated:rotated()});
   const valid=!cancel&&moved>=minimumTravel&&current>=.08&&canShoot()&&
     (safePowerRelease(point,rect)||current>=.96&&aligned);
   if(valid)commit(e.pointerId);
   else{
     pointer=null;try{track.releasePointerCapture?.(e.pointerId);}catch{}
     onCancel();draw(0);
   }
   e.preventDefault();
 }
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
   // Space is hold-to-pull / release-to-shoot and is owned by the window-level
   // handler; only Enter fires immediately from the focused rail.
   else if(e.key==='Enter'){if(current>0)onPower(Math.max(.08,current));const retained=onShoot()===false;if(retained)track.classList.add('held');else{track.classList.add('releasing');draw(0);setTimeout(()=>track.classList.remove('releasing'),220);}}
   else return;e.preventDefault();});
 return {reset:()=>{track.classList.remove('held','releasing');draw(0);},setProgress:p=>draw(p),isDragging:()=>pointer!==null,getProgress:()=>current};
}
export function bindAimWheel({element,canAim,getAngle,setAngle,onReset=()=>{},getSensitivity=()=>.0015}){
 let pointer=null,lastY=0,travel=0,lastTap=0;
 const axis=e=>typeof window!=='undefined'&&window.matchMedia('(orientation:portrait) and (max-width:820px)').matches?-e.clientX:e.clientY;
 element.addEventListener('pointerdown',e=>{
  if(pointer!==null||!canAim())return;
  // Double-tap undoes aim to the previous shot direction without another HUD control.
  if(lastTap&&Date.now()-lastTap<340){
   lastTap=0;onReset();e.preventDefault();return;
  }
  pointer=e.pointerId;lastY=axis(e);travel=0;
  element.setPointerCapture?.(pointer);e.preventDefault();
 });
 element.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointer)return;
  const delta=axis(e)-lastY;travel+=Math.abs(delta);
  setAngle(wheelAngle(getAngle(),delta,getSensitivity()));lastY=axis(e);e.preventDefault();
 });
 function stop(e,cancel=false){
  if(e.pointerId!==pointer)return;
  if(!cancel&&travel<5)lastTap=Date.now();else lastTap=0;
  pointer=null;try{element.releasePointerCapture?.(e.pointerId);}catch{}
 }
 element.addEventListener('pointerup',e=>stop(e));
 element.addEventListener('pointercancel',e=>stop(e,true));
 element.addEventListener('lostpointercapture',()=>{pointer=null;});
 element.addEventListener('wheel',e=>{if(!canAim())return;lastTap=0;setAngle(wheelAngle(getAngle(),e.deltaY*.25,getSensitivity()));e.preventDefault();},{passive:false});
 element.addEventListener('keydown',e=>{
  if(!canAim())return;
  // Same direction as the window-level keys: left turns the aim counter-clockwise.
  if(e.key==='ArrowRight'||e.key==='ArrowUp')setAngle(getAngle()+aimStep(e.shiftKey));
  else if(e.key==='ArrowLeft'||e.key==='ArrowDown')setAngle(getAngle()-aimStep(e.shiftKey));
  else if(e.key==='Backspace'||e.key==='Home')onReset();
  else return;
  lastTap=0;e.preventDefault();
 });
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
