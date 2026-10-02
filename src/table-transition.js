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
export function movingRack(before,after,progress){
 const origins=new Map(before.map(ball=>[ball.id,ball]));
 return after.map(ball=>{
  const origin=origins.get(ball.id),from=origin||ball;
  const stagger=(ball.id*7%17)/17*.14;
  const begin=.17+stagger,duration=.66-stagger;
  const move=smooth((progress-begin)/duration);
  const old=smooth((progress-.047-begin)/duration);
  const distance=Math.hypot(ball.x-from.x,ball.y-from.y);
  const side=ball.id%2?1:-1;
  const position=p=>{
   const curve=Math.sin(Math.PI*p)*Math.min(27,distance*.043)*side;
   // A curved gather, rather than linear teleportation or ball collisions.
   return {x:mix(from.x,ball.x,p)+curve*(ball.y-from.y)/(distance||1),
    y:mix(from.y,ball.y,p)-curve*(ball.x-from.x)/(distance||1)};
  };
  const here=position(move),earlier=position(old);
  const emerging=!origin||origin.pocketed;
  const rolling=distance/(24*Math.PI)*(move-old);
  return {...ball,pocketed:false,
   opacity:emerging?smooth((move-.005)/.22):1,
   x:here.x,y:here.y,
   rotation:mix(from.rotation||0,ball.rotation||0,move)+rolling,
   trail:move>.025&&move<.96&&distance>65?
    {...earlier,opacity:Math.min(.32,(move-old)*2.6)*(1-move*.55)}:null};
 });
}
export function flyTable({app,source,target,from,to,hall,gameRenderer,done}){
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){done();return;}
 const startBox=source.getBoundingClientRect(),appBox=app.getBoundingClientRect();
 if(startBox.width<2||startBox.height<2){done();return;}
 const halo=document.createElement('div');halo.className='flight-stage';halo.setAttribute('aria-hidden','true');app.append(halo);
 const canvas=document.createElement('canvas');
 canvas.className='table-flight';canvas.setAttribute('aria-hidden','true');
 canvas.style.width=startBox.width+'px';canvas.style.height=startBox.height+'px';app.append(canvas);
 const flight=new TableRenderer(canvas,{view:'perspective',hall});flight.resize();
 // Render the floating board at a higher pixel density when it is growing
 // toward the match layout; CSS-only scaling blurred the previous entrance.
 const targetPixels=gameRenderer.canvas.width/Math.max(1,startBox.width);
 const resolution=Math.min(3.2,Math.max(flight.dpr,targetPixels*.95));
 if(resolution>flight.dpr){
  flight.dpr=resolution;canvas.width=Math.round(flight.w*resolution);
  canvas.height=Math.round(flight.h*resolution);
  flight.g.setTransform(resolution,0,0,resolution,0,0);
 }
 const start={x:startBox.left-appBox.left+startBox.width/2,y:startBox.top-appBox.top+startBox.height/2};
 const originals=from.balls.map(ball=>({...ball})),rack=to.balls.map(ball=>({...ball}));
 let started=null;
 const duration=1510;
 function tick(now){
  if(!canvas.isConnected){halo.remove();done();return;}
  started??=now;
  const t=Math.min(1,(now-started)/duration),camera=cameraFlight(t);
  flight.setBlend(camera.flatten);
  // Re-target during orientation changes without deforming the world state.
  const targetBox=target.getBoundingClientRect(),root=app.getBoundingClientRect();
  const finish={x:targetBox.left-root.left+targetBox.width/2,y:targetBox.top-root.top+targetBox.height/2};
  const scaleX=gameRenderer.bw/Math.max(1,flight.bw);
  const scaleY=gameRenderer.bh/Math.max(1,flight.bh);
  const pulse=1+.023*camera.lift;
  const sx=mix(1,scaleX,camera.travel)*pulse,sy=mix(1,scaleY,camera.travel)*pulse;
  const rotation=gameRenderer.portrait?-90:0;
  const x=mix(start.x,finish.x,camera.travel)+camera.lift*10;
  const y=mix(start.y,finish.y,camera.travel)-camera.lift*25;
  canvas.style.transform='translate3d('+(x-startBox.width/2)+'px,'+(y-startBox.height/2)+'px,0) rotate('+(rotation*camera.flatten)+'deg) scale('+sx+','+sy+')';
  canvas.style.setProperty('--flight-shadow',String(13+24*camera.lift));
  halo.style.setProperty('--flight-x',x+'px');halo.style.setProperty('--flight-y',y+'px');
  halo.style.opacity=String(Math.min(1,t*7,Math.max(0,(1-t)*10)));
  flight.draw({balls:movingRack(originals,rack,t),moving:false});
  if(t<1)requestAnimationFrame(tick);
  else{canvas.remove();halo.remove();done();}
 }
 requestAnimationFrame(tick);
}
