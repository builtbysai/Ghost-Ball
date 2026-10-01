/** Independent fixed-step table simulation. Distances are abstract table units. */
export const TABLE = Object.freeze({width: 1000, height: 500, radius: 12, step: 1 / 240});
export const POCKETS = Object.freeze([[0,0],[500,-4],[1000,0],[0,500],[500,504],[1000,500]]);
const BALL_COLORS = ['#efece3','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d','#191918','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d'];
const clamp = (n,low,high)=>Math.max(low,Math.min(high,n));
const length = (x,y)=>Math.hypot(x,y);
export function makeBall(id,x,y){return {id,x,y,vx:0,vy:0,spin:0,pocketed:false,color:BALL_COLORS[id],rotation:0};}

/** Tight 8-ball rack: 8 center, opposite groups at the back corners. */
export function rack(seed=0){
  const balls=[makeBall(0,252,250)];
  const rows=[[1],[2,9],[3,8,10],[4,11,12,5],[7,13,6,14,15]];
  for(let row=0;row<5;row++)for(let col=0;col<=row;col++){
    const dy=(col-row/2)*(TABLE.radius*2+0.3);
    const dx=row*(TABLE.radius*2+0.3)*Math.sqrt(3)/2;
    const jitter=(Math.sin((seed+1)*73+row*19+col*7))*0.015;
    balls.push(makeBall(rows[row][col],718+dx+jitter,250+dy));
  }
  return balls;
}
export class Simulation {
  constructor(balls=rack()) {this.balls=balls;this.events=[];this.lastShot=null;this.moving=false;this.elapsed=0;}
  cue(){return this.balls.find(b=>b.id===0);}
  atRest(){return this.balls.every(b=>b.pocketed || Math.hypot(b.vx,b.vy)<1.2);}
  strike(angle,power,english=0){
    if(!this.atRest() || !this.cue() || this.cue().pocketed)return false;
    const cue=this.cue(), speed=clamp(power,0.06,1)*2050;
    cue.vx=Math.cos(angle)*speed;cue.vy=Math.sin(angle)*speed; cue.spin=clamp(english,-1,1)*speed*0.12;
    this.lastShot={angle,power,english};this.moving=true;this.events=[{type:'strike',power}];return true;
  }
  /** Multiple substeps at fixed 240 Hz prevent tunnelling through thin balls. */
  step(dt=TABLE.step){
    this.events=[];this.elapsed+=dt;
    const r=TABLE.radius;
    for (const ball of this.balls){
      if(ball.pocketed)continue;
      const vx=ball.vx,vy=ball.vy,speed=length(vx,vy);
      if(speed>0){const slower=Math.max(0,speed-(32+speed*0.38)*dt);const q=slower/speed;ball.vx*=q;ball.vy*=q;
        if(slower<1.2){ball.vx=0;ball.vy=0;}}
      ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.rotation+=length(ball.vx,ball.vy)*dt/r;
      ball.spin*=Math.max(0,1-1.35*dt);
      // Pocket capture happens before rail response: each aperture has a mouth.
      let captured=false;
      for(let p=0;p<POCKETS.length;p++){
        const [px,py]=POCKETS[p],side=p===1||p===4;
        if(length(ball.x-px,ball.y-py)<(side?26:30)){
          ball.pocketed=true;ball.vx=ball.vy=0;this.events.push({type:'pocket',id:ball.id,pocket:p});captured=true;break;
        }
      }
      if(captured)continue;
      if(ball.x<r || ball.x>TABLE.width-r){ball.x=clamp(ball.x,r,TABLE.width-r);ball.vx=-ball.vx*0.82;ball.vy+=ball.spin*0.06;ball.spin*=0.72;this.events.push({type:'rail',id:ball.id,speed:Math.abs(ball.vx)});}
      if(ball.y<r || ball.y>TABLE.height-r){ball.y=clamp(ball.y,r,TABLE.height-r);ball.vy=-ball.vy*0.82;ball.vx+=ball.spin*0.06;ball.spin*=0.72;this.events.push({type:'rail',id:ball.id,speed:Math.abs(ball.vy)});}
    }
    // Symmetric normal impulses. Positional correction resolves tiny overlaps.
    for(let i=0;i<this.balls.length;i++)for(let j=i+1;j<this.balls.length;j++){
      const a=this.balls[i],b=this.balls[j];if(a.pocketed||b.pocketed)continue;
      const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,minimum=2*r;
      if(d2>=minimum*minimum)continue;
      const d=Math.sqrt(d2)||0.0001,nx=d>0.001?dx/d:1,ny=d>0.001?dy/d:0;
      const overlap=minimum-d,shift=(overlap+0.01)*0.5;
      a.x-=nx*shift;a.y-=ny*shift;b.x+=nx*shift;b.y+=ny*shift;
      const closing=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      if(closing>=0)continue;
      const impulse=-(1+0.94)*closing/2;
      a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
      if(a.id===0 || b.id===0){const cue=a.id===0?a:b;const english=clamp(cue.spin/250,-1,1);const tangentX=-ny,tangentY=nx; cue.vx+=tangentX*english*40;cue.vy+=tangentY*english*40;cue.spin*=0.4;}
      this.events.push({type:'contact',a:a.id,b:b.id,speed:-closing});
    }
    if(this.moving&&this.atRest()){this.moving=false;this.events.push({type:'settled'});}
    return this.events;
  }
  advance(seconds){const events=[];for(let i=0;i<Math.ceil(seconds/TABLE.step);i++)events.push(...this.step());return events;}
  placeCue(x,y){const cue=this.cue();if(!cue||!this.atRest())return false;x=clamp(x,30,970);y=clamp(y,30,470);
    if(this.balls.some(b=>b.id!==0&&!b.pocketed&&length(b.x-x,b.y-y)<TABLE.radius*2+2))return false;
    Object.assign(cue,{x,y,vx:0,vy:0,pocketed:false,spin:0});return true;}
}
