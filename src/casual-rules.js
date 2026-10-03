/**
 * Ghost Ball's deliberately forgiving CASUAL 8-ball resolver.
 *
 * Pure and browser-independent. It intentionally does not implement WPA's
 * called shots, head-string break choices, or formal illegal-break options.
 * Snapshot the shooter's group before the stroke so that sinking the final
 * group ball and the 8 on the same shot cannot be mistaken for a legal win.
 */
export const groupOf=id=>id>=1&&id<=7?'solids':id>=9&&id<=15?'stripes':null;
export const groupContains=(id,group)=>group==='solids'?id>=1&&id<=7:group==='stripes'?id>=9&&id<=15:group==='eight'?id===8:group==='open'?groupOf(id)!==null:false;

/**
 * @param {{turn:number,breakShot:boolean,groups:(string|null)[],shot:
 * {first:number|null,pots:number[],rail:boolean,groupAtStart:string}}} input
 * @returns {object} resolved turn, foul, and winner state. No world mutations.
 */
export function resolveCasualEight({turn,breakShot,groups,shot}){
 if(!shot||![0,1].includes(turn))throw new TypeError('Invalid casual 8-ball shot');
 const next=1-turn,pots=shot.pots||[],ordinary=pots.filter(id=>groupOf(id));
 const scratch=pots.includes(0),eight=pots.includes(8);
 const group=shot.groupAtStart||'open';
 if(eight&&!breakShot){
   const legal=group==='eight'&&!scratch&&shot.first===8;
   return {type:'end',winner:legal?turn:next,legal,reason:legal?'eight-cleared':
     scratch?'scratch-on-eight':group!=='eight'?'early-eight':'wrong-ball-first',
     spotEight:false,groups:[...groups],turn,ballInHand:false,foul:false};
 }
 // On the first shot the actual object group is irrelevant. Casual mode
 // requires contact and does not add the WPA four-rail option flow.
 const reason=scratch?'scratch':shot.first===null?'no-contact':
   !breakShot&&!groupContains(shot.first,group)?'wrong-ball-first':
   !breakShot&&!shot.rail&&pots.length===0?'no-rail':null;
 const foul=reason!==null,assigned=[...groups];
 if(!breakShot&&!foul&&!assigned[turn]&&ordinary.length){
   assigned[turn]=groupOf(ordinary[0]);
   assigned[next]=assigned[turn]==='solids'?'stripes':'solids';
 }
 const assignedGroup=assigned[turn];
 const mine=assignedGroup?ordinary.some(id=>groupOf(id)===assignedGroup):
   ordinary.length>0;
 const keep=!foul&&(breakShot?ordinary.length>0:mine);
 return {
   type:foul?'foul':keep?'retain':'turn',reason,spotEight:breakShot&&eight,
   turn:keep?turn:next,winner:null,legal:null,groups:assigned,
   ballInHand:foul,foul
 };
}
