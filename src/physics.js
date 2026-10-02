/** Deterministic 240 Hz, browser-free pool simulation. Units: 1000 x 500 cloth. */
export const TABLE = Object.freeze({width: 1000, height: 500, radius: 12, step: 1 / 240});
export const POCKETS = Object.freeze([[-7,-7],[500,-13],[1007,-7],[-7,507],[500,513],[1007,507]]);
// Tunable arcade-calibrated coefficients. NOT measured cloth or tournament specifications.
export const PHYSICS = Object.freeze({
  slideDeceleration: 760, rollingDeceleration: 135, rollingSpeedDrag: .10,
  ballRestitution: .94, railRestitution: .84, railFriction: .14,
  spinDecay: 1.25, jawRestitution: .58, maxSpeed: 2050,
});
const BALL_COLORS = ['#efece3','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d','#191918','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(x,y)=>Math.hypot(x,y);
const topMouth=x=>x<45||x>955||Math.abs(x-500)<36;
const sideMouth=y=>y<45||y>455;
// Circular rubber-nose guards discourage balls from clipping through pocket corners.
export const JAWS = Object.freeze([
  [43,12],[12,43],[957,12],[988,43], [43,488],[12,457],[957,488],[988,457],
  [461,12],[539,12],[461,488],[539,488],
]);
export function makeBall(id,x,y){return {id,x,y,vx:0,vy:0,spin:0,slipX:0,slipY:0,pocketed:false,color:BALL_COLORS[id],rotation:0};}
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
/** Radial well capture before cushion response. Mouth guards provide an approach corridor. */
function pocketFor(ball){
  for(let i=0;i<POCKETS.length;i++){
    const [px,py]=POCKETS[i],side=i===1||i===4;
    if(distance(ball.x-px,ball.y-py)<(side?26:32))return i;
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
function jawHit(ball,jx,jy,events){
  const dx=ball.x-jx,dy=ball.y-jy,r=TABLE.radius+4,d2=dx*dx+dy*dy;
  if(d2>=r*r)return;
  const d=Math.sqrt(d2)||.001,nx=dx/d,ny=dy/d;
  ball.x+=nx*(r-d+.05);ball.y+=ny*(r-d+.05);
  const normal=ball.vx*nx+ball.vy*ny;
  if(normal>=0)return;
  ball.vx-=(1+PHYSICS.jawRestitution)*normal*nx;
  ball.vy-=(1+PHYSICS.jawRestitution)*normal*ny;
  ball.spin*=.65;ball.slipX=ball.vx*.16;ball.slipY=ball.vy*.16;
  if(-normal>60)events.push({type:'rail',id:ball.id,speed:-normal,jaw:true});
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
    Object.assign(this.cue(),{x,y,vx:0,vy:0,spin:0,slipX:0,slipY:0,pocketed:false});return true;
  }
  strike(angle,power,english=0){
    const cue=this.cue();if(!Number.isFinite(angle)||!Number.isFinite(power)||!this.atRest()||!cue||cue.pocketed)return false;
    const speed=clamp(power,.06,1)*PHYSICS.maxSpeed;
    cue.vx=Math.cos(angle)*speed;cue.vy=Math.sin(angle)*speed;
    cue.slipX=cue.vx*.65;cue.slipY=cue.vy*.65;
    cue.spin=clamp(english,-1,1)*speed*.12;
    this.lastShot={angle,power,english};this.moving=true;this.events=[{type:'strike',power}];return true;
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
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.rotation+=distance(b.vx,b.vy)*dt/r;
      let pocket=pocketFor(b);
      if(pocket!==-1){Object.assign(b,{pocketed:true,vx:0,vy:0,slipX:0,slipY:0});events.push({type:'pocket',id:b.id,pocket});continue;}
      // A rail is absent inside its pocket mouth. Rounded rubber jaws guard each gap.
      if(b.y<r&&!topMouth(b.x)){b.y=r;bounceRail(b,0,1,events);}
      if(b.y>500-r&&!topMouth(b.x)){b.y=500-r;bounceRail(b,0,-1,events);}
      if(b.x<r&&!sideMouth(b.y)){b.x=r;bounceRail(b,1,0,events);}
      if(b.x>1000-r&&!sideMouth(b.y)){b.x=1000-r;bounceRail(b,-1,0,events);}
      for(const [jx,jy] of JAWS)jawHit(b,jx,jy,events);
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
      for(const ball of [a,b]){ball.slipX=ball.vx*.2;ball.slipY=ball.vy*.2;}
      events.push({type:'contact',a:a.id,b:b.id,speed:-closing});
    }
  }
  advance(seconds){const events=[];for(let i=0;i<Math.ceil(seconds/TABLE.step);i++)events.push(...this.step());return events;}
  snapshot(){return {balls:this.balls.map(b=>({...b})),moving:this.moving,elapsed:this.elapsed,lastShot:this.lastShot&&{...this.lastShot}};}
  loadSnapshot(state){this.balls=state.balls.map(b=>({...b}));this.moving=state.moving;this.elapsed=state.elapsed;this.lastShot=state.lastShot&&{...state.lastShot};this.events=[];}
}
