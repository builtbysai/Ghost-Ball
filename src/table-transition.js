import {TableRenderer} from './render.js';
import {TABLE} from './physics.js';
import {planFlock,flockAt} from './rack-flock.js';

// One physical table travels from the live exhibition into the chosen game.
export const smooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
export const mix=(a,b,t)=>a+(b-a)*t;
export function cameraFlight(progress){
 const t=smooth((progress-.025)/.92);
 return {
  travel:t,
  flatten:smooth((progress-.14)/.67),
  // A small aerial lift separates the table from the clubhouse floor.
  lift:Math.sin(Math.PI*t),
 };
}
/**
 * Rack setup is a flock settling into formation (see rack-flock.js): every
 * ball seeks its slot, neighbours steer around each other and exclusion
 * guarantees no overlaps. The plan is computed once per (before, after) pair and
 * played back by interpolation, so frames are a pure function of progress and
 * reflows or dropped frames never accumulate drift. The last frame is the exact
 * physics rack.
 */
const plans=new WeakMap();
export function movingRack(before,after,progress){
 let byAfter=plans.get(before);
 if(!byAfter){byAfter=new WeakMap();plans.set(before,byAfter);}
 let plan=byAfter.get(after);
 if(!plan){plan=planFlock(before,after);byAfter.set(after,plan);}
 const bodies=new Map(after.map(ball=>[ball.id,ball]));
 return flockAt(plan,progress).map(pose=>({...bodies.get(pose.id),...pose}));
}
export function flyTable({app,source,target,from,to,hall,gameRenderer,done,reverse=false,isActive=()=>true}){
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){done();return;}
 const startBox=source.getBoundingClientRect(),appBox=app.getBoundingClientRect();
 const mobileRotate=window.matchMedia('(orientation:portrait) and (max-width:820px)').matches;
 const sourceTurn=reverse&&mobileRotate&&source.closest('.game-screen')?90:0;
 const targetTurn=!reverse&&mobileRotate&&target.closest('.game-screen')?90:gameRenderer.portrait?-90:0;
 const canvasW=Math.max(1,source.offsetWidth||startBox.width),canvasH=Math.max(1,source.offsetHeight||startBox.height);
 if(startBox.width<2||startBox.height<2){done();return;}
 const halo=document.createElement('div');halo.className='flight-stage';halo.setAttribute('aria-hidden','true');app.append(halo);
 const canvas=document.createElement('canvas');
 canvas.className='table-flight';canvas.setAttribute('aria-hidden','true');
 canvas.style.width=canvasW+'px';canvas.style.height=canvasH+'px';app.append(canvas);
 const flight=new TableRenderer(canvas,{view:reverse?'flat':'perspective',hall,cacheStatic:false});flight.resize();
 flight.setBlend(reverse?1:0);
 // Render the floating board at a higher pixel density when it is growing
 // toward the match layout; CSS-only scaling blurred the previous entrance.
 const targetPixels=gameRenderer.canvas.width/canvasW;
 const resolution=Math.min(3.2,Math.max(flight.dpr,targetPixels*.95));
 if(resolution>flight.dpr){
  flight.dpr=resolution;canvas.width=Math.round(flight.w*resolution);
  canvas.height=Math.round(flight.h*resolution);
  flight.g.setTransform(resolution,0,0,resolution,0,0);
 }
 const start={x:startBox.left-appBox.left+startBox.width/2,y:startBox.top-appBox.top+startBox.height/2};
 const originals=from.balls.map(ball=>({...ball})),rack=to.balls.map(ball=>({...ball}));
 // Pre-paint the exhibition frame synchronously so hiding the lobby never
 // creates a blank flash while waiting for the first animation callback.
 canvas.style.transform='translate3d('+(start.x-canvasW/2)+'px,'+(start.y-canvasH/2)+'px,0) rotate('+sourceTurn+'deg)';
 flight.draw({balls:originals,moving:false});
 let started=null;
 const duration=1510;
 function tick(now){
  if(!canvas.isConnected||!isActive()){canvas.remove();halo.remove();done();return;}
  started??=now;
  const t=Math.min(1,(now-started)/duration),camera=cameraFlight(t);
  flight.setBlend(reverse?1-camera.flatten:camera.flatten);
  // Re-target during orientation changes without deforming the world state.
  const targetBox=target.getBoundingClientRect(),root=app.getBoundingClientRect();
  const finish={x:targetBox.left-root.left+targetBox.width/2,y:targetBox.top-root.top+targetBox.height/2};
  const scaleX=gameRenderer.bw/Math.max(1,flight.bw);
  const scaleY=gameRenderer.bh/Math.max(1,flight.bh);
  const pulse=1+.023*camera.lift;
  let sx=mix(1,scaleX,camera.travel)*pulse,sy=mix(1,scaleY,camera.travel)*pulse;
  const rotation=mix(sourceTurn,targetTurn,camera.travel),rad=rotation*Math.PI/180;
  // Bounding the *drawn board*, not the transparent canvas, avoids cropped
  // pockets as the table lifts or turns across a narrow phone screen.
  const halfX=()=>Math.abs(Math.cos(rad))*flight.bw*sx/2+Math.abs(Math.sin(rad))*flight.bh*sy/2;
  const halfY=()=>Math.abs(Math.sin(rad))*flight.bw*sx/2+Math.abs(Math.cos(rad))*flight.bh*sy/2;
  const fit=Math.min(1,(root.width-24)/Math.max(1,halfX()*2),(root.height-22)/Math.max(1,halfY()*2));
  if(fit<1){sx*=fit;sy*=fit;}
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const rawX=mix(start.x,finish.x,camera.travel)+camera.lift*10;
  const rawY=mix(start.y,finish.y,camera.travel)-camera.lift*25;
  const x=clamp(rawX,halfX()+12,root.width-halfX()-12);
  const y=clamp(rawY,halfY()+10,root.height-halfY()-10);
  canvas.style.transform='translate3d('+(x-canvasW/2)+'px,'+(y-canvasH/2)+'px,0) rotate('+rotation+'deg) scale('+sx+','+sy+')';
  halo.style.setProperty('--flight-x',x+'px');halo.style.setProperty('--flight-y',y+'px');
  halo.style.opacity=String(Math.min(1,t*7,Math.max(0,(1-t)*10)));
  flight.draw({balls:movingRack(originals,rack,t),moving:false});
  if(t<1)requestAnimationFrame(tick);
  else{
   // Carry the exact final visual orientation into the destination simulation:
   // no pop from a rolled number/stripe to the default rack texture at handoff.
   const final=movingRack(originals,rack,1),byId=new Map(final.map(b=>[b.id,b]));
   for(const ball of to.balls){const pose=byId.get(ball.id);
    if(pose){ball.orientation=[...pose.orientation];ball.rotation=pose.rotation;}
   }
   canvas.remove();halo.remove();done();
  }
 }
 requestAnimationFrame(tick);
}
