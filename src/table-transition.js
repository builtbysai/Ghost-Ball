import {TableRenderer} from './render.js';

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
 * Staggered converging paths followed by a deterministic exclusion solver.
 * Every frame is a pure function of progress, so reflows/low frame rates never
 * accumulate drift. The last frame uses exact physics rack coordinates.
 */
export function movingRack(before,after,progress){
 const t=Math.max(0,Math.min(1,progress));
 if(t>=1)return after.map(b=>({...b,pocketed:false,opacity:1,trail:null}));
 const origins=new Map(before.map(b=>[b.id,b]));
 const positions=after.map(ball=>{
  const from=origins.get(ball.id)||ball;
  const emerging=!origins.has(ball.id)||from.pocketed;
  const distance=Math.hypot(ball.x-from.x,ball.y-from.y);
  // Let the cue ball lead; the object balls form a visually legible wave.
  const stagger=ball.id===0?0:((ball.id*7)%17)/17*.19;
  const start=.12+stagger,span=.69-stagger;
  const move=smooth((t-start)/span),prior=smooth((t-.014-start)/span);
  const side=ball.id%2?1:-1;
  const curve=Math.sin(move*Math.PI)*Math.min(47,distance*.092)*side;
  const dx=(ball.x-from.x)/(distance||1),dy=(ball.y-from.y)/(distance||1);
  const px=mix(from.x,ball.x,move)-dy*curve;
  const py=mix(from.y,ball.y,move)+dx*curve;
  return {...ball,pocketed:false,x:px,y:py,opacity:emerging?smooth((move-.015)/.26):1,
   rotation:mix(from.rotation||0,ball.rotation||0,move)+distance/(24*Math.PI)*(move-prior),
   trail:move>.025&&move<.96&&distance>65?{x:mix(from.x,ball.x,prior),y:mix(from.y,ball.y,prior),opacity:.15*(1-move)}:null};
 });
 // Position-only separation prevents balls passing through each other while
 // retaining their soft, curved migration toward their assigned rack slots.
 const spacing=24.04;
 for(let pass=0;pass<16;pass++){
  let moved=false;
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
   const a=positions[i],b=positions[j];
   if(a.opacity<.12||b.opacity<.12)continue;
   let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
   if(d>=spacing)continue;
   if(d<.0001){const seed=(a.id*19+b.id*11)*2.39996;dx=Math.cos(seed);dy=Math.sin(seed);d=1;}
   const correction=(spacing-d)/2+.0005,ux=dx/d,uy=dy/d;
   a.x-=ux*correction;a.y-=uy*correction;
   b.x+=ux*correction;b.y+=uy*correction;moved=true;
  }
  if(!moved)break;
 }
 return positions;
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
  else{canvas.remove();halo.remove();done();}
 }
 requestAnimationFrame(tick);
}
