import {TABLE} from './physics.js';
import {paintFrame,paintCloth,paintRailDetails,paintPockets,FINISHES} from './table-finishes.js';
import {cueGeometry,strokeCharge} from './cue-feel.js';

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
 constructor(canvas,{view='perspective',hall=0,cacheStatic=true}={}){this.cacheStatic=cacheStatic;this.surface=null;this.surfaceKey='';this.canvas=canvas;this.g=canvas.getContext('2d');this.view=view;this.projectionBlend=view==='flat'?1:0;this.hall=hall;this.drawCount=0;this.resize();}
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
 draw(sim,{aim=null,interactive=false,placement=null,fx=[]}={}){
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
  if(interactive&&aim&&!sim.moving&&!sim.cue()?.pocketed)this.drawAim(sim,aim);
  else if(aim?.strike&&aim.strike.progress<1)this.drawStroke(aim.strike);
  for(const ball of [...sim.balls].filter(b=>!b.pocketed).sort((a,b)=>a.y-b.y))this.drawBall(ball);
  if(placement){
    const [sx,sy,k]=P(placement.x,placement.y),r=Math.max(5,TABLE.radius*this.bw/1000*k);
    g.save();g.beginPath();g.arc(sx,sy,r,0,TAU);g.fillStyle=placement.legal?'rgba(248,247,230,.8)':'rgba(201,93,74,.6)';g.fill();
    g.beginPath();g.arc(sx,sy,r*1.42,0,TAU);g.strokeStyle=placement.legal?'#edc982':'#e97b64';g.lineWidth=2;g.stroke();g.restore();
  }
  for(const effect of fx){const [sx,sy]=P(effect.x,effect.y);g.beginPath();g.arc(sx,sy,(1-effect.life)*28,0,TAU);g.strokeStyle=`rgba(239,207,139,${effect.life*.65})`;g.lineWidth=2;g.stroke();}
  g.restore();this.drawCount++;
 }
 paintSurface(g){
  const h=halls[this.hall],finish=FINISHES[this.hall],P=(x,y)=>this.project(x,y),margin=TABLE.radius*1.8;
  paintFrame(g,{P,h,finish,bw:this.bw,blend:this.blend,portrait:this.portrait,margin});
  paintCloth(g,{P,h,finish,bw:this.bw,blend:this.blend});
  paintRailDetails(g,{P,finish,bw:this.bw,margin});
  paintPockets(g,{P,finish,bw:this.bw,blend:this.blend});
 }
 drawBall(ball){const g=this.g,[sx,sy,k]=this.project(ball.x,ball.y),r=Math.max(3,TABLE.radius*this.bw/1000*k),side=1+.02*(1-this.blend);
  if(ball.trail&&ball.trail.opacity>.005){
   const [px,py]=this.project(ball.trail.x,ball.trail.y);
   g.save();g.lineCap='round';
   const sheen=g.createLinearGradient(px,py,sx,sy);
   sheen.addColorStop(0,'rgba(255,242,208,0)');sheen.addColorStop(1,ball.color);
   g.globalAlpha=ball.trail.opacity*(ball.opacity??1);
   g.beginPath();g.moveTo(px,py);g.lineTo(sx,sy);
   g.strokeStyle=sheen;g.lineWidth=Math.max(1.2,r*.85);g.stroke();g.restore();
  }
  g.save();g.globalAlpha=ball.opacity??1;g.translate(sx,sy);g.scale(1,side);
  g.beginPath();g.ellipse(1.5,3,r*1.06,r*.72,0,0,TAU);g.fillStyle='rgba(0,0,0,.32)';g.fill();
  g.beginPath();g.arc(0,0,r,0,TAU);g.clip();const shade=g.createRadialGradient(-r*.38,-r*.52,r*.1,0,0,r*1.5);
  shade.addColorStop(0,'#fff9e9');shade.addColorStop(.24,ball.color);shade.addColorStop(.75,ball.color);shade.addColorStop(1,'#161713');g.fillStyle=shade;g.fillRect(-r,-r,r*2,r*2);
  if(ball.id>=9){g.save();g.rotate(ball.rotation*.17);g.fillStyle='#f7f4e9';g.fillRect(-r,-r*.4,2*r,r*.8);g.restore();}
  if(ball.id){g.beginPath();g.arc(-r*.12,-r*.12,r*.39,0,TAU);g.fillStyle='#f6f3e8';g.fill();g.fillStyle='#181512';g.font=`bold ${Math.max(5,r*.65)}px system-ui`;g.textAlign='center';g.textBaseline='middle';g.fillText(String(ball.id),-r*.12,-r*.09);}
  g.restore();}
 drawAim(sim,aim){const {angle,power}=aim,g=this.g,cue=sim.cue();if(!cue)return;
  const dx=Math.cos(angle),dy=Math.sin(angle),r=TABLE.radius;let limit=1300,target=null;
  for(const ball of sim.balls){if(ball.id===0||ball.pocketed)continue;
    const rx=ball.x-cue.x,ry=ball.y-cue.y,t=rx*dx+ry*dy,perp2=rx*rx+ry*ry-t*t;
    if(t<=0||perp2>(2*r)**2)continue;
    const hit=t-Math.sqrt(Math.max(0,(2*r)**2-perp2));if(hit<limit){limit=hit;target=ball;}}
  const candidates=[];if(dx>1e-7)candidates.push((988-cue.x)/dx);if(dx<-1e-7)candidates.push((r-cue.x)/dx);if(dy>1e-7)candidates.push((488-cue.y)/dy);if(dy<-1e-7)candidates.push((r-cue.y)/dy);const rail=Math.min(...candidates);
  limit=clamp(Math.min(limit,rail),0,1300);
  const [sx,sy]=this.project(cue.x,cue.y),[ex,ey]=this.project(cue.x+dx*limit,cue.y+dy*limit);
  g.save();g.beginPath();g.moveTo(sx,sy);g.lineTo(ex,ey);g.lineWidth=1.8;g.strokeStyle='rgba(253,254,252,.97)';g.stroke();
  g.beginPath();g.arc(ex,ey,Math.max(5,r*this.bw/1000),0,TAU);g.strokeStyle='rgba(242,217,160,.65)';g.stroke();
  if(target&&limit<rail){const [tx,ty]=this.project(target.x,target.y);g.beginPath();g.moveTo(tx,ty);g.lineTo(tx+(tx-ex)*2.4,ty+(ty-ey)*2.4);g.setLineDash([3,5]);g.strokeStyle='rgba(230,207,152,.45)';g.stroke();g.setLineDash([]);}
  g.restore();
  this.drawCue(cue,angle,aim.drawback||0);
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
