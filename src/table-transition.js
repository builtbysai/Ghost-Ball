import {TableRenderer} from './render.js';

// The table remains one continuous object while the clubhouse becomes the match.
// Work in table/world coordinates; CSS handles the camera move and rotation.
export const smooth = t => {const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
export const mix = (a,b,t) => a+(b-a)*t;
export function entrancePose(progress,portrait=false){
 const t=Math.max(0,Math.min(1,progress));
 const travel=smooth((t-.035)/.87),unroll=smooth((t-.14)/.65);
 const float=Math.sin(Math.PI*travel);
 return {travel,unroll,rotation:portrait?-90*travel:2.8*float,
  scale:1+.037*float,lift:-Math.sin(Math.PI*travel)*22};
}

export function movingRack(before,after,progress){
 const origins=new Map(before.map(ball=>[ball.id,ball]));
 return after.map(ball=>{
   const origin=origins.get(ball.id);
   const stagger=(ball.id*7%17)/17*.17;
   const t=smooth((progress-.18-stagger)/(.78-stagger));
   // Pocketed exhibition balls enter from their last known pocket position.
   const from=origin||ball;
   const distance=Math.hypot(ball.x-from.x,ball.y-from.y);
   const drift=Math.sin(Math.PI*t)*Math.min(35,distance*.058);
   const entering=!origin||origin.pocketed;
   return {...ball,pocketed:false,opacity:entering?smooth((t-.02)/.25):1,
     x:mix(from.x,ball.x,t)+drift*Math.sin(ball.id*2.4),
     y:mix(from.y,ball.y,t)+drift*Math.cos(ball.id*2.4),
     rotation:mix(from.rotation||0,ball.rotation||0,t)+Math.sin(Math.PI*t)*distance*.017};
 });
}

export function flyTable({app,source,target,from,to,hall,gameRenderer,done,isActive=()=>true}){
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){done();return;}
 const sourceBox=source.getBoundingClientRect(),appBox=app.getBoundingClientRect();
 if(sourceBox.width<2||sourceBox.height<2){done();return;}
 const canvas=document.createElement('canvas');
 canvas.className='table-flight';canvas.setAttribute('aria-hidden','true');
 canvas.style.width=sourceBox.width+'px';canvas.style.height=sourceBox.height+'px';
 app.append(canvas);
 const flight=new TableRenderer(canvas,{view:'perspective',hall});
 flight.resize();
 // Render the flying board above its displayed size so zooming in remains crisp.
 const resolution=Math.min(3.5,Math.max(flight.dpr,gameRenderer.canvas.width/Math.max(1,sourceBox.width)*.9));
 if(resolution>flight.dpr){flight.dpr=resolution;canvas.width=Math.round(flight.w*resolution);canvas.height=Math.round(flight.h*resolution);flight.g.setTransform(resolution,0,0,resolution,0,0);}
 const start={x:sourceBox.left-appBox.left+sourceBox.width/2,y:sourceBox.top-appBox.top+sourceBox.height/2};
 const origins=from.balls.map(b=>({...b})),destination=to.balls.map(b=>({...b}));
 // Match the exact existing table on the first paint, before the next RAF.
 canvas.style.transform='translate3d('+(start.x-sourceBox.width/2)+'px,'+(start.y-sourceBox.height/2)+'px,0)';
 flight.draw({balls:origins,moving:false});
 let started=null;
 const duration=1680;
 function tick(now){
   if(!canvas.isConnected||!isActive()){canvas.remove();done();return;}
   started??=now;
   const t=Math.min(1,(now-started)/duration);
   // The perspective unrolls gradually into a perfectly flat overhead board.
   const pose=entrancePose(t,gameRenderer.portrait);
   flight.setBlend(pose.unroll);
   const tableBox=target.getBoundingClientRect(),root=app.getBoundingClientRect();
   const finish={x:tableBox.left-root.left+tableBox.width/2,y:tableBox.top-root.top+tableBox.height/2};
   // Recalculate only the visual target, so a resize mid-flight does not snap.
   const scaleX=gameRenderer.bw/Math.max(1,flight.bw);
   const scaleY=gameRenderer.bh/Math.max(1,flight.bh);
   const sx=mix(1,scaleX,pose.travel)*pose.scale,sy=mix(1,scaleY,pose.travel)*pose.scale;
   const x=mix(start.x,finish.x,pose.travel)-sourceBox.width/2;
   const y=mix(start.y,finish.y,pose.travel)-sourceBox.height/2+pose.lift;
   canvas.style.transform='translate3d('+x+'px,'+y+'px,0) rotate('+pose.rotation+'deg) scale('+sx+','+sy+')';
   const sim={balls:movingRack(origins,destination,t),moving:false};
   const glow=t>.83?[{x:805,y:250,life:Math.max(0,1-(t-.83)/.17)}]:[];
   flight.draw(sim,{fx:glow});
   if(t<1)requestAnimationFrame(tick);
   else{canvas.remove();done();}
 }
 requestAnimationFrame(tick);
}
