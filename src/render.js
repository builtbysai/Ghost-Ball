import {TABLE,POCKETS} from './physics.js';
import {cueGeometry,strokeOffset} from './shot-feel.js';

const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const halls=[
 {name:'The Parlor',felt:'#355f51',feltLight:'#4c826d',feltDark:'#1d4239',metal:'#caa36c',rail:'#4d291c',wood:'#96613b',wall:'#102017',year:'1893',detail:'Walnut rails · sage baize · classic pockets'},
 {name:'The Observatory',felt:'#20677f',feltLight:'#318da4',feltDark:'#113e55',metal:'#c6b2a0',rail:'#302c31',wood:'#665b58',wall:'#111924',year:'1911',detail:'Smoked oak · midnight teal cloth · pewter trim'},
 {name:'The Foundry',felt:'#46624a',feltLight:'#66836a',feltDark:'#293d32',metal:'#bb9662',rail:'#292422',wood:'#5a4536',wall:'#1d1b17',year:'1927',detail:'Weathered ash · olive felt · aged brass'},
];
export {halls};
function polygon(g,vertices){g.beginPath();g.moveTo(...vertices[0]);for(let i=1;i<vertices.length;i++)g.lineTo(...vertices[i]);g.closePath();}
export class TableRenderer{
 constructor(canvas,{view='perspective',hall=0}={}){this.canvas=canvas;this.g=canvas.getContext('2d');this.view=view;this.projectionBlend=view==='flat'?1:0;this.hall=hall;this.drawCount=0;this.boardCache=null;this.morphing=false;this.resize();}
 resize(){const box=this.canvas.getBoundingClientRect();this.w=Math.max(1,box.width);this.h=Math.max(1,box.height);this.dpr=Math.min(2,window.devicePixelRatio||1);this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.g.setTransform(this.dpr,0,0,this.dpr,0,0);this.boardCache=null;this.geometry();}
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
 setView(view){this.view=view;this.projectionBlend=view==='flat'?1:0;this.morphing=false;this.boardCache=null;this.geometry();}
 setBlend(amount){this.projectionBlend=clamp(amount,0,1);this.morphing=true;this.boardCache=null;this.geometry();}
 setHall(i){if(this.hall!==i){this.hall=i;this.boardCache=null;}}
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
 draw(sim,{aim=null,interactive=false,placement=null,fx=[],stroke=null}={}){
 const g=this.g,h=halls[this.hall],P=(x,y)=>this.project(x,y),margin=TABLE.radius*1.95;
 this.clear();
 if(this.morphing)this.drawBoard(g,h,P,margin);
 else{
   if(!this.boardCache){
     const board=document.createElement('canvas');board.width=this.canvas.width;board.height=this.canvas.height;
     const ctx=board.getContext('2d');
     if(ctx){ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.drawBoard(ctx,h,P,margin);this.boardCache=board;}
   }
   if(this.boardCache)g.drawImage(this.boardCache,0,0,this.w,this.h);
   else this.drawBoard(g,h,P,margin);
 }
 g.save();
 if(stroke&&stroke.progress<1)
   this.drawCueStick({x:stroke.x,y:stroke.y},stroke.angle,stroke.drawback,strokeOffset(stroke.progress,stroke.power,TABLE.radius),Math.min(1,(1-stroke.progress)*2));
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
 // Static canvas board: complex material work is only performed on
 // resize, hall change or during the cinematic camera interpolation.
 drawBoard(g,h,P,m){
  const front=[P(-m,-m),P(1000+m,-m),P(1000+m,500+m),P(-m,500+m)];
  const cloth=[P(0,0),P(1000,0),P(1000,500),P(0,500)];
  const [cx,cy]=P(500,250);
  g.save();g.lineJoin='round';
  if(this.blend<1&&!this.portrait){
    const alpha=1-this.blend,leg=clamp(this.bw*.16,20,92);
    g.save();g.globalAlpha=alpha;g.shadowBlur=19;g.shadowColor='#0009';
    for(const corner of [front[3],front[2]]){
      const x=corner[0],y=corner[1],w=clamp(this.bw*.022,9,23);
      polygon(g,[[x-w,y],[x+w,y],[x+w*.65,y+leg],[x-w*.6,y+leg]]);
      const shade=g.createLinearGradient(x-w,0,x+w,0);
      shade.addColorStop(0,'#1c130e');shade.addColorStop(.35,h.wood);shade.addColorStop(1,h.rail);
      g.fillStyle=shade;g.fill();
    }
    polygon(g,[front[3],front[2],[front[2][0]-8,front[2][1]+leg*.63],[front[3][0]+8,front[3][1]+leg*.63]]);
    g.fillStyle=h.rail;g.fill();g.restore();
  }
  g.save();g.shadowColor='#020607c9';g.shadowBlur=clamp(this.bw*.028,13,32);g.shadowOffsetY=11;
  polygon(g,front);
  const wood=g.createLinearGradient(...front[0].slice(0,2),...front[2].slice(0,2));
  wood.addColorStop(0,h.wood);wood.addColorStop(.21,h.rail);wood.addColorStop(.53,h.wood);wood.addColorStop(.81,h.rail);wood.addColorStop(1,'#1d130f');
  g.fillStyle=wood;g.fill();g.restore();
  polygon(g,front);g.strokeStyle='#1b120e';g.lineWidth=clamp(this.bw/260,2,5);g.stroke();
  // Restrained satin grain follows the four wooden rails.
  g.save();polygon(g,front);g.clip();
  for(let i=0;i<12;i++){
    const d=m*(.11+i*.065),line=(x,y,u,v,ink,alpha)=>{
      const a=P(x,y),b=P(u,v);
      g.beginPath();g.moveTo(...a);g.lineTo(...b);
      g.strokeStyle=ink;g.globalAlpha=alpha;g.lineWidth=i%4===0?1.4:.65;g.stroke();
    };
    line(22,-d,978,-d,i%3===0?'#f4c88b':'#150c0b',i%3===0?.12:.10);
    line(22,500+d,978,500+d,i%3===0?'#f4c88b':'#150c0b',i%3===0?.12:.10);
    line(-d,19,-d,481,i%3===0?'#f4c88b':'#150c0b',.09);
    line(1000+d,19,1000+d,481,i%3===0?'#f4c88b':'#150c0b',.09);
  }
  g.restore();
  // Separate trim profiles lend each hall a recognizable metal/wood finish.
  for(const y of [-m*.61,500+m*.61]){
    const a=P(24,y),b=P(976,y);
    g.beginPath();g.moveTo(...a);g.lineTo(...b);
    g.strokeStyle=h.metal;g.globalAlpha=.51;g.lineWidth=1.35;g.stroke();
  }
  for(const x of [-m*.61,1000+m*.61]){
    const a=P(x,24),b=P(x,476);
    g.beginPath();g.moveTo(...a);g.lineTo(...b);
    g.strokeStyle=h.metal;g.globalAlpha=.51;g.lineWidth=1.35;g.stroke();
  }
  g.globalAlpha=1;
  polygon(g,cloth);g.strokeStyle='#111613';g.lineWidth=clamp(this.bw/160,3.5,8);g.stroke();
  polygon(g,cloth);
  const felt=g.createLinearGradient(...P(0,0).slice(0,2),...P(1000,500).slice(0,2));
  felt.addColorStop(0,h.feltLight);felt.addColorStop(.57,h.felt);felt.addColorStop(1,h.feltDark);
  g.fillStyle=felt;g.fill();
  g.save();polygon(g,cloth);g.clip();
  if(!this.feltPattern){
    const tile=document.createElement('canvas');tile.width=64;tile.height=64;
    const t=tile.getContext('2d');
    if(t){
      for(let i=0;i<245;i++){
        const x=(i*29.735+i*i*.013)%64,y=(i*53.17+i*i*.023)%64;
        t.fillStyle=i%3?'#03101010':'#fff9ec12';t.fillRect(x,y,.75,.7);
      }
      this.feltPattern=tile;
    }
  }
  if(this.feltPattern){g.fillStyle=g.createPattern(this.feltPattern,'repeat');g.fillRect(0,0,this.w,this.h);}
  const lamp=g.createRadialGradient(cx-this.bh*.1,cy-this.bh*.16,6,cx,cy,this.bw*.62);
  lamp.addColorStop(0,'#fff8d222');lamp.addColorStop(.53,'#ffffff06');lamp.addColorStop(1,'#000c183f');
  g.fillStyle=lamp;g.fillRect(0,0,this.w,this.h);
  g.restore();
  polygon(g,cloth);g.strokeStyle=h.feltLight;g.globalAlpha=.42;g.lineWidth=1;g.stroke();g.globalAlpha=1;
  const sight=(x,y)=>{
    const [sx,sy,k]=P(x,y),r=clamp(this.bw/430,1.2,2.65)*k;
    g.save();g.translate(sx,sy);g.rotate(Math.PI/4);
    g.fillStyle='#130f0c';g.fillRect(-r-.6,-r-.6,2*r+1.2,2*r+1.2);
    g.fillStyle=h.metal;g.fillRect(-r,-r,2*r,2*r);
    g.fillStyle='#fff6cf77';g.fillRect(-r*.42,-r*.42,r*.75,r*.75);g.restore();
  };
  for(const x of [150,345,655,850]){sight(x,-m*.55);sight(x,500+m*.55);}
  for(const y of [165,335]){sight(-m*.55,y);sight(1000+m*.55,y);}
  for(let i=0;i<POCKETS.length;i++){
    const [x,y]=POCKETS[i],[sx,sy,k]=P(x,clamp(y,0,500));
    const r=(i===1||i===4?21:26)*this.bw/1000*k,ry=.72+.28*this.blend;
    g.save();g.translate(sx,sy);g.shadowColor='#000b';g.shadowBlur=5;
    g.beginPath();g.ellipse(0,0,r*1.27,r*ry*1.25,0,0,TAU);
    g.fillStyle='#291a12';g.fill();g.shadowBlur=0;
    g.strokeStyle=h.metal;g.globalAlpha=.64;g.lineWidth=clamp(r*.16,1.1,2.5);g.stroke();g.globalAlpha=1;
    g.beginPath();g.ellipse(0,0,r,r*ry,0,0,TAU);
    const well=g.createRadialGradient(-r*.24,-r*.24,1,0,0,r*1.2);
    well.addColorStop(0,'#010304');well.addColorStop(.72,'#070b0b');well.addColorStop(1,'#2a1b14');
    g.fillStyle=well;g.fill();g.restore();
  }
  g.restore();
 }
 drawBall(ball){
  const g=this.g,[sx,sy,k]=this.project(ball.x,ball.y),r=Math.max(3,TABLE.radius*this.bw/1000*k),side=1+.02*(1-this.blend);
  g.save();g.globalAlpha=ball.opacity??1;g.translate(sx,sy);g.scale(1,side);
  g.beginPath();g.ellipse(1.3,Math.max(2,r*.27),r*1.07,r*.79,0,0,TAU);
  g.fillStyle='rgba(0,4,8,.36)';g.fill();
  g.beginPath();g.arc(0,0,r,0,TAU);g.clip();
  const striped=ball.id>=9,base=striped?'#eeeae2':ball.color;
  const shade=g.createRadialGradient(-r*.34,-r*.43,r*.06,r*.12,r*.15,r*1.55);
  shade.addColorStop(0,'#fffdf2');shade.addColorStop(.24,base);shade.addColorStop(.69,base);shade.addColorStop(1,'#1a1b1b');
  g.fillStyle=shade;g.fillRect(-r,-r,2*r,2*r);
  if(striped){
   g.save();g.rotate((ball.rotation||0)*.13);
   g.fillStyle=ball.color;g.fillRect(-r,-r*.46,2*r,r*.92);
   g.fillStyle='#111a1a38';g.fillRect(-r,-r*.47,2*r,r*.065);g.fillRect(-r,r*.405,2*r,r*.065);
   g.restore();
  }
  const glare=g.createRadialGradient(-r*.5,-r*.62,0,-r*.32,-r*.4,r*.89);
  glare.addColorStop(0,'#ffffff60');glare.addColorStop(1,'#ffffff00');
  g.fillStyle=glare;g.fillRect(-r,-r,2*r,2*r);
  if(ball.id){
   g.beginPath();g.ellipse(-r*.08,-r*.09,r*.41,r*.39,0,0,TAU);
   g.fillStyle='#f9f5ec';g.fill();
   g.fillStyle='#1d1b19';g.font=`800 ${Math.max(5,r*.68)}px system-ui`;
   g.textAlign='center';g.textBaseline='middle';g.fillText(String(ball.id),-r*.08,-r*.075);
  }
  g.restore();
 }
 drawAim(sim,{angle,power,drawback=0}){const g=this.g,cue=sim.cue();if(!cue)return;
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
  g.restore();this.drawCueStick(cue,angle,drawback);
 }

 // Both dragging hit targets and the graphic use cueGeometry, so the
 // visible, pulled-back shaft stays touchable even at full power.
 drawCueStick(cue,angle,drawback=0,forward=0,opacity=1){
  const g=this.g,dx=Math.cos(angle),dy=Math.sin(angle);
  const {gap,reach,grip}=cueGeometry(TABLE.radius,drawback);
  const [tx,ty]=this.project(cue.x-dx*(gap-forward),cue.y-dy*(gap-forward));
  const [bx,by]=this.project(cue.x-dx*(reach-forward),cue.y-dy*(reach-forward));
  const [gx,gy]=this.project(cue.x-dx*(grip-forward),cue.y-dy*(grip-forward));
  g.save();g.lineCap='round';g.globalAlpha=opacity;
  g.beginPath();g.moveTo(bx+1.3,by+2);g.lineTo(tx+1.3,ty+2);
  g.lineWidth=7;g.strokeStyle='#0b181980';g.stroke();
  g.beginPath();g.moveTo(bx,by);g.lineTo(gx,gy);
  g.strokeStyle='#4b2e1b';g.lineWidth=7;g.stroke();
  g.beginPath();g.moveTo(bx,by);g.lineTo(gx,gy);
  g.strokeStyle='#b08250';g.lineWidth=1.3;g.stroke();
  g.beginPath();g.moveTo(gx,gy);g.lineTo(tx,ty);
  g.strokeStyle='#e8c89c';g.lineWidth=3.4;g.stroke();
  g.beginPath();g.arc(tx,ty,2.4,0,TAU);g.fillStyle='#d7e7ef';g.fill();
  g.restore();
 }

}
