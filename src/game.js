import {Simulation,rack,POCKETS,TABLE} from './physics.js';
import {createRandom} from './random.js';
import {resolveCasualEight,groupContains} from './casual-rules.js';
import {chooseShot,chooseAiCuePlacement,createShotPlanner,candidateShots} from './ai.js';
import {skillDrillById,skillDrillBalls,gradeSkillDrill} from './skill-drills.js';
import {impactEffectFor} from './impact-effects.js';
export {chooseShot} from './ai.js';
export const SHOT_CLOCK_SECONDS=45;
export const AI_PLACEMENT_PAUSE=1.1;
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
export class Game {
 constructor({kind='attract',players='cpu',difficulty='rookie',seed=Date.now(),drillId=null,notify=()=>{},onPocket=()=>{},onTurn=()=>{}}={}){
  this.kind=kind;this.players=players;this.difficulty=difficulty;this.notify=notify;this.human=0;
   if(kind==='drill'&&!skillDrillById(drillId))throw new RangeError('Unknown skill drill');
   this.drillId=kind==='drill'?drillId:null;
  this.onPocket=onPocket;this.onTurn=onTurn;this.random=createRandom(seed);this.seed=seed;this.history=[];this.reset();}
 reset(){this.rackSeed=this.random()*100000|0;
   this.sim=new Simulation(this.kind==='drill'?skillDrillBalls(this.drillId):rack(this.rackSeed));
   this.turn=0;this.groups=[null,null];this.break=this.kind!=='drill';
   this.foul=false;this.ballInHand=false;this.over=false;this.winner=null;
   this.timer=0;this.turnShot=null;this.fx=[];this.shots=0;this.drillOutcome=null;
  this.history=[];this.previewShot=null;this.planIterator=null;this.planningPose=null;this.planSettledAt=0;this.activeStroke=null;
  this.shotRemaining=SHOT_CLOCK_SECONDS;this.shotClockKey='';this.dryTurns=[0,0];
  this.notify('A fresh rack. Take your time.');}
 get group(){const group=this.groups[this.turn];if(!group)return 'open';return this.sim.balls.some(b=>!b.pocketed&&(group==='solids'?b.id<8&&b.id>0:b.id>8))?group:'eight';}
 isAI(){return this.kind==='attract'||(this.players==='cpu'&&this.turn===1);}
  beginShot(angle,power,spin=0){if(this.over||this.ballInHand||!this.sim.strike(angle,power,spin))return false;
  // Pre-strike state is obtained from the new sim snapshot; the velocities are
  // replaced by zeros for deterministic playback/bug reports without a giant log.
  this.history.push({angle,power,spin:typeof spin==='number'?{x:spin,y:0}:{...spin},turn:this.turn,shot:this.shots+1});
  this.turnShot={first:null,pots:[],potRecords:[],rail:false,railBalls:[],cushionBalls:[],groupAtStart:this.group};this.shots++;this.notify('');return true;}
 placeBreakCue(x,y){if(!this.break||this.shots||this.sim.moving||this.over||x>265||!this.sim.placeCue(x,y))return false;this.history.push({kind:'break-placement',x,y});this.notify('Cue positioned. Line up your break.');return true;}
 placeCue(x,y){if(!this.ballInHand)return false;const placed=this.sim.placeCue(x,y);if(placed){this.history.push({kind:'placement',x,y});this.ballInHand=false;this.planIterator=null;this.planningPose=null;this.planSettledAt=0;this.shotClockKey='';this.notify('Cue ball placed. Line up your shot.');}return placed;}
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
   this.turn=1-offender;this.foul=true;this.ballInHand=true;
   // Never resume the expired player's partially evaluated shot when this
   // seat becomes CPU-controlled again later in the same rack.
   this.previewShot=null;this.planIterator=null;this.planningPose=null;
   this.planSettledAt=0;
   this.timer=0;this.shotRemaining=SHOT_CLOCK_SECONDS;this.shotClockKey='';
   this.notify(`Shot clock expired. Player ${this.turn+1} has ball in hand.`);
   this.onTurn({type:'foul',reason:'shot-clock',turn:this.turn,offender});
   return true;
 }
 /** The CPU previews the real shot it will take, including cue motion. */
 get presentedCue(){
   if(this.activeStroke&&this.activeStroke.elapsed<.18){
     return {angle:this.activeStroke.angle,power:this.activeStroke.power,
       strike:{...this.activeStroke,progress:Math.min(1,this.activeStroke.elapsed/.16)},showGuide:false};
   }
   const shot=this.previewShot||this.planningPose;
   if(!shot||this.sim.moving)return null;
   const duration=this.kind==='attract'?2.4:1.35;
   const ready=Math.min(1,this.timer/duration);
   let visualAngle=shot.angle;
   if(this.previewShot&&this.planningPose){
     // Rotate the visible cue from the immediate geometric guess toward the
     // finished physical plan. Never change the actual chosen shot.
     const t=Math.max(0,Math.min(1,(this.timer-this.planSettledAt)/.22));
     const eased=t*t*(3-2*t);
     const delta=Math.atan2(Math.sin(shot.angle-this.planningPose.angle),
       Math.cos(shot.angle-this.planningPose.angle));
     visualAngle=this.planningPose.angle+delta*eased;
   }
   return {angle:visualAngle+.105*Math.sin(ready*Math.PI*1.7)*(1-ready),
     power:shot.power,drawback:(.09+ready*.46)*(this.kind==='attract'?1:.65),showGuide:false};
 }
 update(dt,{audio=null,haptics=false}={}){
   this.fx=this.fx.filter(effect=>(effect.life-=dt*(effect.type==='pocket'?5:effect.type==='impact'?4.2:3.2))>0);
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
         // A visible beat before the CPU takes ball in hand lets the human
         // register that the turn changed hands.
         if(this.timer<AI_PLACEMENT_PAUSE)return;
         const placement=chooseAiCuePlacement(this.sim,this.group,this.difficulty);
         if(placement&&this.placeCue(placement.x,placement.y)){
           // Reusing Game.placeCue ensures the actual AI follows the same
           // referee and event-history path as local play and our bench.
           this.timer=0;
         }
         this.previewShot=null;
       }
       if(this.ballInHand)return; // no strike while there is no legal site
       if(!this.previewShot){
         if(this.break)this.previewShot={angle:0,power:this.kind==='attract'?.83:.82};
         else{
           const attract=this.kind==='attract';
           const group=attract?'open':this.group;
           const tier=attract?(this.turn===0?'club':'rookie'):this.difficulty;
           if(!this.planIterator){
             this.planIterator=createShotPlanner(this.sim,group,tier,this.random,
               {stalled:this.dryTurns[this.turn]||0});
             const guess=candidateShots(this.sim,group)[0],cue=this.sim.cue();
             const legal=this.sim.balls.filter(b=>!b.pocketed&&groupContains(b.id,group))
               .sort((a,b)=>Math.hypot(a.x-cue.x,a.y-cue.y)-
                 Math.hypot(b.x-cue.x,b.y-cue.y))[0];
             this.planningPose=guess?{angle:guess.angle,power:guess.power}:
               legal?{angle:Math.atan2(legal.y-cue.y,legal.x-cue.x),power:.45}:
               {angle:0,power:.5};
           }
           // At most one predicted physical second per rendering frame. The
           // cue remains visibly aimed at the provisional legal target.
           for(let i=0;i<240;i++){
             const result=this.planIterator.next();
             if(result.done){
               this.previewShot=result.value;this.planIterator=null;
               this.planSettledAt=this.timer;break;
             }
           }
         }
       }
       if(this.previewShot&&this.timer>=(this.kind==='attract'?2.4:1.35)&&
           (!this.planningPose||this.timer-this.planSettledAt>=.22)){
         const shot=this.previewShot, cue=this.sim.cue();
         if(cue&&!cue.pocketed&&this.beginShot(shot.angle,shot.power)){
           this.activeStroke={cue:{x:cue.x,y:cue.y},angle:shot.angle,power:shot.power,elapsed:0};
           if(this.kind==='match')audio?.play({type:'strike',power:shot.power});
         }
         this.previewShot=null;this.planningPose=null;this.planSettledAt=0;this.timer=0;
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
 }
 step({audio=null,haptics=false}={}){
   const events=this.sim.step();if(this.sim.moving)this.timer=0;
   for(const event of events){
     // Impulse glints are a presentation-only layer; cap simultaneous effects.
     if(this.kind!=='attract'&&this.fx.length<10){
       const mark=impactEffectFor(event,this.sim);if(mark)this.fx.push(mark);
     }
     if(event.type==='contact'&&this.turnShot&&!this.turnShot.first&&(event.a===0||event.b===0))this.turnShot.first=event.a===0?event.b:event.a;
     if(event.type==='rail'&&this.turnShot){
       if(this.turnShot.first!==null)this.turnShot.rail=true;
       const rails=this.turnShot.railBalls??=[];
       if(event.id!==0&&!rails.includes(event.id))rails.push(event.id);
       // Separate true cushion contacts from jaw contacts at pocket mouths.
       if(!event.jaw&&event.id!==0&&!this.turnShot.cushionBalls.includes(event.id))
         this.turnShot.cushionBalls.push(event.id);
     }
     if(event.type==='pocket'){this.onPocket(event);}
     if(event.type==='pocket'&&this.turnShot){this.turnShot.pots.push(event.id);
       (this.turnShot.potRecords??=[]).push({id:event.id,pocket:event.pocket});
       const [px,py]=POCKETS[event.pocket],ball=this.sim.balls.find(b=>b.id===event.id);
       this.fx.push({type:'pocket',x:px,y:py,sourceX:ball?.x??px,sourceY:ball?.y??py,color:ball?.color,life:1});
       if(haptics&&this.kind!=='attract')navigator.vibrate?.(12);}
     if(event.type==='settled'&&this.turnShot){this.resolve();}
     if(event.type!=='settled'&&this.kind!=='attract')audio?.play(event);
   }
 }
 resolve(){const shot=this.turnShot;if(!shot)return;this.turnShot=null;this.planIterator=null;if(this.kind==='attract'){this.turn=1-this.turn;this.timer=0;this.break=false;this.previewShot=null;return;}
   if(this.kind==='drill'){
     const grade=gradeSkillDrill(this.drillId,{shots:this.shots,shot});
     this.history.push({kind:'drill-ruling',drillId:this.drillId,shot:this.shots,
       reason:grade.reason,status:grade.status,potRecords:[...(shot.potRecords||[])],
       cushionBalls:[...(shot.cushionBalls||[])]});
     this.timer=0;
     if(grade.status==='completed'||grade.status==='failed'){
       this.drillOutcome=grade.status;this.over=true;
       const complete=grade.status==='completed';
       this.notify(complete?'Skill completed.':'Attempt finished. Reset to try again.');
       this.onTurn({type:'drill-end',kind:'drill',drillId:this.drillId,
         completed:complete,reason:grade.reason,shots:this.shots,
         evidence:{pots:[...shot.pots],potRecords:[...shot.potRecords],
           cushionBalls:[...(shot.cushionBalls||[])]}});
     }else{
       this.notify('One more shot. Pick your angle.');
       this.onTurn({type:'drill-continue',kind:'drill',drillId:this.drillId,remaining:1});
     }
     return;
   }
   if(this.kind==='practice'){
     if(shot.pots.includes(0)){this.sim.placeCue(240,245);this.notify('Scratch. Tap an open spot to place the cue ball.');this.ballInHand=true;}
     else if(shot.pots.length)this.notify(`${shot.pots.filter(id=>id!==0).length} pocketed. Nice touch.`);
     else this.notify('Keep exploring the angles.');
     if(this.sim.balls.every(b=>b.id===0||b.pocketed)){this.notify('Table cleared. Rack again to replay.');this.over=true;this.onTurn({type:'win',practice:true});}
     return;
   }
   const shooter=this.turn,previousGroups=[...this.groups];
   const result=resolveCasualEight({
     turn:this.turn,breakShot:this.break,groups:this.groups,shot
   });
   // Serializable ruling log supports future match replays and referee QA.
   this.history.push({kind:'ruling',shot:this.shots,shooter,result:result.type,
     reason:result.reason,turn:result.turn,groups:[...result.groups],
     ballInHand:result.ballInHand,winner:result.winner,
     groupAtStart:shot.groupAtStart,firstContact:shot.first,
     railAfterFirst:!!shot.rail,elapsedSimSeconds:this.sim.elapsed,
     potRecords:[...(shot.potRecords||[])],
     breakRailBalls:[...(shot.railBalls||[])]});
   this.dryTurns[shooter]=result.type==='retain'?0:(this.dryTurns[shooter]||0)+1;
   if(result.spotEight)this.spotEight();
   this.groups=result.groups;this.break=false;
   if(result.type==='end'){
     this.over=true;this.winner=result.winner;this.foul=false;this.ballInHand=false;
     const finished=result.legal
       ?`Player ${this.turn+1} clears the table!`
       :`Early or illegal 8-ball. Player ${result.winner+1} wins.`;
     this.notify(finished);
     this.onTurn({type:'win',winner:this.winner,legal:result.legal,reason:result.reason});
   }else{
     this.turn=result.turn;this.ballInHand=result.ballInHand;this.foul=result.foul;
     if(result.type==='foul'){
       const messages={
         scratch:'Scratch. Opponent has ball in hand.',
         'no-contact':'No contact. Opponent has ball in hand.',
         'wrong-ball-first':'Wrong ball first. Opponent has ball in hand.',
         'no-rail':'No rail after contact. Opponent has ball in hand.'
       };
       this.notify(messages[result.reason]||'Foul. Opponent has ball in hand.');
     }else this.notify(result.type==='retain'
       ?`Player ${this.turn+1} keeps the table.`
       :`Player ${this.turn+1} to shoot.`);
     this.onTurn({type:result.type==='foul'?'foul':'turn',turn:this.turn,shooter,
       potted:shot.pots.filter(id=>id>0),scratched:shot.pots.includes(0),
       ballInHand:this.ballInHand,reason:result.reason,
       retain:result.type==='retain',
       assignment:result.groups[shooter]!==previousGroups[shooter]?result.groups[shooter]:null});
   }
   this.timer=0;

 }
}
