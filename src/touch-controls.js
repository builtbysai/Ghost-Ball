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
export function bindPower({track,handle,canShoot,onPower,onShoot,onCancel=()=>{},onProgress=()=>{},onPullStart=()=>{},onPullEnd=()=>{},minimumTravel=22}){
 let pointer=null,startY=0,current=0,travel=1;
 const draw=(p,notify=true)=>{
  current=clamp(p,0,1);
  if(notify&&p>0)onPower(Math.max(.08,current));
  onProgress(current);
  track.style.setProperty('--pull',`${Math.round(current*100)}%`);
  track.style.setProperty('--pull-y',`${Math.max(0,(track.clientHeight-handle.clientHeight-9)*current)}px`);
  track.style.setProperty('--charge',current.toFixed(3));
  track.setAttribute('aria-valuenow',String(Math.round(Math.max(.08,current)*100)));
 };
 draw(0,false);
 function down(e){
  if(pointer!==null||!canShoot())return;
  const h=handle.getBoundingClientRect();
  if(e.clientY>h.bottom+16||e.clientY<h.top-16)return;
  pointer=e.pointerId;startY=e.clientY;
  travel=Math.max(42,track.clientHeight-handle.clientHeight-9);
  draw(0,false);onPullStart();track.setPointerCapture?.(pointer);e.preventDefault();
 }
 function move(e){
  if(e.pointerId!==pointer)return;
  draw(pullPower(startY,e.clientY,travel));e.preventDefault();
 }
 function finish(e,cancel=false){
  if(e.pointerId!==pointer)return;
  const moved=e.clientY-startY;
  if(!cancel)move(e);
  const valid=!cancel&&moved>=minimumTravel&&current>=.08&&canShoot();
  pointer=null;
  try{track.releasePointerCapture?.(e.pointerId);}catch{}
  // Returning false from onShoot intentionally holds the selected strength
  // and the visibly retracted cue until the separate Shoot button is pressed.
  if(valid){
   const retained=onShoot()===false;
   onPullEnd({retained,committed:true});
   if(!retained)draw(0,false);
  }else{
   onCancel();onPullEnd({retained:false,committed:false});draw(0,false);
  }
  e.preventDefault();
 }
 track.addEventListener('pointerdown',down);
 track.addEventListener('pointermove',move);
 track.addEventListener('pointerup',e=>finish(e));
 track.addEventListener('pointercancel',e=>finish(e,true));
 track.addEventListener('lostpointercapture',()=>{
  if(pointer!==null){pointer=null;onCancel();onPullEnd({retained:false,committed:false});draw(0,false);}
 });
 track.addEventListener('keydown',e=>{
  if(!canShoot())return;
  const old=current;
  if(['ArrowDown','ArrowRight'].includes(e.key))draw(clamp(old+.05,.08,1));
  else if(['ArrowUp','ArrowLeft'].includes(e.key))draw(clamp(old-.05,.08,1));
  else if(e.key==='Home')draw(.08);
  else if(e.key==='End')draw(1);
  else if(e.key==='Enter'||e.key===' '){
   onPower(Math.max(.08,current));
   const retained=onShoot()===false;
   onPullEnd({retained,committed:true});
   if(!retained)draw(0,false);
  }
  else return;
  e.preventDefault();
 });
 return {reset:()=>draw(0,false),isDragging:()=>pointer!==null,getProgress:()=>current};
}
export function bindAimWheel({element,canAim,getAngle,setAngle}){
 let pointer=null,lastY=0;
 element.addEventListener('pointerdown',e=>{if(pointer!==null||!canAim())return;pointer=e.pointerId;lastY=e.clientY;element.setPointerCapture?.(pointer);e.preventDefault();});
 element.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;setAngle(wheelAngle(getAngle(),e.clientY-lastY));lastY=e.clientY;e.preventDefault();});
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
