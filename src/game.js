import {Simulation,rack,POCKETS,TABLE} from './physics.js';
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
const allowed=(id,group)=>id!==0&&(id===8?group==='eight':group==='open'||(group==='solids'?id<=7:id>=9));
function segmentClear(x1,y1,x2,y2,balls,exclude){
 const dx=x2-x1,dy=y2-y1,den=dx*dx+dy*dy;
 return !balls.some(ball=>{
   if(ball.pocketed||exclude.includes(ball.id))return false;
   const t=Math.max(0,Math.min(1,((ball.x-x1)*dx+(ball.y-y1)*dy)/den));
   return dist(ball.x,ball.y,x1+t*dx,y1+t*dy)<TABLE.radius*2.18;
 });
}
/** A transparent geometry-based CPU: evaluate ghost-ball cut angles and obstructed paths. */
export function chooseShot(sim,group='open',difficulty='rookie'){
 const cue=sim.cue();if(!cue||cue.pocketed)return {angle:0,power:.58};
 let choices=[];
 for(const ball of sim.balls){if(ball.pocketed||!allowed(ball.id,group))continue;
   for(const [px,py] of POCKETS){const d=dist(ball.x,ball.y,px,py),ux=(px-ball.x)/d,uy=(py-ball.y)/d;
     const gx=ball.x-ux*TABLE.radius*2,gy=ball.y-uy*TABLE.radius*2;
     if(gx<20||gx>980||gy<20||gy>480)continue;
     if(!segmentClear(cue.x,cue.y,gx,gy,sim.balls,[0,ball.id]))continue;
     if(!segmentClear(ball.x,ball.y,px,py,sim.balls,[ball.id]))continue;
     const approach=dist(cue.x,cue.y,gx,gy),ax=(gx-cue.x)/approach,ay=(gy-cue.y)/approach;
     const alignment=ax*ux+ay*uy;
     const cost=d*.67+approach*.5+(1-alignment)*550;
     choices.push({angle:Math.atan2(gy-cue.y,gx-cue.x),power:Math.min(.9,Math.max(.23,(approach+d*.45)/1450)),cost});
   }
 }
 choices.sort((a,b)=>a.cost-b.cost);
 const best=choices[0];if(best)return {angle:best.angle+(difficulty==='rookie'?(Math.random()-.5)*.055:(Math.random()-.5)*.017),power:best.power};
 const nearest=sim.balls.filter(b=>!b.pocketed&&allowed(b.id,group)).sort((a,b)=>dist(a.x,a.y,cue.x,cue.y)-dist(b.x,b.y,cue.x,cue.y))[0];
 return nearest?{angle:Math.atan2(nearest.y-cue.y,nearest.x-cue.x)+(Math.random()-.5)*.045,power:.52}:{angle:0,power:.5};
}
export class Game {
 constructor({kind='attract',players='cpu',difficulty='rookie',notify=()=>{}}={}){
  this.kind=kind;this.players=players;this.difficulty=difficulty;this.notify=notify;this.human=0;this.reset();}
 reset(){this.sim=new Simulation(rack(Math.random()*100|0));this.turn=0;this.groups=[null,null];this.break=true;this.foul=false;this.ballInHand=false;this.over=false;this.winner=null;this.timer=0;this.turnShot=null;this.fx=[];this.shots=0;
  this.notify('A fresh rack. Take your time.');}
 get group(){const group=this.groups[this.turn];if(!group)return 'open';return this.sim.balls.some(b=>!b.pocketed&&(group==='solids'?b.id<8&&b.id>0:b.id>8))?group:'eight';}
 isAI(){return this.kind==='attract'||(this.players==='cpu'&&this.turn===1);}
 beginShot(angle,power,english=0){if(this.over||this.ballInHand||!this.sim.strike(angle,power,english))return false;
  this.turnShot={first:null,pots:[],rail:false};this.shots++;this.notify('');return true;}
 placeCue(x,y){if(!this.ballInHand)return false;const placed=this.sim.placeCue(x,y);if(placed){this.ballInHand=false;this.notify('Cue ball placed. Line up your shot.');}return placed;}
 update(dt,{audio=null,haptics=false}={}){
   if(!this.sim.moving){this.timer+=dt;
     if(this.kind==='attract'&&this.timer>1.8){this.timer=0;if(this.sim.cue()?.pocketed){this.sim=new Simulation(rack());this.break=true;}
       const shot=this.break?{angle:0,power:.83}:chooseShot(this.sim,'open','club');this.beginShot(shot.angle,shot.power);}
     else if(this.isAI()&&!this.over&&this.kind==='match'&&this.timer>1.05){this.timer=0;
       if(this.ballInHand){const cue=this.sim.cue();for(const [x,y] of [[240,250],[320,220],[360,300],[210,150]])if(this.sim.placeCue(x,y)){this.ballInHand=false;break;}if(cue?.pocketed)this.sim.placeCue(230,240);}
       const shot=this.break?{angle:0,power:.82}:chooseShot(this.sim,this.group,this.difficulty);this.beginShot(shot.angle,shot.power);}
   }
   this.fx=this.fx.filter(effect=>(effect.life-=dt*1.8)>0);
 }
 step({audio=null,haptics=false}={}){
   const events=this.sim.step();if(this.sim.moving)this.timer=0;
   for(const event of events){
     if(event.type==='contact'&&this.turnShot&&!this.turnShot.first&&(event.a===0||event.b===0))this.turnShot.first=event.a===0?event.b:event.a;
     if(event.type==='rail'&&this.turnShot?.first)this.turnShot.rail=true;
     if(event.type==='pocket'&&this.turnShot){this.turnShot.pots.push(event.id);
       const [px,py]=POCKETS[event.pocket];this.fx.push({x:px,y:Math.max(0,Math.min(500,py)),life:1});
       if(haptics&&this.kind!=='attract')navigator.vibrate?.(12);}
     if(event.type==='settled'&&this.turnShot){this.resolve();}
     if(event.type!=='settled'&&this.kind!=='attract')audio?.play(event);
   }
 }
 resolve(){const shot=this.turnShot;if(!shot)return;this.turnShot=null;if(this.kind==='attract')return;
   if(this.kind==='practice'){
     if(shot.pots.includes(0)){this.sim.placeCue(240,245);this.notify('Scratch. Tap an open spot to place the cue ball.');this.ballInHand=true;}
     else if(shot.pots.length)this.notify(`${shot.pots.filter(id=>id!==0).length} pocketed. Nice touch.`);
     else this.notify('Keep exploring the angles.');
     if(this.sim.balls.every(b=>b.id===0||b.pocketed)){this.notify('Table cleared. Rack again to replay.');this.over=true;}
     return;
   }
   const pocket=shot.pots.filter(id=>id!==0&&id!==8),scratch=shot.pots.includes(0),eight=shot.pots.includes(8);
   if(eight&&!this.break){
     const legalGroup=this.group==='eight';const legal=legalGroup&&!scratch&&shot.first===8;
     this.over=true;this.winner=legal?this.turn:1-this.turn;this.notify(legal?`Player ${this.turn+1} clears the table!`:`Early or illegal 8-ball. Player ${2-this.turn} wins.`);return;}
   // v0: Casual 8-ball (no manual called pockets); authoritative official rules are a later milestone.
   let foul=scratch||(!this.break&&(shot.first===null||(this.group==='eight'?shot.first!==8:this.groups[this.turn]?!allowed(shot.first,this.group):shot.first===8)));
   if(!this.break&&!foul&&shot.first!==null&&!shot.rail&&!shot.pots.length)foul=true;
   if(eight&&this.break){const b=this.sim.balls.find(b=>b.id===8);Object.assign(b,{pocketed:false,x:790,y:250,vx:0,vy:0});}
   if(!this.break&&!foul&&!this.groups[this.turn]&&pocket.length){const pick=pocket[0];this.groups[this.turn]=pick<=7?'solids':'stripes';this.groups[1-this.turn]=pick<=7?'stripes':'solids';}
   const mine=!this.groups[this.turn]?pocket.length>0:pocket.some(id=>allowed(id,this.group));
   const wasBreak=this.break;this.break=false;
   if(foul||(!mine&&!wasBreak)||(!pocket.length&&wasBreak)){this.turn=1-this.turn;this.ballInHand=foul;this.foul=foul;
     this.notify(foul?'Foul. Opponent has ball in hand.':`Player ${this.turn+1} to shoot.`);}
   else{this.foul=false;this.notify(`Player ${this.turn+1} keeps the table.`);}
   this.timer=0;
 }
}
