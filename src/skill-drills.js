import {makeBall} from './physics.js';

/** Hand-authored, fixed-layout skills: same physics and stroke controls as a
 * real match, no timers, purchases, fake simulated completions or cue buffs.
 * Only target-ball pocket events from the actual settled physics can win.
 */
export const FOUNDER_DRILLS=Object.freeze([
 Object.freeze({id:'center-drop',name:'Center Drop',subtitle:'The straight shot',
  instruction:'Pocket the 1 in the top middle. No scratch.',
  brief:'LINE UP A CLEAN STRAIGHT POT',
  room:0,targetId:1,targetPocket:1,attempts:2,
  cue:Object.freeze({x:500,y:356}),target:Object.freeze({x:500,y:174}),
  // Reference is descriptive only; the player still aims and pulls manually.
  referenceAngle:-Math.PI/2}),
 Object.freeze({id:'corner-line',name:'Corner Line',subtitle:'The diagonal shot',
  instruction:'Pocket the 2 in the top right. No scratch.',
  brief:'READ THE CORNER ANGLE',
  room:1,targetId:2,targetPocket:2,attempts:2,
  cue:Object.freeze({x:594,y:333}),target:Object.freeze({x:725,y:225}),
  referenceAngle:Math.atan2(-232,282)}),
 Object.freeze({id:'rail-return',name:'Rail Return',subtitle:'The one-cushion bank',
  instruction:'Bank the 3 off the bottom cushion into top middle. No scratch.',
  brief:'BOTTOM CUSHION → TOP MIDDLE',room:2,targetId:3,targetPocket:1,
  requiredCushion:true,attempts:2,
  cue:Object.freeze({x:750,y:60}),target:Object.freeze({x:680,y:210}),
  // Solved with real settled physics at 40% and keyboard 53% power.
  referenceAngle:116.5*Math.PI/180}),
 // Mirrored angular read: aim through the lower half of the cloth instead of
 // memorizing Corner Line's top-right line. The pocket/jaw geometry is mirrored.
 Object.freeze({id:'glass-angle',name:'Glass Angle',subtitle:'The lower-corner angle',
  instruction:'Pocket the 4 in the bottom right. No scratch.',
  brief:'READ THE LOWER CORNER',room:3,targetId:4,targetPocket:5,attempts:2,
  cue:Object.freeze({x:594,y:167}),target:Object.freeze({x:725,y:275}),
  referenceAngle:Math.atan2(232,282)}),
 // Reflect Rail Return across the table centerline: an upper-cushion bank
 // into lower middle. True non-jaw target-ball rail contact is mandatory.
 Object.freeze({id:'midnight-bank',name:'Midnight Bank',subtitle:'The upper-cushion bank',
  instruction:'Bank the 5 off the top cushion into bottom middle. No scratch.',
  brief:'TOP CUSHION → BOTTOM MIDDLE',room:4,targetId:5,targetPocket:4,
  requiredCushion:true,attempts:2,
  cue:Object.freeze({x:750,y:440}),target:Object.freeze({x:680,y:290}),
  referenceAngle:-116.5*Math.PI/180})
]);
// More skills, solved with the real physics (the unit tests re-strike each `solution`). They teach
// cue-ball control, cutting to the ghost ball and speed, and are not tied to a hall's mastery steps.
const EXTRA=[
 Object.freeze({id:'draw-shot',name:'Draw Shot',subtitle:'Backspin',
  instruction:'Pocket the 6 in the top middle, then draw the cue ball back into the ring. Use backspin (the cue-ball button).',
  brief:'BACKSPIN BRINGS IT BACK',room:0,targetId:6,targetPocket:1,attempts:2,
  cue:Object.freeze({x:500,y:360}),target:Object.freeze({x:500,y:250}),
  goal:Object.freeze({kind:'cue-zone',x:500,y:398,r:60}),
  referenceAngle:-Math.PI/2,solution:Object.freeze({angle:-Math.PI/2,power:.55,spin:Object.freeze({x:0,y:-.8})})}),
 Object.freeze({id:'ghost-cut',name:'Ghost Ball Cut',subtitle:'Aim at the ghost',
  instruction:'Pocket the 4 in the top left. Line the cue ball up with the ghost ball (a little beyond the 4) to make the cut.',
  brief:'AIM AT THE GHOST BALL',room:1,targetId:4,targetPocket:0,attempts:2,
  cue:Object.freeze({x:300,y:260}),target:Object.freeze({x:150,y:120}),
  referenceAngle:-2.3745,solution:Object.freeze({angle:-2.3745,power:.5,spin:Object.freeze({x:0,y:0})})}),
 Object.freeze({id:'soft-touch',name:'Soft Touch',subtitle:'Speed control',
  instruction:'Send the 9 gently down the table to rest inside the ring. Do not pot it.',
  brief:'FEEL THE SPEED',room:2,targetId:9,targetPocket:-1,attempts:2,
  cue:Object.freeze({x:420,y:250}),target:Object.freeze({x:600,y:250}),
  goal:Object.freeze({kind:'ball-zone',x:850,y:250,r:85}),
  referenceAngle:0,solution:Object.freeze({angle:0,power:.215,spin:Object.freeze({x:0,y:0})})})
];
export const EXTRA_DRILLS=Object.freeze(EXTRA);
/** Every drill: the five founder skills (tied to the halls' mastery steps) and the extra skills. */
export const SKILL_DRILLS=Object.freeze([...FOUNDER_DRILLS,...EXTRA]);
export const skillDrillById=id=>SKILL_DRILLS.find(drill=>drill.id===id)||null;
export function skillDrillBalls(id){
 const drill=skillDrillById(id);
 if(!drill)throw new RangeError('Unknown skill drill');
 return [makeBall(0,drill.cue.x,drill.cue.y),
   makeBall(drill.targetId,drill.target.x,drill.target.y)];
}
/** Score only the settled event log, never a click/animation or ball snapshot.
 * A wrong-pocket pot and a scratch terminate this attempt, so a failed drill
 * cannot be replayed as though a correctly pocketed target still existed.
 */
