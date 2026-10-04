import {orientationOf,rotateVector} from './ball-orientation.js';
import {TABLE,POCKETS} from './physics.js';
import {paintFrame,paintCloth,paintRailDetails,paintPockets,FINISHES} from './table-finishes.js';
import {cueGeometry,strokeCharge} from './cue-feel.js';
import {paintCue} from './cue-art.js';
import {projectAim} from './aim-guide.js';
import {cueById} from './cue-catalog.js';

const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const halls=[
 {name:'The Parlor',felt:'#315d4a',feltLight:'#56816c',rail:'#54351f',wood:'#a46d3d',wall:'#102017',aura:'#254536',year:'1893',detail:'Walnut rails · sage baize · leather pockets'},
 {name:'The Observatory',felt:'#176a8e',feltLight:'#3a98b2',rail:'#3c3029',wood:'#725b46',wall:'#111924',aura:'#224565',year:'1911',detail:'Smoked oak · ocean cloth · silver sights'},
 {name:'The Foundry',felt:'#3e6651',feltLight:'#6e8f70',rail:'#302b29',wood:'#665748',wall:'#1d1b17',aura:'#3b4940',year:'1927',detail:'Dark ash · copper trim · olive baize'},
 {name:'The Wintergarden',felt:'#306c65',feltLight:'#5d9f91',rail:'#8b7960',wood:'#dbc49e',wall:'#172c27',aura:'#31594e',year:'1938',detail:'Pale oak · bottle-green cloth · round brass sights'},
 {name:'The Afterhours',felt:'#654354',feltLight:'#936b7b',rail:'#211c24',wood:'#4a373f',wall:'#19121d',aura:'#453040',year:'1964',detail:'Black lacquer · mulberry baize · twin silver inlays'},
];
export {halls};
function polygon(g,vertices){g.beginPath();g.moveTo(...vertices[0]);for(let i=1;i<vertices.length;i++)g.lineTo(...vertices[i]);g.closePath();}
function hexToRgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
export class TableRenderer{
 constructor(canvas,{view='perspective',hall=0,cacheStatic=true}={}){this.cacheStatic=cacheStatic;this.surface=null;this.surfaceKey='';this.canvas=canvas;this.g=canvas.getContext('2d');this.view=view;this.projectionBlend=view==='flat'?1:0;this.hall=hall;this.drawCount=0;this.ballTextures=new WeakMap();this.cueStyle=cueById('house');this.resize();}
 resize(){const box=this.canvas.getBoundingClientRect();this.w=Math.max(1,this.canvas.offsetWidth||box.width);this.h=Math.max(1,this.canvas.offsetHeight||box.height);this.dpr=Math.min(2,window.devicePixelRatio||1);this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.g.setTransform(this.dpr,0,0,this.dpr,0,0);this.geometry();}
 geometry(){
   // An upright table gives portrait phones a much larger aiming surface.
   // Both layouts share the same physical world and a reversible projection.
   this.portrait=this.w<=600&&this.h>this.w*1.24;
   if(this.portrait){
     const ratio=.405+.095*this.blend;
     this.bw=Math.min(this.h*.91,this.w*.91/ratio);
     this.bh=this.bw*ratio;
     this.center=this.h/2;this.top=(this.w-this.bh)/2;
     return;
   }
   const ratio=.375+.125*this.blend;
   const verticalRoom=this.view==="flat"?.82:.88;let bw=Math.min(this.w*(this.view==="flat"?.93:.91),(this.h*verticalRoom)/ratio);let bh=bw*ratio;
   if(bh>this.h*verticalRoom){bh=this.h*verticalRoom;bw=bh/ratio;}
   this.bw=bw;this.bh=bh;this.top=(this.h-bh)/2;this.center=this.w/2;}
 get blend(){return this.projectionBlend??(this.view==='flat'?1:0);}
 setView(view){this.view=view;this.projectionBlend=view==='flat'?1:0;this.geometry();}
 setBlend(amount){this.projectionBlend=clamp(amount,0,1);this.geometry();}
 setHall(i){this.hall=i;}
 /** A renderer concern only; never edits the ball simulation or shot input. */
 setCue(id){this.cueStyle=cueById(id);}
 project(x,y){
   if(this.portrait){const t=x/TABLE.width,k=1-.22*(1-this.blend)*t;
     return [this.w/2+(y/TABLE.height-.5)*this.bh*k,this.center-(t-.5)*this.bw,k];}
   const t=y/TABLE.height,k=1-.27*(1-this.blend)*(1-t);
   return [this.center+(x/TABLE.width-.5)*this.bw*k,this.top+this.bh*t,k];
 }
 unproject(sx,sy){
   if(this.portrait){const t=clamp(.5-(sy-this.center)/this.bw,0,1),k=1-.22*(1-this.blend)*t;
     return {x:t*TABLE.width,y:clamp(((sx-this.w/2)/(this.bh*k)+.5)*TABLE.height,0,TABLE.height)};}
   const t=clamp((sy-this.top)/this.bh,0,1),k=1-.27*(1-this.blend)*(1-t);
   return {x:clamp(((sx-this.center)/(this.bw*k)+.5)*TABLE.width,0,1000),y:t*TABLE.height};
 }
 clear(){this.g.clearRect(0,0,this.w,this.h);}
 draw(sim,{aim=null,interactive=false,placement=null,placementZone=null,fx=[],callPocket=null,callLabel=8,targetBall=null,pocketOwners=null,pocketOwnerNames=null,drillZone=null}={}){
  const g=this.g,P=(x,y)=>this.project(x,y);
  this.clear();g.save();
  if(this.cacheStatic&&typeof document!=='undefined'){
   const key=[this.canvas.width,this.canvas.height,this.hall,this.blend,this.portrait].join(':');
   if(!this.surface||this.surfaceKey!==key){
    this.surface??=document.createElement('canvas');
    if(this.surface.width!==this.canvas.width||this.surface.height!==this.canvas.height){
     this.surface.width=this.canvas.width;this.surface.height=this.canvas.height;
    }
    const surface=this.surface.getContext('2d');
    surface.setTransform(this.dpr,0,0,this.dpr,0,0);
    surface.clearRect(0,0,this.w,this.h);
    this.paintSurface(surface);
    this.surfaceKey=key;
   }
   g.drawImage(this.surface,0,0,this.w,this.h);
  }else this.paintSurface(g);
  if(placementZone&&!sim.moving)this.drawPlacementZone(sim,placementZone,placement);
  if(drillZone)this.drawDrillZone(drillZone);
  if(pocketOwners)this.drawPocketOwners(pocketOwners,pocketOwnerNames);
  if(callPocket!==null&&callPocket>=0)this.drawCalledPocket(callPocket,callLabel);
  if(targetBall!==null)this.drawTargetBall(sim,targetBall);
  if(interactive&&aim&&!sim.moving&&!sim.cue()?.pocketed)this.drawAim(sim,aim);
  else if(aim?.strike&&aim.strike.progress<1)this.drawStroke(aim.strike);
  // A placed-in-hand ball is a preview until confirmed; never draw two white
  // balls or mutate the authoritative simulation during positioning.
  for(const ball of [...sim.balls].filter(b=>!b.pocketed).sort((a,b)=>a.y-b.y)){
    if(placementZone&&placement?.candidate&&ball.id===0)continue;
    this.drawBall(ball);
  }
  if(interactive&&aim?.showGuide!==false&&!sim.moving&&!sim.cue()?.pocketed)this.drawCueStrike(sim.cue(),aim.spin);
  if(placement){
    const [sx,sy,k]=P(placement.x,placement.y);
    const r=Math.max(5,TABLE.radius*this.bw/1000*k);
    g.save();
    if(!placement.candidate){
      g.beginPath();g.arc(sx,sy,r*1.45,0,TAU);
      g.strokeStyle='#f09b85';g.lineWidth=1.8;g.setLineDash([3,4]);g.stroke();
      g.setLineDash([]);
    }else{
      const {x,y}=placement.candidate,[gx,gy,gk]=P(x,y);
      const gr=Math.max(5,TABLE.radius*this.bw/1000*gk);
      if(!placement.legal){
        g.beginPath();g.arc(sx,sy,r*.98,0,TAU);
        g.strokeStyle='rgba(239,123,106,.73)';g.lineWidth=1.3;g.stroke();
        g.beginPath();g.moveTo(sx,sy);g.lineTo(gx,gy);
        g.strokeStyle='rgba(255,231,173,.52)';g.lineWidth=1;
        g.setLineDash([3,4]);g.stroke();g.setLineDash([]);
      }
      // The white ball has a real-looking surface with a distinct mint ring
      // that indicates a valid landing location, not an actual physics ball.
      g.save();g.shadowColor='rgba(13,28,23,.7)';g.shadowBlur=6*gk;g.shadowOffsetY=2*gk;
      const skin=g.createRadialGradient(gx-gr*.35,gy-gr*.39,gr*.15,gx,gy,gr*1.05);
      skin.addColorStop(0,'#fffef7');skin.addColorStop(.6,'#e6e8de');skin.addColorStop(1,'#85958d');
      g.fillStyle=skin;g.beginPath();g.arc(gx,gy,gr,0,TAU);g.fill();g.restore();
      g.beginPath();g.arc(gx,gy,gr*1.6,0,TAU);
      g.strokeStyle='rgba(145,230,183,.95)';g.lineWidth=2;g.stroke();
      g.beginPath();g.arc(gx,gy,gr*2.3,0,TAU);
      g.strokeStyle='rgba(145,230,183,.27)';g.lineWidth=1;g.stroke();
    }
    g.restore();
  }
  for(const effect of fx){
    const [sx,sy]=P(effect.x,effect.y);
    if(effect.type==='impact'||effect.type==='cushion'){
      // A short material glint tied to collision strength, not camera shake.
      const t=1-effect.life,hard=effect.strength||0;
      g.save();g.beginPath();g.arc(sx,sy,2+(8+12*hard)*t,0,TAU);
      g.strokeStyle=`rgba(248,231,184,${effect.life*(.13+.34*hard)})`;
      g.lineWidth=effect.type==='impact'?1.25:1;g.stroke();
      if(effect.type==='impact'){
       g.beginPath();g.arc(sx,sy,1.1+1.7*hard,0,TAU);
       g.fillStyle=`rgba(255,247,221,${effect.life*(.17+.48*hard)})`;g.fill();
      }
      g.restore();
    }else if(effect.type==='pocket'){
      const t=1-effect.life;
      if(effect.id!==undefined){
        // The real numbered ball rolls over the lip, sinks and darkens into
        // the well, rather than a flat dot teleporting to the pocket centre.
        const e=t*t*(3-2*t),slide=Math.min(1,t*1.25);
        const wx=effect.sourceX+(effect.x-effect.sourceX)*(slide*slide*(3-2*slide));
        const wy=effect.sourceY+(effect.y-effect.sourceY)*(slide*slide*(3-2*slide));
        this.drawBall({id:effect.id,color:effect.color,x:wx,y:wy,rotation:0,
          orientation:effect.orientation||[1,0,0,0],opacity:Math.max(0,1-.55*e*e)},1-.46*e,Math.min(.96,e*1.1));
        g.save();g.beginPath();g.arc(sx,sy,Math.max(1,6+t*26),0,TAU);
        g.strokeStyle=`rgba(239,207,139,${effect.life*.28})`;g.lineWidth=1.4;g.stroke();g.restore();
      }else{
        const [px,py]=P(effect.sourceX,effect.sourceY);
        const x=px+(sx-px)*t,y=py+(sy-py)*t,r=Math.max(0,TABLE.radius*this.bw/1000*(1-.93*t));
        g.save();g.shadowColor='#080d0a';g.shadowBlur=9*t;
        g.beginPath();g.arc(x,y,r,0,TAU);g.fillStyle=effect.color||'#eee5d8';g.fill();
        g.restore();
        g.beginPath();g.arc(sx,sy,Math.max(1,t*25),0,TAU);
        g.strokeStyle=`rgba(239,207,139,${effect.life*.35})`;g.lineWidth=1.6;g.stroke();
      }
    }else{
      g.beginPath();g.arc(sx,sy,(1-effect.life)*28,0,TAU);
      g.strokeStyle=`rgba(239,207,139,${effect.life*.65})`;g.lineWidth=2;g.stroke();
    }
  }
  g.restore();this.drawCount++;
 }
 paintSurface(g){
  const h=halls[this.hall],finish=FINISHES[this.hall],P=(x,y)=>this.project(x,y),margin=TABLE.radius*1.8;
  paintFrame(g,{P,h,finish,bw:this.bw,blend:this.blend,portrait:this.portrait,margin});
  paintCloth(g,{P,h,finish,bw:this.bw,blend:this.blend});
  paintRailDetails(g,{P,finish,bw:this.bw,margin});
  paintPockets(g,{P,finish,bw:this.bw,blend:this.blend});
 }
 stripeTexture(ball){
  const previous=this.ballTextures.get(ball);
  if(previous&&Math.abs(previous.rotation-(ball.rotation||0))<.035)return previous.canvas;
  const size=56,canvas=previous?.canvas||document.createElement('canvas');
  if(!previous){canvas.width=size;canvas.height=size;}
  const context=canvas.getContext('2d'),image=context.createImageData(size,size);
  const normal=rotateVector(orientationOf(ball),[0,1,0]),hex=ball.color.replace('#',''),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
   const u=(px+.5-size/2)/(size/2),v=(py+.5-size/2)/(size/2),d=u*u+v*v;
   if(d>1)continue;
   const z=Math.sqrt(1-d),stripe=Math.abs(normal[0]*u+normal[1]*v+normal[2]*z)<.41;
   const color=stripe?rgb:[244,241,232],i=(py*size+px)*4;
   image.data[i]=color[0];image.data[i+1]=color[1];image.data[i+2]=color[2];image.data[i+3]=255;
  }
  context.putImageData(image,0,0);
  this.ballTextures.set(ball,{canvas,rotation:ball.rotation||0});
  return canvas;
 }
 drawBall(ball,scale=1,dark=0){
  const g=this.g,[sx,sy,k]=this.project(ball.x,ball.y),r=Math.max(3,TABLE.radius*this.bw/1000*k)*scale;
  if(ball.trail&&ball.trail.opacity>.005){
   const [px,py]=this.project(ball.trail.x,ball.trail.y);
   g.save();g.lineCap='round';const sheen=g.createLinearGradient(px,py,sx,sy);
   sheen.addColorStop(0,'rgba(255,242,208,0)');sheen.addColorStop(1,ball.color);
   g.globalAlpha=ball.trail.opacity*(ball.opacity??1);
   g.beginPath();g.moveTo(px,py);g.lineTo(sx,sy);
   g.strokeStyle=sheen;g.lineWidth=Math.max(1.2,r*.85);g.stroke();g.restore();
  }
  g.save();g.globalAlpha=ball.opacity??1;g.translate(sx,sy);
  g.beginPath();g.ellipse(r*.10,r*.21,r*1.03,r*.85,0,0,TAU);g.fillStyle='rgba(0,0,0,.28)';g.fill();
  g.beginPath();g.arc(0,0,r,0,TAU);g.clip();
  if(ball.id>=9)g.drawImage(this.stripeTexture(ball),-r,-r,2*r,2*r);
  else{g.fillStyle=ball.color;g.fillRect(-r,-r,2*r,2*r);}
  const light=g.createRadialGradient(-r*.45,-r*.56,r*.04,r*.06,r*.1,r*1.5);
  light.addColorStop(0,'rgba(255,255,255,.66)');light.addColorStop(.29,'rgba(255,255,255,.12)');
  light.addColorStop(.64,'rgba(0,0,0,0)');light.addColorStop(1,'rgba(0,0,0,.7)');
  g.fillStyle=light;g.fillRect(-r,-r,r*2,r*2);
  const q=orientationOf(ball);
  for(const local of [[0,0,1],[0,0,-1]]){
   const n=rotateVector(q,local);
   if(n[2]<.19)continue;
   const theta=Math.atan2(n[1],n[0]);
   g.save();g.translate(n[0]*r*.73,n[1]*r*.73);g.rotate(theta);g.scale(Math.max(.2,n[2]),1);
   if(ball.id===0){
    g.beginPath();g.arc(0,0,r*.105,0,TAU);g.fillStyle='#c84d3e';g.fill();
   }else{
    g.beginPath();g.arc(0,0,r*.37,0,TAU);g.fillStyle='#f7f4ec';g.fill();
    g.strokeStyle='rgba(33,29,28,.22)';g.lineWidth=Math.max(.25,r*.024);g.stroke();
    g.fillStyle='#1b1b1b';g.textAlign='center';g.textBaseline='middle';
    g.font=`800 ${r*(ball.id>=10?.47:.59)}px system-ui`;
    g.fillText(String(ball.id),0,0);
   }
   g.restore();
  }
  if(dark>0){g.fillStyle=`rgba(3,5,5,${Math.min(1,dark)})`;g.fillRect(-r,-r,r*2,r*2);}
  g.restore();
 }

 drawPlacementZone(sim,zone,placement){
   // All coordinates come from the same geometry used by canPlaceCue.
   const g=this.g,P=(x,y)=>this.project(x,y);
   const left=30,right=zone==='break'?265:970,top=30,bottom=470;
   const boundary=[P(left,top),P(right,top),P(right,bottom),P(left,bottom)];
   g.save();
   polygon(g,boundary);g.fillStyle='rgba(183,232,202,.038)';g.fill();
   g.setLineDash([6,6]);g.lineWidth=1.25;
   g.strokeStyle='rgba(196,229,207,.6)';g.stroke();g.setLineDash([]);
   if(placement&&!placement.legal){
     const blockers=sim.balls.filter(ball=>!ball.pocketed&&ball.id!==0)
       .map(ball=>({ball,distance:Math.hypot(placement.x-ball.x,placement.y-ball.y)}))
       .filter(item=>item.distance<50).sort((a,b)=>a.distance-b.distance).slice(0,1);
     for(const {ball} of blockers){
       const [x,y,k]=P(ball.x,ball.y),r=Math.max(5,26*this.bw/1000*k);
       g.beginPath();g.arc(x,y,r,0,TAU);g.lineWidth=1.35;
       g.strokeStyle='rgba(250,165,124,.62)';g.stroke();
     }
   }
   g.restore();
 }
 // Skill drills with a position or speed goal: a dashed ring where the ball has to finish.
 drawDrillZone(zone){
   const g=this.g,[x,y,k]=this.project(zone.x,zone.y),r=zone.r*this.bw/1000*(k||1);
   g.save();g.beginPath();g.ellipse(x,y,r,r*(.77+.23*this.blend),0,0,TAU);
   g.fillStyle='rgba(120,220,170,.10)';g.fill();g.setLineDash([6,5]);g.lineWidth=2;g.strokeStyle='rgba(150,235,190,.9)';g.stroke();g.restore();
 }
 // One-pocket: a coloured ring and the owner's mark at each player's pocket.
 drawPocketOwners(owners,names){
   const colors=['rgba(237,201,130,.95)','rgba(142,185,236,.95)'];
   owners.forEach((index,seat)=>{
     const target=POCKETS[index];if(!target)return;
     const g=this.g,[x,y]=this.project(target[0],target[1]),scale=this.bw/1000,radius=Math.max(11,34*scale);
     const cx=Math.min(Math.max(x,radius*.9),this.w-radius*.9),cy=Math.min(Math.max(y,radius*.9),this.h-radius*.9);
     g.save();g.beginPath();g.arc(cx,cy,radius,0,TAU);g.lineWidth=2.4;g.strokeStyle=colors[seat];g.stroke();
     g.fillStyle=colors[seat];g.font='800 '+Math.max(8,radius*.5)+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';
     g.fillText(String(names?.[seat]??seat+1),cx,cy);g.restore();
   });
 }
 // The pocket named for the 8 under "call the 8": a gold ring and numeral at the well.
 drawCalledPocket(index,label=8){
   const target=POCKETS[index];if(!target)return;
   const g=this.g,[x,y]=this.project(target[0],target[1]),scale=this.bw/1000,radius=Math.max(11,34*scale);
   // Pull the marker onto the cloth so corner wells (centred off the table) stay visible.
   const cx=Math.min(Math.max(x,radius*.9),this.w-radius*.9),cy=Math.min(Math.max(y,radius*.9),this.h-radius*.9);
   g.save();
   g.beginPath();g.arc(cx,cy,radius,0,TAU);g.fillStyle='rgba(240,205,120,.16)';g.fill();
   g.lineWidth=2;g.strokeStyle='rgba(247,214,138,.95)';g.setLineDash([5,4]);g.stroke();g.setLineDash([]);
   g.fillStyle='rgba(255,236,176,.95)';g.font='800 '+Math.max(9,radius*.62)+'px system-ui,sans-serif';
   g.textAlign='center';g.textBaseline='middle';g.fillText(String(label),cx,cy);
   g.restore();
 }
 // Nine-ball: a soft ring marks the lowest ball, the only legal first contact.
 drawTargetBall(sim,id){
   const ball=sim.balls.find(b=>b.id===id&&!b.pocketed);if(!ball)return;
   const g=this.g,[x,y,k]=this.project(ball.x,ball.y),r=Math.max(5,TABLE.radius*this.bw/1000*k);
   g.save();g.beginPath();g.arc(x,y,r*1.55,0,TAU);
   g.strokeStyle='rgba(247,214,138,.85)';g.lineWidth=1.6;g.setLineDash([4,4]);g.stroke();g.setLineDash([]);
   g.beginPath();g.arc(x,y,r*2.05,0,TAU);g.strokeStyle='rgba(247,214,138,.25)';g.lineWidth=1;g.stroke();
   g.restore();
 }
 drawAim(sim,aim){
   const {angle}=aim,g=this.g,cue=sim.cue();if(!cue)return;
   if(aim.showGuide===false){this.drawCue(cue,angle,aim.drawback||0);return;}
   const guideMode=aim.guideMode||'full';
   if(guideMode==='off'){this.drawCue(cue,angle,aim.drawback||0);if(aim.marker)this.drawAimMarker(aim.marker);return;}
   const guide=projectAim(sim.balls,cue,angle,guideMode==='short'?{maxObjectLength:60,maxCueLength:230,maxDeflectLength:40}:{});if(!guide)return;
   const [sx,sy]=this.project(cue.x,cue.y),[ex,ey]=this.project(guide.cueEnd.x,guide.cueEnd.y);
   const scale=this.bw/1000,ballR=Math.max(5,TABLE.radius*scale);
   g.save();g.lineCap='round';
   // 1. The cue ball's path to contact: a clean line that fades in from the ball.
   const path=g.createLinearGradient(sx,sy,ex,ey);
   path.addColorStop(0,'rgba(253,254,252,.28)');path.addColorStop(.35,'rgba(253,254,252,.9)');path.addColorStop(1,'rgba(253,254,252,.95)');
   g.beginPath();g.moveTo(sx,sy);g.lineTo(ex,ey);
   g.lineWidth=Math.max(1.2,1.7*scale);g.strokeStyle=path;g.stroke();
   // 2. The ghost ball: where the cue ball will be when it touches.
   g.beginPath();g.arc(ex,ey,ballR,0,TAU);
   g.fillStyle='rgba(255,255,255,.1)';g.fill();g.lineWidth=1.3;g.strokeStyle='rgba(255,255,255,.7)';g.stroke();
   if(guide.target&&guide.objectEnd){
     const [tx,ty]=this.project(guide.target.x,guide.target.y),[ox,oy]=this.project(guide.objectEnd.x,guide.objectEnd.y);
     // 3. The struck ball's route: warm gold, solid, fading with distance, with a tip dot.
     const hit=g.createLinearGradient(tx,ty,ox,oy);
     hit.addColorStop(0,'rgba(255,214,120,.95)');hit.addColorStop(1,'rgba(255,214,120,.18)');
     g.beginPath();g.moveTo(tx,ty);g.lineTo(ox,oy);g.lineWidth=Math.max(1.6,2.4*scale);g.strokeStyle=hit;g.stroke();
     g.beginPath();g.arc(ox,oy,Math.max(1.6,2.2*scale),0,TAU);g.fillStyle='rgba(255,214,120,.5)';g.fill();
     // 4. The cue ball after contact: a short, thin, cool line off the tangent.
     if(guide.cueAfter){
       const [cx,cy]=this.project(guide.cueAfter.x,guide.cueAfter.y);
       const cut=g.createLinearGradient(ex,ey,cx,cy);
       cut.addColorStop(0,'rgba(170,222,255,.9)');cut.addColorStop(1,'rgba(170,222,255,.1)');
       g.beginPath();g.moveTo(ex,ey);g.lineTo(cx,cy);g.setLineDash([Math.max(3,4*scale),Math.max(3,4*scale)]);
       g.lineWidth=Math.max(1.2,1.7*scale);g.strokeStyle=cut;g.stroke();g.setLineDash([]);
     }
   }
   if(aim.marker)this.drawAimMarker(aim.marker,scale);
   g.restore();
   this.drawCue(cue,angle,aim.drawback||0);
 }
 // Where a tap or drag asked the cue to point: a fading crosshair so the
 // player sees what the touch was understood as.
 drawAimMarker(marker,scale=this.bw/1000){
   const g=this.g,[mx,my]=this.project(marker.x,marker.y),size=Math.max(6,9*scale+3);
   g.save();g.globalAlpha=Math.max(0,Math.min(1,marker.alpha??1));
   g.strokeStyle='rgba(255,236,176,.95)';g.lineWidth=1.4;
   g.beginPath();g.arc(mx,my,size,0,TAU);
   g.moveTo(mx-size*1.5,my);g.lineTo(mx-size*.55,my);g.moveTo(mx+size*.55,my);g.lineTo(mx+size*1.5,my);
   g.moveTo(mx,my-size*1.5);g.lineTo(mx,my-size*.55);g.moveTo(mx,my+size*.55);g.lineTo(mx,my+size*1.5);
   g.stroke();g.restore();
 }
 // The dot is an aim-only contact-point indicator, not simulated 3D impact.
 drawCueStrike(cue,spin){
   if(!spin||Math.hypot(spin.x||0,spin.y||0)<.035)return;
   const [cx,cy,k]=this.project(cue.x,cue.y),r=Math.max(3,TABLE.radius*this.bw/1000*k);
   const x=cx+Math.max(-1,Math.min(1,spin.x||0))*r*.59;
   const y=cy-Math.max(-1,Math.min(1,spin.y||0))*r*.59;
   const g=this.g;g.save();
   g.beginPath();g.arc(x,y,Math.max(1.8,r*.21),0,TAU);
   g.fillStyle='#ae3e30';g.shadowColor='#30201a';g.shadowBlur=Math.max(1,r*.2);g.fill();
   g.lineWidth=Math.max(.5,r*.07);g.strokeStyle='#fff3db';g.stroke();g.restore();
 }
 drawStroke({cue,angle,power,progress}){
  // Replay one visible stroke from the pre-shot cue-ball position, even after
  // the physics starts moving. Contact is already decided by the simulation.
  const charge=strokeCharge(progress,power);
  this.drawCue(cue,angle,charge,1-Math.max(0,progress-.68)/.32);
  if(progress>.43&&progress<.93){
    const [x,y]=this.project(cue.x,cue.y),r=TABLE.radius*this.bw/1000;
    const t=(progress-.43)/.5;
    const g=this.g;g.save();g.globalAlpha=(1-t)*.43;
    g.beginPath();g.arc(x,y,r*(1.5+t*3.2),0,TAU);g.lineWidth=2;
    g.strokeStyle='#fff0c7';g.stroke();g.restore();
  }
 }
 drawCue(cue,angle,drawback=0,opacity=1){
  const g=this.g,style=this.cueStyle||cueById('house'),{tip,grip,butt}=cueGeometry(cue,angle,drawback);
  const [tx,ty]=this.project(tip.x,tip.y),[gx,gy]=this.project(grip.x,grip.y),[bx,by]=this.project(butt.x,butt.y);
  const width=clamp(this.bw/560, .56, 1.28);
  g.save();g.globalAlpha=clamp(opacity,0,1);
  paintCue(g,{x:tx,y:ty},{x:bx,y:by},style,{scale:width*1.22});
  g.restore();
  g.save();g.globalAlpha=clamp(opacity,0,1);g.lineCap='round';
  if(drawback>.03){
    const [cx,cy]=this.project(cue.x,cue.y);
    const v=Math.min(1,drawback);g.beginPath();g.arc(cx,cy,Math.max(5,TABLE.radius*this.bw/1000)*(1.28+.22*v),0,TAU);
    g.strokeStyle='rgba(243,213,140,'+(.15+.55*v)+')';g.lineWidth=(.9+1.1*v)*width;g.stroke();
    g.beginPath();g.moveTo(tx,ty);g.lineTo(cx,cy);g.setLineDash([2.5,4]);
    g.strokeStyle='rgba(255,226,170,'+(.15+.43*v)+')';g.lineWidth=1.1*width;g.stroke();g.setLineDash([]);
  }
  g.restore();
 }

}
