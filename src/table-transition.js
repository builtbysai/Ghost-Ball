import {TableRenderer} from './render.js';

// The table remains one continuous object while the clubhouse becomes the match.
// Work in table/world coordinates; CSS handles the camera move and rotation.
export const smooth = t => {const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
export const mix = (a,b,t) => a+(b-a)*t;

export function movingRack(before,after,progress){
 const origins=new Map(before.map(ball=>[ball.id,ball]));
 return after.map(ball=>{
   const origin=origins.get(ball.id);
   const stagger=(ball.id*7%17)/17*.17;
   const t=smooth((progress-.11-stagger)/(.79-stagger));
   // Pocketed exhibition balls enter from their last known pocket position.
   const from=origin||ball;
   const drift=Math.sin(Math.PI*t)*Math.min(24,Math.hypot(ball.x-from.x,ball.y-from.y)*.042);
   return {...ball,pocketed:Boolean(origin?.pocketed)&&t<.06,
     x:mix(from.x,ball.x,t)+drift*Math.sin(ball.id*2.4),
     y:mix(from.y,ball.y,t)+drift*Math.cos(ball.id*2.4),
     rotation:mix(from.rotation||0,ball.rotation||0,t)};
 });
}

export function flyTable({app,source,target,from,to,hall,gameRenderer,done}){
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){done();return;}
 const sourceBox=source.getBoundingClientRect(),appBox=app.getBoundingClientRect();
 if(sourceBox.width<2||sourceBox.height<2){done();return;}
 const canvas=document.createElement('canvas');
 canvas.className='table-flight';canvas.setAttribute('aria-hidden','true');
 canvas.style.width=sourceBox.width+'px';canvas.style.height=sourceBox.height+'px';
 app.append(canvas);
 const flight=new TableRenderer(canvas,{view:'perspective',hall});
 flight.resize();
 const start={x:sourceBox.left-appBox.left+sourceBox.width/2,y:sourceBox.top-appBox.top+sourceBox.height/2};
 const origins=from.balls.map(b=>({...b})),destination=to.balls.map(b=>({...b}));
 let started=null;
 const duration=1300;
 function tick(now){
   if(!canvas.isConnected){done();return;}
   started??=now;
   const t=Math.min(1,(now-started)/duration),move=smooth(t);
   // The perspective unrolls gradually into a perfectly flat overhead board.
   flight.setBlend(smooth((t-.18)/.72));
   const tableBox=target.getBoundingClientRect(),root=app.getBoundingClientRect();
   const finish={x:tableBox.left-root.left+tableBox.width/2,y:tableBox.top-root.top+tableBox.height/2};
   // Recalculate only the visual target, so a resize mid-flight does not snap.
   const portrait=gameRenderer.portrait;
   const scaleX=gameRenderer.bw/Math.max(1,flight.bw);
   const scaleY=gameRenderer.bh/Math.max(1,flight.bh);
   const sx=mix(1,scaleX,move),sy=mix(1,scaleY,move);
   const rotation=portrait?-90:0;
   const x=mix(start.x,finish.x,move)-sourceBox.width/2;
   const y=mix(start.y,finish.y,move)-sourceBox.height/2;
   canvas.style.transform='translate3d('+x+'px,'+y+'px,0) rotate('+(rotation*move)+'deg) scale('+sx+','+sy+')';
   const sim={balls:movingRack(origins,destination,t),moving:false};
   flight.draw(sim);
   if(t<1)requestAnimationFrame(tick);
   else{canvas.remove();done();}
 }
 requestAnimationFrame(tick);
}
