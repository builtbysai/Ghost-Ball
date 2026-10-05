import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CUSHION_RUNS,FACINGS,WALLS,RAIL_RISE,CORNER_FACING_DEG,SIDE_FACING_DEG,nearestOnSegment} from '../src/table-geometry.js';
import {Simulation,makeBall,TABLE,POCKETS} from '../src/physics.js';

const angleBetween=(u,v)=>Math.acos((u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v)))*180/Math.PI;

test('every cushion has a nose on its face line and a facing at the stated angle',()=>{
 assert.equal(CUSHION_RUNS.length,6);assert.equal(FACINGS.length,12);assert.equal(WALLS.length,18);
 for(const r of CUSHION_RUNS){
  const along=[r.b[0]-r.a[0],r.b[1]-r.a[1]];
  for(const [nose,foot,kind,sign] of [[r.a,r.fa,r.kindA,-1],[r.b,r.fb,r.kindB,1]]){
   const facing=[foot[0]-nose[0],foot[1]-nose[1]];
   // the facing heads back past the nose along the cushion line, then out toward the rail
   const measured=angleBetween([along[0]*sign,along[1]*sign],facing);
   const expected=180-(kind==='corner'?CORNER_FACING_DEG:SIDE_FACING_DEG);
   assert.ok(Math.abs(measured-expected)<.01,`${kind} facing turns ${measured}, expected ${expected}`);
   // and it ends on the rail line, RAIL_RISE behind the face
   const depth=Math.abs((foot[0]-nose[0])*r.n[0]+(foot[1]-nose[1])*r.n[1]);
   assert.ok(Math.abs(depth-RAIL_RISE)<1e-9);
  }
 }
});

test('mouths and throats are about two ball widths, with the throat narrower than the mouth at the corners',()=>{
 const d=2*TABLE.radius,topLeft=CUSHION_RUNS[0],leftRun=CUSHION_RUNS[4];
 const mouth=Math.hypot(topLeft.a[0]-leftRun.a[0],topLeft.a[1]-leftRun.a[1]);
 const throat=Math.hypot(topLeft.fa[0]-leftRun.fa[0],topLeft.fa[1]-leftRun.fa[1]);
 assert.ok(mouth/d>1.9&&mouth/d<2.4,`corner mouth ${mouth/d} balls`);
 assert.ok(throat<mouth,'the facings funnel inward');
 const side=CUSHION_RUNS[1].a[0]-CUSHION_RUNS[0].b[0];
 assert.ok(side/d>2.2&&side/d<3,`side mouth ${side/d} balls`);
});

test('a ball pushed into any nose or facing rests exactly one radius from it, so what is drawn is what is touched',()=>{
 const spots=[[38,13],[14,38],[471,12],[529,12],[962,13],[986,40],[40,487],[500,30],[26,24]];
 for(const [x,y] of spots){
  const sim=new Simulation([makeBall(0,x,y)]);sim.cue().vx=sim.cue().vy=0;sim.step();
  const c=sim.cue();if(c.pocketed)continue;
  const nearest=Math.min(...WALLS.map(w=>{const [qx,qy]=nearestOnSegment(c.x,c.y,w);return Math.hypot(c.x-qx,c.y-qy);}));
  assert.ok(nearest>=TABLE.radius-1e-6,`(${x},${y}) ended ${nearest} from a wall`);
 }
});

test('the painter draws the cushions from the shared geometry',()=>{
 const source=readFileSync(new URL('../src/table-finishes.js',import.meta.url),'utf8');
 assert.match(source,/from '\.\/table-geometry\.js'/);assert.match(source,/CUSHION_RUNS/);
});

test('balls rolling straight into every pocket still drop',()=>{
 const aims=[[-7,-7,[300,300]],[500,-13,[500,250]],[1007,-7,[700,300]],[-7,507,[300,200]],[500,513,[500,250]],[1007,507,[700,200]]];
 aims.forEach(([px,py,[sx,sy]],i)=>{
  const sim=new Simulation([makeBall(0,sx,sy)]);const b=sim.cue(),d=Math.hypot(px-sx,py-sy);
  b.vx=(px-sx)/d*500;b.vy=(py-sy)/d*500;b.pocketed=false;
  for(let k=0;k<2400&&!b.pocketed;k++)sim.step();
  assert.equal(b.pocketed,true,`pocket ${i} refused a straight-in ball`);
 });
});
