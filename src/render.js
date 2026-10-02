import {TABLE,POCKETS} from './physics.js';

const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const halls=[
 {name:'The Parlor',felt:'#315f4e',feltLight:'#467a65',rail:'#633f26',wood:'#ab7544',wall:'#102017',year:'1893',detail:'Walnut rails · sage baize · classic pockets'},
 {name:'The Observatory',felt:'#1e7499',feltLight:'#3daccb',rail:'#60472b',wood:'#ad8554',wall:'#111924',year:'1911',detail:'Oak rails · midnight cloth · tight pockets'},
 {name:'The Foundry',felt:'#38654b',feltLight:'#54816a',rail:'#40302b',wood:'#805a42',wall:'#1d1b17',year:'1927',detail:'Ash rails · tournament green · fast cloth'},
];
export {halls};
function polygon(g,vertices){g.beginPath();g.moveTo(...vertices[0]);for(let i=1;i<vertices.length;i++)g.lineTo(...vertices[i]);g.closePath();}
function hexToRgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
export class TableRenderer{
 constructor(canvas,{view='perspective',hall=0}={}){this.canvas=canvas;this.g=canvas.getContext('2d');this.view=view;this.projectionBlend=view==='flat'?1:0;this.hall=hall;this.drawCount=0;this.resize();}
 resize(){const box=this.canvas.getBoundingClientRect();this.w=Math.max(1,box.width);this.h=Math.max(1,box.height);this.dpr=Math.min(2,window.devicePixelRatio||1);this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.g.setTransform(this.dpr,0,0,this.dpr,0,0);this.geometry();}
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
   let bw=Math.min(this.w*.92,(this.h*.88)/ratio);let bh=bw*ratio;
   if(bh>this.h*.88){bh=this.h*.88;bw=bh/ratio;}
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
  const g=this.g,h=halls[this.hall],P=(x,y)=>this.project(x,y),margin=TABLE.radius*1.8;
  this.clear();g.save();
  const front=[P(-margin,-margin),P(TABLE.width+margin,-margin),P(TABLE.width+margin,TABLE.height+margin),P(-margin,TABLE.height+margin)];
  if(this.blend<1&&!this.portrait){
   const bl=front[3],br=front[2],leg=clamp(this.bw*.19,22,90);g.save();g.globalAlpha=1-this.blend;g.fillStyle='#382416';g.shadowColor='#0008';g.shadowBlur=15;g.shadowOffsetY=9;
   for(const corner of [bl,br]){polygon(g,[[corner[0]-this.bw*.035,corner[1]-2],[corner[0]+this.bw*.035,corner[1]-2],[corner[0]+this.bw*.019,corner[1]+leg],[corner[0]-this.bw*.019,corner[1]+leg]]);g.fill();}
   polygon(g,[[bl[0],bl[1]],[br[0],br[1]],[br[0]-this.bw*.006,br[1]+Math.max(9,this.bw*.044)],[bl[0]+this.bw*.006,bl[1]+Math.max(9,this.bw*.044)]]);
   const apron=g.createLinearGradient(0,bl[1],0,bl[1]+this.bw*.045);apron.addColorStop(0,h.wood);apron.addColorStop(.25,h.rail);apron.addColorStop(1,'#21150d');g.fillStyle=apron;g.fill();g.restore();
  }
  g.save();g.shadowColor='rgba(0,0,0,.68)';g.shadowBlur=24;g.shadowOffsetY=25-14*this.blend;
  polygon(g,front);const wood=g.createLinearGradient(0,this.top,0,this.top+this.bh);wood.addColorStop(0,h.wood);wood.addColorStop(.32,h.rail);wood.addColorStop(1,'#21160e');g.fillStyle=wood;g.fill();g.restore();
  polygon(g,front);g.lineWidth=3;g.strokeStyle='#24180f';g.stroke();
  const cloth=[P(0,0),P(1000,0),P(1000,500),P(0,500)];polygon(g,cloth);
  const felt=g.createLinearGradient(0,this.top,0,this.top+this.bh);felt.addColorStop(0,h.feltLight);felt.addColorStop(1,h.felt);g.fillStyle=felt;g.fill();
  g.save();polygon(g,cloth);g.clip();
  const lamp=g.createRadialGradient(this.center,this.top+this.bh*.35,3,this.center,this.top+this.bh*.35,this.bw*.6);
  lamp.addColorStop(0,'rgba(242,225,179,.16)');lamp.addColorStop(1,'rgba(5,17,13,.16)');g.fillStyle=lamp;g.fillRect(0,0,this.w,this.h);
  g.restore();
  g.strokeStyle='rgba(242,226,186,.15)';g.lineWidth=1;g.stroke();
  // Rail sights and pocket wells are in world coordinates, for both views.
  g.fillStyle='#dcc49a';for(const y of [-margin*.6,500+margin*.6])for(const x of [130,290,710,870]){const [sx,sy,k]=P(x,y);g.save();g.translate(sx,sy);g.rotate(Math.PI/4);g.globalAlpha=.66;g.fillRect(-2*k,-2*k,4*k,4*k);g.restore();}
  POCKETS.forEach(([x,y],index)=>{const [sx,sy,k]=P(x,clamp(y,0,500));const r=(index===1||index===4?21:25)*this.bw/1000*k;
    g.beginPath();g.ellipse(sx,sy,r,r*(.71+.29*this.blend),0,0,TAU);g.fillStyle='#080907';g.fill();g.strokeStyle='rgba(185,144,91,.42)';g.lineWidth=3;g.stroke();});
  if(interactive&&aim&&!sim.moving&&!sim.cue()?.pocketed)this.drawAim(sim,aim);
  for(const ball of [...sim.balls].filter(b=>!b.pocketed).sort((a,b)=>a.y-b.y))this.drawBall(ball);
  if(placement){
    const [sx,sy,k]=P(placement.x,placement.y),r=Math.max(5,TABLE.radius*this.bw/1000*k);
    g.save();g.beginPath();g.arc(sx,sy,r,0,TAU);g.fillStyle=placement.legal?'rgba(248,247,230,.8)':'rgba(201,93,74,.6)';g.fill();
    g.beginPath();g.arc(sx,sy,r*1.42,0,TAU);g.strokeStyle=placement.legal?'#edc982':'#e97b64';g.lineWidth=2;g.stroke();g.restore();
  }
  for(const effect of fx){const [sx,sy]=P(effect.x,effect.y);g.beginPath();g.arc(sx,sy,(1-effect.life)*28,0,TAU);g.strokeStyle=`rgba(239,207,139,${effect.life*.65})`;g.lineWidth=2;g.stroke();}
  g.restore();this.drawCount++;
 }
 drawOverlay(sim,{aim=null,interactive=false,placement=null,fx=[]}={},projector){
  // The overlay is 2D by design: labels and aim remain sharp while the balls
  // and table beneath them are actual geometry drawn by WebGL.
  this.clear();const ownProject=this.project;
  this.project=(x,y)=>projector.project(x,y);
  try{
   if(interactive&&aim&&!sim.moving&&!sim.cue()?.pocketed)this.drawAim(sim,aim);
   const g=this.g;
   if(placement){const [sx,sy]=this.project(placement.x,placement.y),[rx,ry]=this.project(Math.min(1000,placement.x+TABLE.radius),placement.y),r=Math.max(5,Math.hypot(rx-sx,ry-sy));
    g.beginPath();g.arc(sx,sy,r,0,TAU);g.fillStyle=placement.legal?'#eee8debb':'#c9654ab0';g.fill();
    g.beginPath();g.arc(sx,sy,r*1.4,0,TAU);g.strokeStyle=placement.legal?'#edc982':'#e97b64';g.lineWidth=2;g.stroke();}
   for(const effect of fx){const [sx,sy]=this.project(effect.x,effect.y);g.beginPath();g.arc(sx,sy,(1-effect.life)*28,0,TAU);g.strokeStyle=`rgba(239,207,139,${effect.life*.65})`;g.lineWidth=2;g.stroke();}
  }finally{this.project=ownProject;}
 }
 drawBall(ball){const g=this.g,[sx,sy,k]=this.project(ball.x,ball.y),r=Math.max(3,TABLE.radius*this.bw/1000*k),side=1+.02*(1-this.blend);
  g.save();g.globalAlpha=ball.opacity??1;g.translate(sx,sy);g.scale(1,side);
  g.beginPath();g.ellipse(1.5,3,r*1.06,r*.72,0,0,TAU);g.fillStyle='rgba(0,0,0,.32)';g.fill();
  g.beginPath();g.arc(0,0,r,0,TAU);g.clip();const shade=g.createRadialGradient(-r*.38,-r*.52,r*.1,0,0,r*1.5);
  shade.addColorStop(0,'#fff9e9');shade.addColorStop(.24,ball.color);shade.addColorStop(.75,ball.color);shade.addColorStop(1,'#161713');g.fillStyle=shade;g.fillRect(-r,-r,r*2,r*2);
  if(ball.id>=9){g.save();g.rotate(ball.rotation*.17);g.fillStyle='#f7f4e9';g.fillRect(-r,-r*.4,2*r,r*.8);g.restore();}
  if(ball.id){g.beginPath();g.arc(-r*.12,-r*.12,r*.39,0,TAU);g.fillStyle='#f6f3e8';g.fill();g.fillStyle='#181512';g.font=`bold ${Math.max(5,r*.65)}px system-ui`;g.textAlign='center';g.textBaseline='middle';g.fillText(String(ball.id),-r*.12,-r*.09);}
  g.restore();}
 drawAim(sim,{angle,power}){const g=this.g,cue=sim.cue();if(!cue)return;
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
  // Full-length cue. The shaft follows the same vector as the physical shot,
  // with a short gap to the cue ball and a darker tapered butt at the rear.
  const gap=r*1.45+power*28,reach=gap+355;
  const [tipX,tipY]=this.project(cue.x-dx*gap,cue.y-dy*gap);
  const [buttX,buttY]=this.project(cue.x-dx*reach,cue.y-dy*reach);
  const [gripX,gripY]=this.project(cue.x-dx*(reach-110),cue.y-dy*(reach-110));
  g.lineCap='round';g.beginPath();g.moveTo(buttX,buttY);g.lineTo(gripX,gripY);g.strokeStyle='#472816';g.lineWidth=7;g.stroke();
  g.beginPath();g.moveTo(gripX,gripY);g.lineTo(tipX,tipY);g.strokeStyle='#e1b885';g.lineWidth=3.2;g.stroke();
  g.beginPath();g.arc(tipX,tipY,2.3,0,TAU);g.fillStyle='#e6eff4';g.fill();g.restore();}
}
