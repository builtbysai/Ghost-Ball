import {Simulation,rack,POCKETS,TABLE} from './physics.js';
import {createRandom} from './random.js';
import {nearbyLegalCuePlacement} from './placement-guide.js';
export const SHOT_CLOCK_SECONDS=45;
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
export function chooseShot(sim,group='open',difficulty='rookie',random=createRandom(1)){
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
 const best=choices[0];if(best)return {angle:best.angle+(difficulty==='rookie'?(random()-.5)*.055:(random()-.5)*.017),power:best.power};
 const nearest=sim.balls.filter(b=>!b.pocketed&&allowed(b.id,group)).sort((a,b)=>dist(a.x,a.y,cue.x,cue.y)-dist(b.x,b.y,cue.x,cue.y))[0];
 return nearest?{angle:Math.atan2(nearest.y-cue.y,nearest.x-cue.x)+(random()-.5)*.045,power:.52}:{angle:0,power:.5};
}
export class Game {
 constructor({kind='attract',players='cpu',difficulty='rookie',seed=Date.now(),notify=()=>{},onPocket=()=>{},onTurn=()=>{}}={}){
  this.kind=kind;this.players=players;this.difficulty=difficulty;this.notify=notify;this.human=0;
  this.onPocket=onPocket;this.onTurn=onTurn;this.random=createRandom(seed);this.seed=seed;this.history=[];this.reset();}
 reset(){this.rackSeed=this.random()*100000|0;this.sim=new Simulation(rack(this.rackSeed));this.turn=0;this.groups=[null,null];this.break=true;this.foul=false;this.ballInHand=false;this.over=false;this.winner=null;this.timer=0;this.turnShot=null;this.fx=[];this.shots=0;
  this.history=[];this.previewShot=null;this.activeStroke=null;
  this.shotRemaining=SHOT_CLOCK_SECONDS;this.shotClockKey='';
  this.notify('A fresh rack. Take your time.');}
 get group(){const group=this.groups[this.turn];if(!group)return 'open';return this.sim.balls.some(b=>!b.pocketed&&(group==='solids'?b.id<8&&b.id>0:b.id>8))?group:'eight';}
 isAI(){return this.kind==='attract'||(this.players==='cpu'&&this.turn===1);}
  beginShot(angle,power,spin=0){if(this.over||this.ballInHand||!this.sim.strike(angle,power,spin))return false;
  // Pre-strike state is obtained from the new sim snapshot; the velocities are
  // replaced by zeros for deterministic playback/bug reports without a giant log.
  this.history.push({angle,power,spin:typeof spin==='number'?{x:spin,y:0}:{...spin},turn:this.turn,shot:this.shots+1});
  this.turnShot={first:null,pots:[],rail:false};this.shots++;this.notify('');return true;}
 placeBreakCue(x,y){if(!this.break||this.shots||this.sim.moving||this.over||x>265||!this.sim.placeCue(x,y))return false;this.history.push({kind:'break-placement',x,y});this.notify('Cue positioned. Line up your break.');return true;}
 placeCue(x,y){if(!this.ballInHand)return false;const placed=this.sim.placeCue(x,y);if(placed){this.history.push({kind:'placement',x,y});this.ballInHand=false;this.shotClockKey='';this.notify('Cue ball placed. Line up your shot.');}return placed;}
 spotEight(){
   const eight=this.sim.balls.find(b=>b.id===8);if(!eight)return false;
   // Standard spot, then search nearby along the lengthwise centerline to
   // avoid placing a spotted eight inside another stationary ball.
   const xs=[790];for(let offset=28;offset<=196;offset+=28)xs.push(790-offset,790+offset);
   for(const y of [250,222,278,194,306])for(const x of xs){
     if(x<30||x>970||this.sim.balls.some(b=>b!==eight&&!b.pocketed&&dist(b.x,b.y,x,y)<TABLE.radius*2+2))continue;
     Object.assign(eight,{pocketed:false,x,y,vx:0,vy:0,spin:0,slipX:0,slipY:0});return true;
   }
   return false;
 }
 /** A casual timed-out shot is a standard foul; the new player gets ball in hand. */
 expireShotClock(){
   if(this.kind!=='match'||this.over||this.sim.moving||this.ballInHand||this.turnShot)return false;
   const offender=this.turn;
   this.history.push({kind:'shot-clock-expired',turn:offender,shot:this.shots+1});
   this.turn=1-offender;this.foul=true;this.ballInHand=true;this.previewShot=null;
   this.timer=0;this.shotRemaining=SHOT_CLOCK_SECONDS;this.shotClockKey='';
   this.notify(`Shot clock expired. Player ${this.turn+1} has ball in hand.`);
   this.onTurn({type:'foul',reason:'shot-clock',turn:this.turn,offender});
   return true;
 }
 /** The CPU previews the real shot it will take, including cue motion. */
 get presentedCue(){
   const shot=this.previewShot;
   if(this.activeStroke&&this.activeStroke.elapsed<.18){
     return {angle:this.activeStroke.angle,power:this.activeStroke.power,
       strike:{...this.activeStroke,progress:Math.min(1,this.activeStroke.elapsed/.16)},showGuide:false};
   }
   if(!shot||this.sim.moving)return null;
   const duration=this.kind==='attract'?2.4:1.35;
   const ready=Math.min(1,this.timer/duration);
   return {angle:shot.angle+.105*Math.sin(ready*Math.PI*1.7)*(1-ready),
     power:shot.power,drawback:(.09+ready*.46)*(this.kind==='attract'?1:.65),showGuide:false};
 }
 update(dt,{audio=null,haptics=false}={}){
   if(this.activeStroke){this.activeStroke.elapsed+=dt;
     if(this.activeStroke.elapsed>=.18)this.activeStroke=null;}
   if(!this.sim.moving){this.timer+=dt;
     if(this.kind==='attract' && (this.sim.cue()?.pocketed ||
         this.sim.balls.filter(b=>b.id!==0&&!b.pocketed).length<4 ||
         this.sim.balls.find(b=>b.id===8)?.pocketed)){
       this.sim=new Simulation(rack(this.random()*100000|0));
       this.break=true;this.timer=0;this.previewShot=null;
     }
     if(this.isAI()&&!this.over){
       if(this.kind==='match'&&this.ballInHand){
         const preferred=[[240,250],[320,220],[360,300],[210,150]];
         // Fall back when the normal ball-in-hand positions are obstructed.
         for(let x=100;x<=900;x+=100)for(const y of [250,150,350])preferred.push([x,y]);
         for(const [x,y] of preferred){
           const spot=nearbyLegalCuePlacement(this.sim,x,y,{maxDistance:52});
           if(spot&&this.sim.placeCue(spot.x,spot.y)){
             this.ballInHand=false;this.shotClockKey='';break;
           }
         }
         this.previewShot=null;
       }
       if(!this.previewShot){
         this.previewShot=this.break?{angle:0,power:this.kind==='attract'?.83:.82}:
           chooseShot(this.sim,this.kind==='attract'?'open':this.group,
             this.kind==='attract'?(this.turn===0?'club':'rookie'):this.difficulty,this.random);
       }
       if(this.timer>=(this.kind==='attract'?2.4:1.35)){
         const shot=this.previewShot, cue=this.sim.cue();
         if(cue&&!cue.pocketed&&this.beginShot(shot.angle,shot.power)){
           this.activeStroke={cue:{x:cue.x,y:cue.y},angle:shot.angle,power:shot.power,elapsed:0};
           if(this.kind==='match')audio?.play({type:'strike',power:shot.power});
         }
         this.previewShot=null;this.timer=0;
       }
     }
   }
   // The rule is owned by Game, not by a decorative HUD counter.
   if(this.kind==='match'&&!this.over&&!this.sim.moving&&!this.ballInHand){
     const key=`${this.turn}:${this.shots}:${this.break}`;
     if(key!==this.shotClockKey){this.shotClockKey=key;this.shotRemaining=SHOT_CLOCK_SECONDS;}
     else if(this.shotRemaining>0){
       this.shotRemaining=Math.max(0,this.shotRemaining-dt);
       if(this.shotRemaining===0)this.expireShotClock();
     }
   }
   this.fx=this.fx.filter(effect=>(effect.life-=dt*(effect.type==='pocket'?5:1.8))>0);
 }
 step({audio=null,haptics=false}={}){
   const events=this.sim.step();if(this.sim.moving)this.timer=0;
   for(const event of events){
     if(event.type==='contact'&&this.turnShot&&!this.turnShot.first&&(event.a===0||event.b===0))this.turnShot.first=event.a===0?event.b:event.a;
     if(event.type==='rail'&&this.turnShot?.first)this.turnShot.rail=true;
     if(event.type==='pocket'){this.onPocket(event);}
     if(event.type==='pocket'&&this.turnShot){this.turnShot.pots.push(event.id);
       const [px,py]=POCKETS[event.pocket],ball=this.sim.balls.find(b=>b.id===event.id);
       this.fx.push({type:'pocket',x:px,y:py,sourceX:ball?.x??px,sourceY:ball?.y??py,color:ball?.color,life:1});
       if(haptics&&this.kind!=='attract')navigator.vibrate?.(12);}
     if(event.type==='settled'&&this.turnShot){this.resolve();}
     if(event.type!=='settled'&&this.kind!=='attract')audio?.play(event);
   }
 }
 resolve(){const shot=this.turnShot;if(!shot)return;this.turnShot=null;if(this.kind==='attract'){this.turn=1-this.turn;this.timer=0;this.break=false;this.previewShot=null;return;}
   if(this.kind==='practice'){
     if(shot.pots.includes(0)){this.sim.placeCue(240,245);this.notify('Scratch. Tap an open spot to place the cue ball.');this.ballInHand=true;}
     else if(shot.pots.length)this.notify(`${shot.pots.filter(id=>id!==0).length} pocketed. Nice touch.`);
     else this.notify('Keep exploring the angles.');
     if(this.sim.balls.every(b=>b.id===0||b.pocketed)){this.notify('Table cleared. Rack again to replay.');this.over=true;this.onTurn({type:'win',practice:true});}
     return;
   }
   const pocket=shot.pots.filter(id=>id!==0&&id!==8),scratch=shot.pots.includes(0),eight=shot.pots.includes(8);
   if(eight&&!this.break){
     const legalGroup=this.group==='eight';const legal=legalGroup&&!scratch&&shot.first===8;
     this.over=true;this.winner=legal?this.turn:1-this.turn;
     this.notify(legal?`Player ${this.turn+1} clears the table!`:`Early or illegal 8-ball. Player ${2-this.turn} wins.`);
     this.onTurn({type:'win',winner:this.winner,legal});return;}
   // v0: Casual 8-ball (no manual called pockets); authoritative official rules are a later milestone.
   let foul=scratch||(!this.break&&(shot.first===null||(this.group==='eight'?shot.first!==8:this.groups[this.turn]?!allowed(shot.first,this.group):shot.first===8)));
   if(!this.break&&!foul&&shot.first!==null&&!shot.rail&&!shot.pots.length)foul=true;
   if(eight&&this.break)this.spotEight();
   if(!this.break&&!foul&&!this.groups[this.turn]&&pocket.length){const pick=pocket[0];this.groups[this.turn]=pick<=7?'solids':'stripes';this.groups[1-this.turn]=pick<=7?'stripes':'solids';}
   const mine=!this.groups[this.turn]?pocket.length>0:pocket.some(id=>allowed(id,this.group));
   const wasBreak=this.break;this.break=false;
   if(foul||(!mine&&!wasBreak)||(!pocket.length&&wasBreak)){this.turn=1-this.turn;this.ballInHand=foul;this.foul=foul;
     this.notify(foul?'Foul. Opponent has ball in hand.':`Player ${this.turn+1} to shoot.`);
     this.onTurn({type:foul?'foul':'turn',turn:this.turn,ballInHand:foul});}
   else{this.foul=false;this.notify(`Player ${this.turn+1} keeps the table.`);}
   this.timer=0;
 }
}
