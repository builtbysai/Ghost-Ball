import {makeBall} from './physics.js';

/** Hand-authored, fixed-layout skills: same physics and stroke controls as a
 * real match, no timers, purchases, fake simulated completions or cue buffs.
 * Only target-ball pocket events from the actual settled physics can win.
 */
export const SKILL_DRILLS=Object.freeze([
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
  referenceAngle:Math.atan2(-232,282)})
]);
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
export function gradeSkillDrill(id,{shots,shot}={}){
 const drill=skillDrillById(id);
 if(!drill||!Number.isInteger(shots)||shots<1||
  !shot||!Array.isArray(shot.potRecords)||!Array.isArray(shot.pots))
  return {status:'invalid'};
 const scratched=shot.pots.includes(0);
 const target=shot.potRecords.find(record=>record?.id===drill.targetId);
 if(scratched)return {status:'failed',reason:'scratch'};
 if(target)return target.pocket===drill.targetPocket
  ?{status:'completed',reason:'target-pocket'}
  :{status:'failed',reason:'wrong-pocket'};
 return shots>=drill.attempts
  ?{status:'failed',reason:'out-of-shots'}
  :{status:'continue',reason:'try-again'};
}
