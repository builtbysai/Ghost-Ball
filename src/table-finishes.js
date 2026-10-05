/** All five tables share physical geometry, not the same paint job.
 * All detail is visual: no changes to cushion or pocket collision coordinates.
 */
import {POCKETS,TABLE} from './physics.js';
import {CUSHION_RUNS,RAIL_RISE} from './table-geometry.js';
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
  // a soft pool of shade on the floor, wider than the table and darkest beneath it
  {const [fx,fy]=P(500,500+margin),fw=bw*.62,fh=foot*.9+bw*.05;
   g.save();g.translate(fx,fy+foot*.72);g.scale(1,fh/fw);
   const pool=g.createRadialGradient(0,0,fw*.1,0,0,fw);
   pool.addColorStop(0,'rgba(0,0,0,.55)');pool.addColorStop(.6,'rgba(0,0,0,.22)');pool.addColorStop(1,'rgba(0,0,0,0)');
   g.fillStyle=pool;g.beginPath();g.arc(0,0,fw,0,Math.PI*2);g.fill();g.restore();}
  for(const x of [55,945]){
    const [sx,sy]=P(x,500+margin);
    const footGrad=g.createLinearGradient(sx-11,sy,sx+12,sy+foot);
    footGrad.addColorStop(0,h.wood);footGrad.addColorStop(.42,h.rail);footGrad.addColorStop(1,'#16100e');
    path(g,[[sx-16,sy-3],[sx+16,sy-3],[sx+10,sy+foot],[sx-10,sy+foot]]);
    g.fillStyle=footGrad;g.fill();g.strokeStyle='#100e0b';g.lineWidth=2;g.stroke();
    // lathe-turned leg: a bright strip down one side and a brass cap at the floor
    g.fillStyle='rgba(255,236,196,.2)';path(g,[[sx-13,sy-3],[sx-8,sy-3],[sx-5,sy+foot],[sx-9,sy+foot]]);g.fill();
    g.fillStyle=finish.trim;g.fillRect(sx-11,sy+foot-4,22,4);g.fillStyle='rgba(0,0,0,.45)';g.fillRect(sx-11,sy+foot,22,2);
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
 // varnish sheen: one soft diagonal highlight sweeping across the polished rails
 {g.save();path(g,edge);g.clip();const sheen=g.createLinearGradient(front[0],front[1],back[0],back[1]);
  sheen.addColorStop(0,'rgba(255,240,210,0)');sheen.addColorStop(.28,'rgba(255,240,210,.0)');sheen.addColorStop(.36,'rgba(255,240,210,.13)');sheen.addColorStop(.44,'rgba(255,240,210,0)');sheen.addColorStop(.7,'rgba(255,240,210,0)');sheen.addColorStop(.76,'rgba(255,240,210,.07)');sheen.addColorStop(.82,'rgba(255,240,210,0)');
  g.fillStyle=sheen;g.fillRect(0,0,g.canvas.width,g.canvas.height);g.restore();}
 path(g,edge);g.strokeStyle='#17130f';g.lineWidth=C(bw/330,1.3,3.5);g.stroke();

 // polished outer chamfer: a bright top-left edge and a dark lower-right one, as light rakes across the wood
 {const bevel=[P(-margin*.96,-margin*.96),P(1000+margin*.96,-margin*.96),P(1000+margin*.96,500+margin*.96),P(-margin*.96,500+margin*.96)];
  g.save();g.lineJoin='round';g.lineWidth=C(bw/420,1,2.6);
  g.strokeStyle='rgba(255,236,196,.34)';g.beginPath();g.moveTo(bevel[3][0],bevel[3][1]);g.lineTo(bevel[0][0],bevel[0][1]);g.lineTo(bevel[1][0],bevel[1][1]);g.stroke();
  g.strokeStyle='rgba(0,0,0,.35)';g.beginPath();g.moveTo(bevel[1][0],bevel[1][1]);g.lineTo(bevel[2][0],bevel[2][1]);g.lineTo(bevel[3][0],bevel[3][1]);g.stroke();g.restore();}
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
 {const [cx,cy]=P(500,250),rx=bw*.5,ry=Math.max(40,rx*(.5-.1*(1-blend)));
  g.save();g.translate(cx,cy);g.scale(1,ry/rx);g.globalCompositeOperation='lighter';
  const lamp=g.createRadialGradient(0,0,0,0,0,rx);lamp.addColorStop(0,'rgba(255,244,214,.11)');lamp.addColorStop(.55,'rgba(255,236,190,.035)');lamp.addColorStop(1,'rgba(255,236,190,0)');
  g.fillStyle=lamp;g.beginPath();g.arc(0,0,rx,0,Math.PI*2);g.fill();g.restore();}
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
export function paintRailDetails(g,{P,finish,bw,margin}){
 const unit=C(bw/740,.52,1.35);
 g.save();g.lineCap='round';g.lineJoin='round';


 // Cushions are drawn from the very edges the physics uses (table-geometry.js): a rubber wedge whose FACE is the line
 // balls touch, ending in a rounded NOSE and cut back at the facing angle toward the pocket's throat.
 for(const run of CUSHION_RUNS){
   const {a,b,fa,fb,n}=run,len=Math.hypot(b[0]-a[0],b[1]-a[1]),ux=(b[0]-a[0])/len,uy=(b[1]-a[1])/len;
   const at=(along,depth)=>P(a[0]+ux*along+n[0]*depth,a[1]+uy*along+n[1]*depth);
   const nA=P(a[0],a[1]),nB=P(b[0],b[1]),fA=P(fa[0],fa[1]),fB=P(fb[0],fb[1]);
   // soft contact shadow on the cloth: a row of overlapping soft discs along the nose, so it fades out smoothly at the
   // ends (no canvas blur, which not every browser has)
   {const step=7,count=Math.max(2,Math.ceil(len/step)),p0=P(0,250),p1=P(14,250),rad=Math.max(3,Math.hypot(p1[0]-p0[0],p1[1]-p0[1]));
    for(let i=0;i<=count;i++){
     const along=len*i/count,[cx,cy]=at(along,5),edge=Math.min(along,len-along);
     const fade=Math.min(1,.35+edge/40);
     const disc=g.createRadialGradient(cx,cy,0,cx,cy,rad*1.15);
     disc.addColorStop(0,`rgba(0,10,8,${.1*fade})`);disc.addColorStop(1,'rgba(0,10,8,0)');
     g.fillStyle=disc;g.beginPath();g.arc(cx,cy,rad*1.15,0,Math.PI*2);g.fill();
    }}
   // rubber body: dark where it tucks under the rail, a lit shoulder, then the darker face down to the nose
   const r0=at(len/2,-RAIL_RISE),r1=at(len/2,0);
   const body=g.createLinearGradient(r0[0],r0[1],r1[0],r1[1]);
   body.addColorStop(0,darken(finish.cushion,.62));body.addColorStop(.34,lighten(finish.cushion,.1));
   body.addColorStop(.72,finish.cushion);body.addColorStop(1,darken(finish.cushion,.38));
   path(g,[fA,fB,nB,nA]);g.fillStyle=body;g.fill();
   g.lineJoin='round';g.lineCap='round';
   // the two facings: a lit bevel on the angled end face, then a dark seam against the wood
   for(const [nose,foot] of [[nA,fA],[nB,fB]]){
    g.strokeStyle='rgba(235,255,240,.2)';g.lineWidth=1.5*unit;line(g,nose,foot);
    g.strokeStyle='rgba(2,10,8,.85)';g.lineWidth=.9*unit;line(g,nose,foot);
   }
   // shoulder catchlight, the face seam, and the trim where the rubber meets the rail
   g.strokeStyle='rgba(255,255,255,.22)';g.lineWidth=.9*unit;line(g,at(len*.03,-RAIL_RISE*.42),at(len*.97,-RAIL_RISE*.42));
   g.strokeStyle='rgba(2,10,8,.7)';g.lineWidth=1.1*unit;line(g,at(0,-.3),at(len,-.3));
   g.strokeStyle=finish.trim;g.lineWidth=1.1*unit;g.globalAlpha=.6;line(g,fA,fB);g.globalAlpha=1;
   // the noses: small polished caps, so the exact point a ball can touch is visible
   for(const [nose,toward] of [[nA,1],[nB,-1]]){
    const rn=Math.max(1.1,1.7*unit);
    g.beginPath();g.arc(nose[0],nose[1],rn,0,Math.PI*2);g.fillStyle=lighten(finish.cushion,.2);g.fill();
    g.strokeStyle='rgba(2,10,8,.8)';g.lineWidth=.7*unit;g.stroke();
    g.beginPath();g.arc(nose[0]-rn*.3,nose[1]-rn*.3,rn*.38,0,Math.PI*2);g.fillStyle="rgba(255,255,255,.4)";g.fill();
   }
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
 const sc=bw/1000;
 // Ambient shade pooling in front of each pocket, only on the cloth, so the holes read as deep.
 g.save();path(g,[P(0,0),P(TABLE.width,0),P(TABLE.width,TABLE.height),P(0,TABLE.height)]);g.clip();
 for(let i=0;i<POCKETS.length;i++){
  const [x,y]=POCKETS[i],[sx,sy,k]=P(x,y),side=i===1||i===4,rr=(side?60:76)*sc*k;
  const pool=g.createRadialGradient(sx,sy,rr*.2,sx,sy,rr);
  pool.addColorStop(0,'rgba(0,6,6,.5)');pool.addColorStop(.55,'rgba(0,6,6,.18)');pool.addColorStop(1,'rgba(0,6,6,0)');
  g.fillStyle=pool;g.fillRect(sx-rr,sy-rr,rr*2,rr*2);
 }
 g.restore();
 // Each cup is centred on the physics pocket, and its rim passes through the outer ends of the two facings, so the
 // cushions run straight into the throat with no gap and no overlap.
 for(let i=0;i<POCKETS.length;i++){
   const [x,y]=POCKETS[i],[sx,sy,k]=P(x,y),side=i===1||i===4;
   const R=(side?25.6:31.8)*sc*k,stretch=.77+.23*blend;
   g.save();g.translate(sx,sy);g.scale(1,stretch);
   // seat: the shelf of wood and leather around the opening, with a drop shadow onto the rail
   g.shadowColor='rgba(0,0,0,.8)';g.shadowBlur=C(R*.45,3,12);g.shadowOffsetY=2;
   g.beginPath();g.arc(0,0,R*1.1,0,Math.PI*2);g.fillStyle=finish.pocket;g.fill();g.shadowBlur=0;g.shadowOffsetY=0;
   // polished rim: a bright top-left edge rolling to dark
   const ring=g.createLinearGradient(-R,-R,R,R);ring.addColorStop(0,finish.inlay);ring.addColorStop(.38,finish.trim);
   ring.addColorStop(.72,'#241d1a');ring.addColorStop(1,finish.trim);
   g.beginPath();g.arc(0,0,R*1.03,0,Math.PI*2);g.strokeStyle=ring;g.lineWidth=C(R*.12,1.2,3.6);g.stroke();
   // leather lip and the well itself
   const lip=g.createLinearGradient(-R,-R,R,R);lip.addColorStop(0,'rgba(120,88,62,.9)');lip.addColorStop(.5,'rgba(48,32,24,.95)');lip.addColorStop(1,'rgba(8,6,6,1)');
   g.beginPath();g.arc(0,0,R*.9,0,Math.PI*2);g.fillStyle=lip;g.fill();
   const well=g.createRadialGradient(-R*.2,-R*.26,1,R*.1,R*.22,R*.84);
   well.addColorStop(0,'#030505');well.addColorStop(.6,'#060a0a');well.addColorStop(1,'#141a16');
   g.beginPath();g.arc(0,0,R*.76,0,Math.PI*2);g.fillStyle=well;g.fill();
   // a glimpse of the net far below, row of stitching on the leather, and a specular crescent on the rim
   const net=g.createRadialGradient(R*.08,R*.4,0,R*.08,R*.4,R*.55);net.addColorStop(0,'rgba(96,66,46,.34)');net.addColorStop(1,'rgba(96,66,46,0)');
   g.beginPath();g.arc(0,0,R*.74,0,Math.PI*2);g.fillStyle=net;g.fill();
   g.save();g.setLineDash([C(R*.07,1,2.4),C(R*.09,1.4,3)]);g.beginPath();g.arc(0,0,R*.84,0,Math.PI*2);
   g.strokeStyle='rgba(235,205,150,.34)';g.lineWidth=C(R*.035,.5,1.2);g.stroke();g.restore();
   g.beginPath();g.arc(-R*.04,-R*.06,R*1.0,Math.PI*1.08,Math.PI*1.72);
   g.strokeStyle=finish.inlay;g.globalAlpha=.5;g.lineWidth=C(R*.09,.75,2);g.stroke();g.globalAlpha=1;
   g.restore();
 }
}
