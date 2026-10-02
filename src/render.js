import {orientationOf,rotateVector} from './ball-orientation.js';
import {TABLE} from './physics.js';
import {paintFrame,paintCloth,paintRailDetails,paintPockets,FINISHES} from './table-finishes.js';
import {cueGeometry,strokeCharge} from './cue-feel.js';
import {projectAim} from './aim-guide.js';

const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const halls=[
 {name:'The Parlor',felt:'#315d4a',feltLight:'#56816c',rail:'#54351f',wood:'#a46d3d',wall:'#102017',aura:'#254536',year:'1893',detail:'Walnut rails · sage baize · leather pockets'},
 {name:'The Observatory',felt:'#176a8e',feltLight:'#3a98b2',rail:'#3c3029',wood:'#725b46',wall:'#111924',aura:'#224565',year:'1911',detail:'Smoked oak · ocean cloth · silver sights'},
 {name:'The Foundry',felt:'#3e6651',feltLight:'#6e8f70',rail:'#302b29',wood:'#665748',wall:'#1d1b17',aura:'#3b4940',year:'1927',detail:'Dark ash · copper trim · olive baize'},
];
export {halls};
function polygon(g,vertices){g.beginPath();g.moveTo(...vertices[0]);for(let i=1;i<vertices.length;i++)g.lineTo(...vertices[i]);g.closePath();}
function hexToRgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
export class TableRenderer{
 constructor(canvas,{view='perspective',hall=0,cacheStatic=true}={}){this.cacheStatic=cacheStatic;this.surface=null;this.surfaceKey='';this.canvas=canvas;this.g=canvas.getContext('2d');this.view=view;this.projectionBlend=view==='flat'?1:0;this.hall=hall;this.drawCount=0;this.ballTextures=new WeakMap();this.resize();}
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
   const verticalRoom=this.view==='flat'?.82:.88;let bw=Math.min(this.w*.89,(this.h*verticalRoom)/ratio);let bh=bw*ratio;
   if(bh>this.h*verticalRoom){bh=this.h*verticalRoom;bw=bh/ratio;}
   this.bw=bw;this.bh=bh;this.top=(this.h-bh)/2;this.center=this.w/2;}
 get blend(){return this.projectionBlend??(this.view==='flat'?1:0);}
 setView(view){this.view=view;this.projectionBlend=view==='flat'?1:0;this.geometry();}
 setBlend(amount){this.projectionBlend=clamp(amount,0,1);this.geometry();}
 setHall(i){this.hall=i;}
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
 draw(sim,{aim=null,interactive=false,placement=null,placementZone=null,fx=[]}={}){
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
  if(interactive&&aim&&!sim.moving&&!sim.cue()?.pocketed)this.drawAim(sim,aim);
  else if(aim?.strike&&aim.strike.progress<1)this.drawStroke(aim.strike);
  for(const ball of [...sim.balls].filter(b=>!b.pocketed).sort((a,b)=>a.y-b.y))this.drawBall(ball);
  if(interactive&&aim?.showGuide!==false&&!sim.moving&&!sim.cue()?.pocketed)this.drawCueStrike(sim.cue(),aim.spin);
  if(placement){
    const [sx,sy,k]=P(placement.x,placement.y),r=Math.max(5,TABLE.radius*this.bw/1000*k);
    g.save();g.beginPath();g.arc(sx,sy,r,0,TAU);g.fillStyle=placement.legal?'rgba(248,247,230,.8)':'rgba(201,93,74,.6)';g.fill();
    g.beginPath();g.arc(sx,sy,r*1.42,0,TAU);g.strokeStyle=placement.legal?'#edc982':'#e97b64';g.lineWidth=2;g.stroke();
    if(placement.suggestion&&!placement.legal){
      const [tx,ty]=P(placement.suggestion.x,placement.suggestion.y);
      g.beginPath();g.moveTo(sx,sy);g.lineTo(tx,ty);g.setLineDash([3,4]);
      g.strokeStyle='rgba(235,216,161,.65)';g.lineWidth=1;g.stroke();g.setLineDash([]);
      g.beginPath();g.arc(tx,ty,r*.95,0,TAU);g.fillStyle='#f4f4e5dc';g.fill();
      g.beginPath();g.arc(tx,ty,r*1.6,0,TAU);g.strokeStyle='#8ce9b0';g.lineWidth=2;g.stroke();
    }
    g.restore();
  }
  for(const effect of fx){
    const [sx,sy]=P(effect.x,effect.y);
    if(effect.type==='pocket'){
      const t=1-effect.life;
      const [px,py]=P(effect.sourceX,effect.sourceY);
      const x=px+(sx-px)*t,y=py+(sy-py)*t,r=Math.max(0,TABLE.radius*this.bw/1000*(1-.93*t));
      g.save();g.shadowColor='#080d0a';g.shadowBlur=9*t;
      g.beginPath();g.arc(x,y,r,0,TAU);g.fillStyle=effect.color||'#eee5d8';g.fill();
      g.restore();
      g.beginPath();g.arc(sx,sy,Math.max(1,t*25),0,TAU);
      g.strokeStyle=`rgba(239,207,139,${effect.life*.35})`;g.lineWidth=1.6;g.stroke();
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
 drawBall(ball){
  const g=this.g,[sx,sy,k]=this.project(ball.x,ball.y),r=Math.max(3,TABLE.radius*this.bw/1000*k);
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
     for(const ball of sim.balls){
       if(ball.pocketed||ball.id===0||Math.hypot(placement.x-ball.x,placement.y-ball.y)>90)continue;
       const [x,y,k]=P(ball.x,ball.y),r=Math.max(5,26*this.bw/1000*k);
       g.beginPath();g.arc(x,y,r,0,TAU);g.lineWidth=1.35;
       g.strokeStyle='rgba(250,144,108,.68)';g.stroke();
     }
   }
   g.restore();
 }
 drawAim(sim,aim){
   const {angle}=aim,g=this.g,cue=sim.cue();if(!cue)return;
   if(aim.showGuide===false){this.drawCue(cue,angle,aim.drawback||0);return;}
   const guide=projectAim(sim.balls,cue,angle);if(!guide)return;
   const [sx,sy]=this.project(cue.x,cue.y),[ex,ey]=this.project(guide.cueEnd.x,guide.cueEnd.y);
   const scale=this.bw/1000;
   g.save();g.lineCap='round';
   g.beginPath();g.moveTo(sx,sy);g.lineTo(ex,ey);
   g.lineWidth=Math.max(1.2,1.8*scale);g.strokeStyle='rgba(253,254,252,.95)';g.stroke();
   g.beginPath();g.arc(ex,ey,Math.max(5,TABLE.radius*scale),0,TAU);
   g.lineWidth=1.1;g.strokeStyle='rgba(242,217,160,.65)';g.stroke();
   if(guide.target&&guide.objectEnd){
     const [tx,ty]=this.project(guide.target.x,guide.target.y);
     const [ox,oy]=this.project(guide.objectEnd.x,guide.objectEnd.y);
     g.beginPath();g.moveTo(tx,ty);g.lineTo(ox,oy);
     g.setLineDash([Math.max(3,4*scale),Math.max(4,6*scale)]);
     g.strokeStyle='rgba(245,219,156,.85)';g.lineWidth=Math.max(1.15,1.9*scale);g.stroke();g.setLineDash([]);
   }
   g.restore();
   this.drawCue(cue,angle,aim.drawback||0);
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
  const g=this.g,{tip,grip,butt}=cueGeometry(cue,angle,drawback);
  const [tx,ty]=this.project(tip.x,tip.y),[gx,gy]=this.project(grip.x,grip.y),[bx,by]=this.project(butt.x,butt.y);
  const width=clamp(this.bw/560, .56, 1.28);
  g.save();g.globalAlpha=clamp(opacity,0,1);g.lineCap='round';
  // Contact shadows and a slender taper communicate a polished physical cue.
  g.shadowColor='rgba(0,0,0,.64)';g.shadowBlur=5*width;g.shadowOffsetY=2.8*width;
  g.beginPath();g.moveTo(bx,by);g.lineTo(gx,gy);g.strokeStyle='#2b1a13';g.lineWidth=8.8*width;g.stroke();
  g.shadowBlur=0;g.shadowOffsetY=0;
  const wood=g.createLinearGradient(bx-3,by-4,gx+3,gy+4);
  wood.addColorStop(0,'#231712');wood.addColorStop(.28,'#925f35');
  wood.addColorStop(.72,'#b5844e');wood.addColorStop(1,'#3e2419');
  g.beginPath();g.moveTo(bx,by);g.lineTo(gx,gy);g.strokeStyle=wood;g.lineWidth=6.4*width;g.stroke();
  g.beginPath();g.moveTo(gx,gy);g.lineTo(tx,ty);g.strokeStyle='#e3c391';g.lineWidth=3.15*width;g.stroke();
  g.beginPath();g.moveTo(gx,gy);g.lineTo(tx,ty);g.strokeStyle='rgba(255,246,207,.52)';g.lineWidth=.85*width;g.stroke();
  const ring=this.project(cue.x-Math.cos(angle)*(cueGeometry(cue,angle,drawback).reach-92),cue.y-Math.sin(angle)*(cueGeometry(cue,angle,drawback).reach-92));
  g.beginPath();g.moveTo(gx,gy);g.lineTo(...ring);g.strokeStyle='#ddc693';g.lineWidth=1.8*width;g.stroke();
  g.beginPath();g.arc(tx,ty,2.3*width,0,TAU);g.fillStyle='#d7e8f0';g.fill();
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
