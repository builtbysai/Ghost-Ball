/** All five tables share physical geometry, not the same paint job.
 * All detail is visual: no changes to cushion or pocket collision coordinates.
 */
import {POCKETS,TABLE} from './physics.js';
const C=(n,a,b)=>Math.max(a,Math.min(b,n));
const mix=(hex,target,amount)=>{const n=parseInt(hex.slice(1),16),c=[n>>16&255,n>>8&255,n&255].map(v=>Math.round(v+(target-v)*amount));return `rgb(${c[0]},${c[1]},${c[2]})`;};
const lighten=(hex,amount)=>mix(hex,255,amount),darken=(hex,amount)=>mix(hex,0,amount);
const path=(g,points)=>{g.beginPath();g.moveTo(points[0][0],points[0][1]);for(const p of points.slice(1))g.lineTo(p[0],p[1]);g.closePath();};
const line=(g,a,b)=>{g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();};
let weave=null;
function feltWeave(){
 if(weave||typeof document==='undefined')return weave;
 const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
 if(!g)return null;
 // Deterministic micro-fibers; made once and tiled, never randomized per frame.
 for(let i=0;i<220;i++){const x=(i*47+13*i*i)%64,y=(i*29+7*i*i)%64;
   g.fillStyle=i%3?'rgba(255,248,214,.12)':'rgba(1,12,15,.24)';
   g.fillRect(x,y,i%4?1:.5,i%3?1.3:2);}
 weave=c;return weave;
}
export const FINISHES=[
 {trim:'#bc966a',inlay:'#efddb9',grain:'#f3bb71',cushion:'#214934',pocket:'#332019',light:'#ebce9a',vignette:'#071a11',name:'walnut'},
 {trim:'#b0ac9e',inlay:'#f3efde',grain:'#d9bd9b',cushion:'#114b5e',pocket:'#202b32',light:'#a7dbe8',vignette:'#03263e',name:'smoked oak'},
 {trim:'#b48660',inlay:'#d1b28d',grain:'#8c6655',cushion:'#264936',pocket:'#27211c',light:'#d1c8a5',vignette:'#101c14',name:'dark ash'},
 {trim:'#c7a466',inlay:'#f3e3ba',grain:'#f4dcb1',cushion:'#23534b',pocket:'#3b301e',light:'#fff0d1',vignette:'#193e33',name:'pale oak and brass',motif:'brass-disc'},
 {trim:'#adb9c5',inlay:'#f0f2f2',grain:'#71606a',cushion:'#493040',pocket:'#16151c',light:'#c7c0cb',vignette:'#271e31',name:'black lacquer and silver',motif:'twin-bars'},
];
export function paintFrame(g,{P,h,finish,bw,blend,portrait,margin}){
 const edge=[P(-margin,-margin),P(TABLE.width+margin,-margin),P(TABLE.width+margin,TABLE.height+margin),P(-margin,TABLE.height+margin)];
 const front=P(-margin,-margin),back=P(TABLE.width+margin,TABLE.height+margin);
 // Solid support beneath the exhibition table; it recedes as the view
 // comes overhead rather than popping in and out during the camera move.
 if(blend<.95&&!portrait){
  g.save();g.globalAlpha=1-blend;
  const foot=C(bw*.17,18,70);
  for(const x of [55,945]){
    const [sx,sy]=P(x,500+margin);
    const footGrad=g.createLinearGradient(sx-11,sy,sx+12,sy+foot);
    footGrad.addColorStop(0,h.wood);footGrad.addColorStop(.42,h.rail);footGrad.addColorStop(1,'#16100e');
    path(g,[[sx-16,sy-3],[sx+16,sy-3],[sx+10,sy+foot],[sx-10,sy+foot]]);
    g.fillStyle=footGrad;g.fill();g.strokeStyle='#100e0b';g.lineWidth=2;g.stroke();
  }
  g.restore();
 }
 g.save();g.shadowColor='rgba(0,0,0,.78)';g.shadowBlur=C(bw*.043,12,42);g.shadowOffsetY=10+14*(1-blend);
 path(g,edge);
 const wood=g.createLinearGradient(front[0],front[1],back[0],back[1]);
 wood.addColorStop(0,finish.grain);wood.addColorStop(.08,h.wood);wood.addColorStop(.37,h.rail);
 wood.addColorStop(.63,h.wood);wood.addColorStop(.93,h.rail);wood.addColorStop(1,'#1a1411');
 g.fillStyle=wood;g.fill();g.restore();
 g.save();path(g,edge);g.clip();g.lineCap='round';
 // Polished lengthwise grain follows the physical table when it rotates.
 const count=12;
 for(let i=0;i<count;i++){
   const d=-margin+(i+.5)*margin/count;
   g.strokeStyle=i%3?'rgba(22,13,11,.13)':'rgba(255,232,185,.13)';
   g.lineWidth=i%4===0?1.4:.75;
   line(g,P(25,d),P(975,d));
   line(g,P(25,500-d),P(975,500-d));
 }
 for(let i=0;i<6;i++){
   const d=-margin+(i+.5)*margin/6;
   g.strokeStyle=i%2?'rgba(255,226,164,.11)':'rgba(0,0,0,.14)';
   g.lineWidth=.8;line(g,P(d,60),P(d,440));line(g,P(1000-d,60),P(1000-d,440));
 }
 g.restore();
 path(g,edge);g.strokeStyle='#17130f';g.lineWidth=C(bw/330,1.3,3.5);g.stroke();
 const inset=margin*.66;const upper=[P(-inset,-inset),P(1000+inset,-inset),P(1000+inset,500+inset),P(-inset,500+inset)];
 path(g,upper);g.strokeStyle=finish.trim;g.lineWidth=C(bw/530,1,2.4);g.globalAlpha=.83;g.stroke();g.globalAlpha=1;
 // A real apron is only visible from the clubhouse's pitched camera.
 if(blend<.98&&!portrait){
   const a=P(-margin,500+margin),b=P(1000+margin,500+margin);
   const height=C(bw*.072,13,48)*(1-blend);
   g.save();g.shadowColor='#000a';g.shadowBlur=12;g.shadowOffsetY=7;
   path(g,[a,b,[b[0]-bw*.016,b[1]+height],[a[0]+bw*.016,a[1]+height]]);
   const apron=g.createLinearGradient(a[0],a[1],a[0],a[1]+height+3);
   apron.addColorStop(0,finish.trim);apron.addColorStop(.19,h.rail);apron.addColorStop(1,'#201612');
   g.fillStyle=apron;g.fill();g.restore();
   g.strokeStyle=finish.trim;g.globalAlpha=.6*(1-blend);g.lineWidth=1;
   line(g,[a[0]+bw*.018,a[1]+height*.52],[b[0]-bw*.018,b[1]+height*.52]);g.globalAlpha=1;
 }
}
export function paintCloth(g,{P,h,finish,bw,blend}){
 const corners=[P(0,0),P(1000,0),P(1000,500),P(0,500)];
 const source=P(260,75),far=P(780,465);
 g.save();path(g,corners);g.clip();
 const base=g.createLinearGradient(source[0],source[1],far[0],far[1]);
 base.addColorStop(0,h.feltLight);base.addColorStop(.54,h.felt);base.addColorStop(1,h.felt);
 g.fillStyle=base;g.fillRect(0,0,g.canvas.width,g.canvas.height);
 const light=P(330,158);
 const bloom=g.createRadialGradient(light[0],light[1],1,light[0],light[1],bw*.77);
 bloom.addColorStop(0,'rgba(255,246,208,.14)');bloom.addColorStop(.42,'rgba(226,235,199,.043)');
 bloom.addColorStop(1,'rgba(0,0,0,.20)');g.fillStyle=bloom;g.fillRect(0,0,g.canvas.width,g.canvas.height);
 const pattern=feltWeave();if(pattern){g.globalAlpha=.29;g.fillStyle=g.createPattern(pattern,'repeat');g.fillRect(0,0,g.canvas.width,g.canvas.height);g.globalAlpha=1;}
 // Real tables are marked: the head string, and spots for the head, centre and foot (the
 // rack's apex). Faint ink only, with no effect on play.
 if(blend>.55){
  const mark=C((blend-.55)/.3,0,1);
  g.globalAlpha=mark;
  const top=P(265,22),bottom=P(265,478);
  g.beginPath();g.moveTo(top[0],top[1]);g.lineTo(bottom[0],bottom[1]);
  g.strokeStyle='rgba(235,245,238,.16)';g.lineWidth=C(bw/700,.8,1.8);g.stroke();
  for(const [x,y] of [[265,250],[500,250],[718,250]]){
   const [sx,sy]=P(x,y);g.beginPath();g.arc(sx,sy,C(bw/330,1.6,3.4),0,Math.PI*2);
   g.fillStyle='rgba(235,245,238,.2)';g.fill();
  }
  g.globalAlpha=1;
 }
 // The dark cloth seam never crosses the openings; pocket mouths are drawn last.
 g.restore();
}
const cushions=[
 [[45,0],[454,0]],[[546,0],[955,0]],
 [[45,500],[454,500]],[[546,500],[955,500]],
 [[0,45],[0,455]],[[1000,45],[1000,455]],
];
export function paintRailDetails(g,{P,finish,bw,margin}){
 const unit=C(bw/740,.52,1.35);
 g.save();g.lineCap='round';g.lineJoin='round';
 for(const [a,b] of cushions){
   const vertical=a[0]===b[0],edge=vertical?(a[0]===0?-1:1):(a[1]===0?-1:1);
   const offset=margin*.24*edge;
   const extend=p=>vertical?[p[0]+offset,p[1]]:[p[0],p[1]+offset];
   g.strokeStyle='#071913';g.lineWidth=6*unit;line(g,P(...a),P(...b));
   g.strokeStyle=finish.cushion;g.lineWidth=3.7*unit;line(g,P(...a),P(...b));
   g.strokeStyle=finish.trim;g.lineWidth=1.1*unit;g.globalAlpha=.65;
   line(g,P(...extend(a)),P(...extend(b)));g.globalAlpha=1;
 }
 // Inlaid sights live in the wood, not on the felt or in pocket mouths.
 const sights=[];
 for(const y of [-margin*.69,500+margin*.69])for(const x of [135,260,385,615,740,865])sights.push([x,y]);
 for(const x of [-margin*.69,1000+margin*.69])for(const y of [110,205,295,390])sights.push([x,y]);
 const size=C(bw/380,1.15,3.4);
 for(const [x,y] of sights){const [sx,sy]=P(x,y);
   g.save();g.translate(sx,sy);
   g.shadowColor='#0008';g.shadowBlur=2;
   if(finish.motif==='brass-disc'){
     // Wintergarden: warm inset discs with a visible polished center.
     g.beginPath();g.arc(0,0,size*1.16,0,Math.PI*2);g.fillStyle='#675438';g.fill();
     g.beginPath();g.arc(0,0,size*.85,0,Math.PI*2);g.fillStyle=finish.trim;g.fill();
     g.beginPath();g.arc(-size*.2,-size*.2,size*.34,0,Math.PI*2);g.fillStyle=finish.inlay;g.fill();
   }else if(finish.motif==='twin-bars'){
     // Afterhours: paired straight nickel sights, intentionally not diamonds.
     g.rotate(Math.PI/4);
     g.fillStyle='#241d28';g.fillRect(-size*1.22,-size*1.17,size*2.44,size*2.34);
     g.fillStyle=finish.inlay;
     g.fillRect(-size*.84,-size*.69,size*1.68,size*.43);
     g.fillRect(-size*.84,size*.26,size*1.68,size*.43);
   }else{
     g.rotate(Math.PI/4);
     g.fillStyle='#34291e';g.fillRect(-size*1.12,-size*1.12,size*2.24,size*2.24);
     g.fillStyle=finish.inlay;g.fillRect(-size*.83,-size*.83,size*1.66,size*1.66);
     g.fillStyle='#fff8d9a0';g.fillRect(-size*.6,-size*.6,size*.82,size*.82);
   }
   g.restore();
 }
 g.restore();
}
export function paintPockets(g,{P,finish,bw,blend}){
 const u=C(bw/1000,.29,1.7);
 for(let i=0;i<POCKETS.length;i++){
   const [x,y]=POCKETS[i],[sx,sy,k]=P(x,C(y,0,500));
   const side=i===1||i===4,r=(side?23:27)*u*k,stretch=.77+.23*blend;
   g.save();g.translate(sx,sy);g.scale(1,stretch);
   g.shadowColor='#000e';g.shadowBlur=C(r*.63,3,12);g.shadowOffsetY=2;
   g.beginPath();g.arc(0,0,r*1.24,0,Math.PI*2);
   g.fillStyle=finish.pocket;g.fill();g.shadowBlur=0;g.shadowOffsetY=0;
   // Thin polished iron/leather outer rim, with a top-left catchlight.
   const ring=g.createLinearGradient(-r,-r,r,r);ring.addColorStop(0,finish.inlay);ring.addColorStop(.4,finish.trim);
   ring.addColorStop(.75,'#241d1a');ring.addColorStop(1,finish.trim);
   g.strokeStyle=ring;g.lineWidth=C(r*.19,1.1,3.2);g.stroke();
   const dark=g.createRadialGradient(-r*.22,-r*.27,1,r*.2,r*.28,r*1.04);
   dark.addColorStop(0,'#040606');dark.addColorStop(.55,'#060a0a');dark.addColorStop(1,'#101612');
   g.beginPath();g.arc(0,0,r*.92,0,Math.PI*2);g.fillStyle=dark;g.fill();
   g.beginPath();g.arc(-r*.08,-r*.12,r*1.02,Math.PI*1.1,Math.PI*1.75);
   g.strokeStyle=finish.inlay;g.globalAlpha=.45;g.lineWidth=C(r*.13,.75,2);
   g.stroke();g.restore();
 }
 // Pocket knuckles are part of the cushion on a real table, never loose dots on the
 // cloth, so nothing is painted over the pocket mouths. Physics keeps the funnel.
}
