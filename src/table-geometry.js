/**
 * The cushions and pocket facings, defined once and used by both the physics and the painter, so what you see is
 * exactly what a ball touches. Units: the 1000 x 500 cloth, ball radius 12.
 *
 * Each cushion is a rubber wedge. Its FACE is the line balls touch (the cloth edge). At each end the wedge finishes in
 * a NOSE on the face line, and the rubber is cut back at the FACING ANGLE toward the rail, so the two facings of a
 * pocket funnel into its THROAT (the narrowest passage). MOUTH is measured nose to nose.
 *
 *           rail wood                        corner pocket
 *      F ─────────────── F'              F = end of the facing on the rail line
 *       \    cushion      \              N = nose (on the face line)
 *        \________________\
 *        N   cloth face    N'
 */
export const RAIL_RISE=12;                      // face-to-rail depth of the rubber
export const CORNER_NOSE=36,SIDE_NOSE=31;       // nose distance from the corner / the side pocket's centre line
export const CORNER_FACING_DEG=142,SIDE_FACING_DEG=103; // typical corner and side facing angles
const W=1000,H=500;
const turn=deg=>(180-deg)*Math.PI/180;          // how far the facing turns away from the cushion line
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const unit=v=>{const l=Math.hypot(v[0],v[1])||1;return [v[0]/l,v[1]/l];};
function facingEnd(nose,toward,outward,facingDeg){
  const t=turn(facingDeg),back=RAIL_RISE/Math.tan(t);
  return [nose[0]+toward[0]*back+outward[0]*RAIL_RISE,nose[1]+toward[1]*back+outward[1]*RAIL_RISE];
}
/** a, b: the two noses; fa, fb: the ends of their facings; n: inward normal. Ends alternate corner / side. */
function run(a,b,inward,kindA,kindB){
  const d=unit(sub(b,a)),outward=[-inward[0],-inward[1]];
  const deg=k=>k==='corner'?CORNER_FACING_DEG:SIDE_FACING_DEG;
  return {a,b,n:inward,kindA,kindB,
    fa:facingEnd(a,[-d[0],-d[1]],outward,deg(kindA)),
    fb:facingEnd(b,d,outward,deg(kindB))};
}
const MID=W/2;
export const CUSHION_RUNS=Object.freeze([
  run([CORNER_NOSE,0],[MID-SIDE_NOSE,0],[0,1],'corner','side'),
  run([MID+SIDE_NOSE,0],[W-CORNER_NOSE,0],[0,1],'side','corner'),
  run([CORNER_NOSE,H],[MID-SIDE_NOSE,H],[0,-1],'corner','side'),
  run([MID+SIDE_NOSE,H],[W-CORNER_NOSE,H],[0,-1],'side','corner'),
  run([0,CORNER_NOSE],[0,H-CORNER_NOSE],[1,0],'corner','corner'),
  run([W,CORNER_NOSE],[W,H-CORNER_NOSE],[-1,0],'corner','corner')
].map(r=>Object.freeze(r)));
/** Every solid edge a ball can hit, as [x1,y1,x2,y2]: the cushion faces and the twelve facings. */
export const FACINGS=Object.freeze(CUSHION_RUNS.flatMap(r=>[[r.a[0],r.a[1],r.fa[0],r.fa[1]],[r.b[0],r.b[1],r.fb[0],r.fb[1]]]));
export const WALLS=Object.freeze([...CUSHION_RUNS.map(r=>[r.a[0],r.a[1],r.b[0],r.b[1]]),...FACINGS]);
/** Nearest point on segment [x1,y1,x2,y2] to (px,py). */
export function nearestOnSegment(px,py,[x1,y1,x2,y2]){
  const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy,t=len2?Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/len2)):0;
  return [x1+dx*t,y1+dy*t];
}