export function gradeSkillDrill(id,{shots,shot,end}={}){
 const drill=skillDrillById(id);
 if(!drill||!Number.isInteger(shots)||shots<1||
  !shot||!Array.isArray(shot.potRecords)||!Array.isArray(shot.pots))
  return {status:'invalid'};
 const scratched=shot.pots.includes(0);
 const target=shot.potRecords.find(record=>record?.id===drill.targetId);
 if(scratched)return {status:'failed',reason:'scratch'};
 const inZone=point=>point&&!point.pocketed&&drill.goal&&Math.hypot(point.x-drill.goal.x,point.y-drill.goal.y)<=drill.goal.r;
 // Speed control: the target must come to rest in the ring without being potted, after the cue ball hit it first.
 if(drill.goal?.kind==='ball-zone'){
  if(target)return {status:'failed',reason:'potted'};
  if(shot.first===drill.targetId&&inZone(end?.balls?.[drill.targetId]))return {status:'completed',reason:'in-zone'};
  return shots>=drill.attempts?{status:'failed',reason:'out-of-shots'}:{status:'continue',reason:'try-again'};
 }
 if(target){
  if(target.pocket!==drill.targetPocket)return {status:'failed',reason:'wrong-pocket'};
  // A true bank requires a non-jaw cushion collision by the target ball.
  if(drill.requiredCushion&&(!Array.isArray(shot.cushionBalls)||
    !shot.cushionBalls.includes(drill.targetId)))
   return {status:'failed',reason:'no-bank'};
  // Cue-ball control: the pot only counts when the cue ball also finishes inside the ring.
  if(drill.goal?.kind==='cue-zone'&&!inZone(end?.cue))return {status:'failed',reason:'position'};
  return {status:'completed',reason:'target-pocket'};
 }
 return shots>=drill.attempts
  ?{status:'failed',reason:'out-of-shots'}
  :{status:'continue',reason:'try-again'};
}
