import {advanceRoll} from './ball-orientation.js';
import {WALLS,nearestOnSegment} from './table-geometry.js';
/** Deterministic 240 Hz, browser-free pool simulation. Units: 1000 x 500 cloth. */
export const TABLE = Object.freeze({width: 1000, height: 500, radius: 12, step: 1 / 240});
export const POCKETS = Object.freeze([[-7,-7],[500,-13],[1007,-7],[-7,507],[500,513],[1007,507]]);
// Tunable arcade-calibrated coefficients. NOT measured cloth or tournament specifications.
export const PHYSICS = Object.freeze({
  slideDeceleration: 760, rollingDeceleration: 135, rollingSpeedDrag: .10,
  ballRestitution: .94, railRestitution: .84, railFriction: .14,
  spinDecay: 1.25, maxSpeed: 2050,
});
const BALL_COLORS = ['#efece3','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d','#191918','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(x,y)=>Math.hypot(x,y);
// The cushions and pocket facings live in table-geometry.js, shared with the painter: a ball only ever meets an edge
// that is drawn. JAWS stays exported (empty) for older callers; the facings replace it.
export const JAW_RADIUS=0;
export const JAWS = Object.freeze([]);
export function makeBall(id,x,y){return {id,x,y,vx:0,vy:0,spin:0,follow:0,aimX:1,aimY:0,slipX:0,slipY:0,pocketed:false,color:BALL_COLORS[id],rotation:0,orientation:[1,0,0,0]};}
/** Standard triangular layout: opposite groups in the rear corners; eight in the center. */
export function rack(seed=0){
  const balls=[makeBall(0,252,250)];
  const rows=[[1],[2,9],[3,8,10],[4,11,12,5],[7,13,6,14,15]];
  for(let row=0;row<5;row++)for(let col=0;col<=row;col++){
    const dy=(col-row/2)*(TABLE.radius*2+.3);
    const dx=row*(TABLE.radius*2+.3)*Math.sqrt(3)/2;
    const jitter=Math.sin((seed+1)*73+row*19+col*7)*.015;
    balls.push(makeBall(rows[row][col],718+dx+jitter,250+dy));
  }
  return balls;
}
/** Nine-ball diamond: the 1 at the apex, the 9 in the middle, the rest shuffled by seed. */
export function rackNine(seed=0){
  const balls=[makeBall(0,252,250)];
  const rest=[2,3,4,5,6,7,8];
  // Deterministic seeded shuffle (no Math.random: racks must replay from the seed).
  let state=(seed*2654435761+12345)>>>0;
  for(let i=rest.length-1;i>0;i--){state=(state*1664525+1013904223)>>>0;const j=state%(i+1);[rest[i],rest[j]]=[rest[j],rest[i]];}
  const rows=[[1],[rest[0],rest[1]],[rest[2],9,rest[3]],[rest[4],rest[5]],[rest[6]]];
  const step=TABLE.radius*2+.3;
  rows.forEach((ids,row)=>ids.forEach((id,col)=>{
    balls.push(makeBall(id,718+row*step*Math.sqrt(3)/2,250+(col-(ids.length-1)/2)*step));
  }));
  return balls;
}
/** Ten-ball: a triangle of ten, the 1 at the apex and the 10 in the middle of the third row. */
export function rackTen(seed=0){
  const balls=[makeBall(0,252,250)];
  const rest=[2,3,4,5,6,7,8,9];
  let state=(seed*2654435761+12345)>>>0;
  for(let i=rest.length-1;i>0;i--){state=(state*1664525+1013904223)>>>0;const j=state%(i+1);[rest[i],rest[j]]=[rest[j],rest[i]];}
  const rows=[[1],[rest[0],rest[1]],[rest[2],10,rest[3]],[rest[4],rest[5],rest[6],rest[7]]];
  const step=TABLE.radius*2+.3;
  rows.forEach((ids,row)=>ids.forEach((id,col)=>{
    balls.push(makeBall(id,718+row*step*Math.sqrt(3)/2,250+(col-(ids.length-1)/2)*step));
  }));
  return balls;
}
/** Straight pool: put the pocketed object balls back into the triangle around whatever is still on the
 * table (the apex stays open when nothing blocks the rack). Mutates the given balls; returns how many returned. */
export function reRackStraight(balls){
  const slots=rack(0).filter(b=>b.id>0).map(b=>({x:b.x,y:b.y,used:false}));
  const live=balls.filter(b=>b.id>0&&!b.pocketed);
  // A survivor already sitting in the rack area becomes part of the rack: it snaps to its nearest slot.
  for(const ball of live){
    let best=null,bestD=Infinity;
    for(const slot of slots){const d=Math.hypot(ball.x-slot.x,ball.y-slot.y);if(!slot.used&&d<bestD){best=slot;bestD=d;}}
    if(best&&bestD<TABLE.radius*3){best.used=true;ball.x=best.x;ball.y=best.y;ball.vx=ball.vy=0;}
  }
  const cue=balls.find(b=>b.id===0&&!b.pocketed);
  const slotFree=(slot,blockers)=>!slot.used&&blockers.every(b=>Math.hypot(b.x-slot.x,b.y-slot.y)>=TABLE.radius*2-.01);
  const need=balls.filter(b=>b.id>0&&b.pocketed).length;
  let free=slots.filter(slot=>slotFree(slot,cue?[...live,cue]:live));
  // A cue ball parked in the rack area would block slots: it goes back to the head spot instead.
  if(cue&&free.length<need){cue.x=252;cue.y=250;cue.vx=cue.vy=0;free=slots.filter(slot=>slotFree(slot,live));}
  const usable=free.length>need?free.slice(free.length-need):free;
  let placed=0;
  for(const ball of balls){
    if(ball.id<=0||!ball.pocketed||placed>=usable.length)continue;
    const slot=usable[placed++];
    ball.x=slot.x;ball.y=slot.y;ball.vx=ball.vy=0;ball.slipX=ball.slipY=0;ball.spin=0;ball.follow=0;ball.pocketed=false;
  }
  return placed;
}
/** Radial well capture before cushion response. Mouth guards provide an approach corridor. */
function pocketFor(ball){
  // A ball creeping slowly over a pocket lip has nothing left to carry it
  // across: a slightly wider well lets it drop instead of balancing forever.
  const lip=distance(ball.vx,ball.vy)<70?9:0;
  for(let i=0;i<POCKETS.length;i++){
    const [px,py]=POCKETS[i],side=i===1||i===4;
    const d=distance(ball.x-px,ball.y-py);
    if(d<(side?26:32)+lip)return i;
    // A ball whose centre has rolled past the cloth edge inside a mouth is hanging over the hole and drops.
    if(d<62&&(ball.x<0||ball.x>1000||ball.y<0||ball.y>500))return i;
  }
  return -1;
}
function slowBall(ball,dt){
  const speed=distance(ball.vx,ball.vy);
  if(speed<1.2){ball.vx=ball.vy=ball.slipX=ball.slipY=0;return;}
  const slip=distance(ball.slipX,ball.slipY);
  if(slip>1){
    // Cloth friction slows the slipping contact point 3.5x faster than translation
    // on a freely spinning sphere. Low spin transitions naturally into rolling.
    const impulse=Math.min(PHYSICS.slideDeceleration*dt,slip/3.5);
    const sx=ball.slipX/slip,sy=ball.slipY/slip;
    ball.vx-=sx*impulse;ball.vy-=sy*impulse;
    const slipLeft=Math.max(0,slip-3.5*impulse);
    ball.slipX=sx*slipLeft;ball.slipY=sy*slipLeft;
  }else{
    ball.slipX=ball.slipY=0;
    const slow=Math.min(speed,(PHYSICS.rollingDeceleration+speed*PHYSICS.rollingSpeedDrag)*dt);
    const factor=(speed-slow)/speed;ball.vx*=factor;ball.vy*=factor;
  }
  const decay=Math.max(0,1-PHYSICS.spinDecay*dt);ball.spin*=decay;
}
/** Push a ball out of a cushion face or facing and rebound it. The normal comes from the nearest point on the edge,
 * so a flat face behaves as before and a nose or facing deflects the way a real one does. */
function wallHit(ball,wall,r,events){
  const [qx,qy]=nearestOnSegment(ball.x,ball.y,wall),dx=ball.x-qx,dy=ball.y-qy,d2=dx*dx+dy*dy;
  if(d2>=r*r)return;
  let d=Math.sqrt(d2),nx,ny;
  if(d<1e-6){const wx=wall[2]-wall[0],wy=wall[3]-wall[1],wl=Math.hypot(wx,wy)||1;nx=-wy/wl;ny=wx/wl;d=0;}
  else{nx=dx/d;ny=dy/d;}
  ball.x+=nx*(r-d+.01);ball.y+=ny*(r-d+.01);
  bounceRail(ball,nx,ny,events);
}
function bounceRail(ball,nx,ny,events){
  const normal=ball.vx*nx+ball.vy*ny;
  if(normal>=0)return;
  const impact=-normal;
  ball.vx-=(1+PHYSICS.railRestitution)*normal*nx;
  ball.vy-=(1+PHYSICS.railRestitution)*normal*ny;
  // Same-sign side spin lengthens or shortens the rebound; impulse stays bounded.
  const tx=-ny,ty=nx,tangential=ball.vx*tx+ball.vy*ty;
  const friction=clamp(tangential-ball.spin*.24,-impact*PHYSICS.railFriction,impact*PHYSICS.railFriction);
  ball.vx-=tx*friction;ball.vy-=ty*friction;ball.spin+=friction*.17;
  ball.slipX=ball.vx*.18;ball.slipY=ball.vy*.18;
  events.push({type:'rail',id:ball.id,speed:impact});
}
export class Simulation{
  constructor(balls=rack()){this.balls=balls;this.events=[];this.lastShot=null;this.moving=false;this.elapsed=0;}
  cue(){return this.balls.find(b=>b.id===0);}
  atRest(){return this.balls.every(b=>b.pocketed||distance(b.vx,b.vy)<1.2);}
  canPlaceCue(x,y){
    return Number.isFinite(x)&&Number.isFinite(y)&&x>=30&&x<=970&&y>=30&&y<=470&&
      !this.balls.some(b=>b.id!==0&&!b.pocketed&&distance(b.x-x,b.y-y)<TABLE.radius*2+2);
  }
  placeCue(x,y){
    if(!this.cue()||!this.atRest()||!this.canPlaceCue(x,y))return false;
    Object.assign(this.cue(),{x,y,vx:0,vy:0,spin:0,follow:0,aimX:1,aimY:0,slipX:0,slipY:0,pocketed:false});return true;
  }
  strike(angle,power,spin=0){
    const cue=this.cue();if(!Number.isFinite(angle)||!Number.isFinite(power)||!this.atRest()||!cue||cue.pocketed)return false;
    // Validate the complete shot before moving the cue. A rejected spin must
    // not leave stationary gameplay with a moving ball and no active shot.
    const english=typeof spin==='number'?spin:spin?.x??0;
    const vertical=typeof spin==='number'?0:spin?.y??0;
    if(!Number.isFinite(english)||!Number.isFinite(vertical))return false;
    const speed=clamp(power,.06,1)*PHYSICS.maxSpeed;
    cue.vx=Math.cos(angle)*speed;cue.vy=Math.sin(angle)*speed;
    cue.slipX=cue.vx*.65;cue.slipY=cue.vy*.65;
    cue.spin=clamp(english,-1,1)*speed*.12;
    cue.follow=clamp(vertical,-1,1);cue.aimX=Math.cos(angle);cue.aimY=Math.sin(angle);
    this.lastShot={angle,power,english,vertical};this.moving=true;this.events=[{type:'strike',power}];return true;
  }
  step(dt=TABLE.step){
    if(!Number.isFinite(dt)||dt<=0)return [];
    this.events=[];this.elapsed+=dt;
    const highest=this.balls.reduce((v,b)=>b.pocketed?v:Math.max(v,distance(b.vx,b.vy)),0);
    const steps=Math.max(1,Math.ceil(highest*dt/(TABLE.radius*.7)));
    for(let k=0;k<steps;k++)this.substep(dt/steps);
    if(this.moving&&this.atRest()){
      this.moving=false;this.events.push({type:'settled'});
    }
    return this.events;
  }
  substep(dt){
    const r=TABLE.radius,events=this.events;
    for(const b of this.balls){
      if(b.pocketed)continue;
      slowBall(b,dt);
      const dx=b.vx*dt,dy=b.vy*dt;b.x+=dx;b.y+=dy;advanceRoll(b,dx,dy,r);
      let pocket=pocketFor(b);
      if(pocket!==-1){Object.assign(b,{pocketed:true,vx:0,vy:0,slipX:0,slipY:0});events.push({type:'pocket',id:b.id,pocket});continue;}
      // A rail is absent inside its pocket mouth. Rounded rubber jaws guard each gap.
      for(const wall of WALLS)wallHit(b,wall,r,events);
      // A ball passing through a mouth cannot travel to infinity if it misses a well.
      // Resolve the outer throat as a soft rubber edge instead.
      if(b.y < -35){b.y=-35;bounceRail(b,0,1,events);}
      if(b.y > 535){b.y=535;bounceRail(b,0,-1,events);}
      if(b.x < -35){b.x=-35;bounceRail(b,1,0,events);}
      if(b.x > 1035){b.x=1035;bounceRail(b,-1,0,events);}
    }
    for(let i=0;i<this.balls.length;i++)for(let j=i+1;j<this.balls.length;j++){
      const a=this.balls[i],b=this.balls[j];if(a.pocketed||b.pocketed)continue;
      const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,min=2*r;
      if(d2>=min*min)continue;
      const d=Math.sqrt(d2)||.0001,nx=d>.001?dx/d:1,ny=d>.001?dy/d:0;
      const shift=(min-d+.001)*.5;a.x-=nx*shift;a.y-=ny*shift;b.x+=nx*shift;b.y+=ny*shift;
      const closing=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      if(closing>=0)continue;
      const impulse=-(1+PHYSICS.ballRestitution)*closing/2;
      a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
      // Equal and opposite tangential impulses conserve linear momentum.
      const tx=-ny,ty=nx;
      const slip=(b.vx-a.vx)*tx+(b.vy-a.vy)*ty+(a.spin+b.spin)*.22;
      const tangent=clamp(-slip*.16,-impulse*.13,impulse*.13);
      a.vx-=tangent*tx;a.vy-=tangent*ty;b.vx+=tangent*tx;b.vy+=tangent*ty;
      a.spin+=tangent*.14;b.spin+=tangent*.14;
      // Lightweight follow/draw approximation: a charged cue retains / loses
      // forward travel after its first object-ball contact. A physically complete
      // model must replace this with angular contact impulses.
      for(const cue of [a,b])if(cue.id===0&&Math.abs(cue.follow)>.01){
        const effect=cue.follow*Math.min(300,impulse*.4);
        cue.vx+=cue.aimX*effect;cue.vy+=cue.aimY*effect;cue.follow=0;
      }
      for(const ball of [a,b]){ball.slipX=ball.vx*.2;ball.slipY=ball.vy*.2;}
      events.push({type:'contact',a:a.id,b:b.id,speed:-closing});
    }
  }
  advance(seconds){const events=[];for(let i=0;i<Math.ceil(seconds/TABLE.step);i++)events.push(...this.step());return events;}
  snapshot(){return {balls:this.balls.map(b=>({...b,orientation:[...(b.orientation||[1,0,0,0])]})),moving:this.moving,elapsed:this.elapsed,lastShot:this.lastShot&&{...this.lastShot}};}
  loadSnapshot(state){this.balls=state.balls.map(b=>({...b,orientation:[...(b.orientation||[1,0,0,0])]}));this.moving=state.moving;this.elapsed=state.elapsed;this.lastShot=state.lastShot&&{...state.lastShot};this.events=[];}
}
