/** Shared premium cue painter: a lathe-turned, tapered, cylinder-shaded cue used by
 * the table renderer and the Locker preview so both always show the same object. */
const hex=c=>{const m=/^#?([0-9a-f]{6})$/i.exec(c||'');if(!m)return [128,128,128];const n=parseInt(m[1],16);return [n>>16&255,n>>8&255,n&255];};
const shade=(c,amount)=>{
 const [r,g,b]=hex(c),t=amount<0?0:255,k=Math.abs(amount);
 return 'rgb('+[r,g,b].map(v=>Math.round(v+(t-v)*k)).join(',')+')';
};
/** Where each part sits along the cue, from tip (0) to butt (1), with half-width in cue units. */
const LAYOUT={
 tip:[0,.012],ferrule:[.012,.058],shaft:[.058,.615],joint:[.615,.632],forearm:[.632,.745],
 wrap:[.745,.9],sleeve:[.9,.985],bumper:[.985,1]
};
const RADIUS=(t)=>{
 // Pro taper: slim straight shaft, gentle swell to the joint, a thicker butt.
 if(t<.058)return 1.55+(t/.058)*.18;
 if(t<.615)return 1.73+(t-.058)/.557*.9;
 if(t<.745)return 2.7+(t-.615)/.13*.55;
 return 3.25+(t-.745)/.255*1.05;
};
/**
 * Paint a cue from tip to butt. `scale` converts cue units to screen pixels.
 * Everything is drawn in a local frame (tip at origin, +x toward the butt) so
 * the lighting stays consistent as the cue rotates: the highlight is always on
 * the upper side of the screen.
 */
export function paintCue(g,tip,butt,style,{scale=1,shadow=true,chalk=true}={}){
 const dx=butt.x-tip.x,dy=butt.y-tip.y,L=Math.hypot(dx,dy);
 if(L<4)return;
 const angle=Math.atan2(dy,dx);
 // Light comes from the upper left, so flip the shading when the cue points the other way.
 const flip=Math.abs(angle)>Math.PI/2?-1:1;
 g.save();g.translate(tip.x,tip.y);g.rotate(angle);g.lineJoin='round';g.lineCap='round';
 const R=t=>RADIUS(t)*scale;
 const at=t=>t*L;
 // Soft cast shadow on the cloth: one blurred, offset silhouette.
 if(shadow){
  g.save();g.shadowColor='rgba(0,0,0,.55)';g.shadowBlur=7*scale;g.shadowOffsetX=-1.5*scale;g.shadowOffsetY=4.5*scale;
  g.beginPath();g.moveTo(0,-R(0));
  for(let i=1;i<=12;i++){const t=i/12;g.lineTo(at(t),-R(t));}
  for(let i=12;i>=0;i--){const t=i/12;g.lineTo(at(t),R(t));}
  g.closePath();g.fillStyle='rgba(0,0,0,.5)';g.fill();g.restore();
 }
 // Cylinder gradient for a slice: dark rim, body, soft specular, deeper lower edge.
 const slice=(from,to,color,{spec=.5,edge=.34}={})=>{
  const a=at(from),b=at(to),r0=R(from),r1=R(to),rm=Math.max(r0,r1);
  const grad=g.createLinearGradient(0,-rm*flip,0,rm*flip);
  grad.addColorStop(0,shade(color,-edge));
  grad.addColorStop(.2,shade(color,spec*.5));
  grad.addColorStop(.34,shade(color,spec));
  grad.addColorStop(.52,color);
  grad.addColorStop(.82,shade(color,-edge*.7));
  grad.addColorStop(1,shade(color,-edge*1.25));
  g.beginPath();g.moveTo(a,-r0);g.lineTo(b,-r1);g.lineTo(b,r1);g.lineTo(a,r0);g.closePath();
  g.fillStyle=grad;g.fill();
 };
 const [t0,t1]=LAYOUT.tip,[f0,f1]=LAYOUT.ferrule,[s0,s1]=LAYOUT.shaft,[j0,j1]=LAYOUT.joint,
  [a0,a1]=LAYOUT.forearm,[w0,w1]=LAYOUT.wrap,[l0,l1]=LAYOUT.sleeve,[u0,u1]=LAYOUT.bumper;
 slice(s0,s1,style.shaft,{spec:.38,edge:.3});
 // Wood grain: a few long faint streaks along the maple shaft.
 g.save();g.beginPath();g.rect(at(s0),-R(s1),at(s1)-at(s0),R(s1)*2);g.clip();
 g.globalAlpha=.16;g.strokeStyle=shade(style.shaft,-.45);g.lineWidth=.55*scale;
 for(const [off,from,to] of [[-.55,.1,.5],[.15,.2,.8],[.5,.06,.6],[-.2,.45,.95]]){
  const y0=off*R(s0+(s1-s0)*from),y1=off*R(s0+(s1-s0)*to);
  g.beginPath();g.moveTo(at(s0+(s1-s0)*from),y0);g.lineTo(at(s0+(s1-s0)*to),y1);g.stroke();
 }
 g.restore();
 slice(f0,f1,'#f3ecdb',{spec:.5,edge:.28});
 slice(t0,t1,style.tip,{spec:.3,edge:.36});
 // Chalk dusting on the tip so aiming reads as a real stick about to strike.
 if(chalk){g.beginPath();g.arc(at(t0)+.3*scale,0,R(0)*.95,-Math.PI/2,Math.PI/2);g.fillStyle='rgba(120,176,198,.55)';g.fill();}
 // Metal joint collar with a bright, narrow bevel.
 slice(j0,j1,style.metal,{spec:.65,edge:.4});
 slice(a0,a1,style.butt,{spec:.4,edge:.4});
 slice(w0,w1,style.wrap,{spec:.3,edge:.38});
 slice(l0,l1,style.butt,{spec:.4,edge:.42});
 slice(u0,u1,'#121214',{spec:.45,edge:.1});
 // Metal rings at each boundary, thin enough not to distract at phone sizes.
 for(const t of [a0,w0,w1,l1-.012]){
  const x=at(t),r=R(t);g.fillStyle=shade(style.metal,-.05);g.fillRect(x-.55*scale,-r,1.1*scale,r*2);
  g.fillStyle='rgba(255,255,255,.38)';g.fillRect(x-.55*scale,-r*flip*.62,1.1*scale,Math.max(.6,r*.34));
 }
 // Forearm inlays: a diamond-point sequence in the accent colour.
 for(let i=0;i<4;i++){
  const t=a0+(a1-a0)*(.14+i*.24),r=R(t)*.62;
  g.beginPath();g.moveTo(at(t)-r*.9,0);g.lineTo(at(t),-r);g.lineTo(at(t)+r*.9,0);g.lineTo(at(t),r);g.closePath();
  g.fillStyle=style.accent;g.fill();g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=.5*scale;g.stroke();
 }
 // Linen-wrap weave: fine diagonal threads that follow the cylinder.
 g.save();g.beginPath();g.rect(at(w0),-R(w1),at(w1)-at(w0),R(w1)*2);g.clip();
 g.lineWidth=.55*scale;
 const step=Math.max(2.2,3.1*scale);
 for(let x=at(w0)-R(w1);x<at(w1)+R(w1);x+=step){
  g.strokeStyle='rgba(255,255,255,.1)';g.beginPath();g.moveTo(x,-R(w1));g.lineTo(x+R(w1)*1.4,R(w1));g.stroke();
  g.strokeStyle='rgba(0,0,0,.2)';g.beginPath();g.moveTo(x+R(w1)*1.4,-R(w1));g.lineTo(x,R(w1));g.stroke();
 }
 g.restore();
 // A long, continuous specular line gives the whole stick its glossy lacquer.
 const lacquer=g.createLinearGradient(0,0,at(1),0);
 lacquer.addColorStop(0,'rgba(255,255,255,.55)');lacquer.addColorStop(.55,'rgba(255,255,255,.35)');lacquer.addColorStop(1,'rgba(255,255,255,.2)');
 g.beginPath();
 for(let i=0;i<=24;i++){const t=.03+i/24*.95;g[i?'lineTo':'moveTo'](at(t),-R(t)*.5*flip);}
 g.strokeStyle=lacquer;g.lineWidth=Math.max(.6,.75*scale);g.stroke();
 g.restore();
}
