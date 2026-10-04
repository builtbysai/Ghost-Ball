/**
 * Ghost Ball's deliberately forgiving CASUAL 8-ball resolver.
 *
 * Pure and browser-independent. It intentionally does not implement WPA's
 * called shots, head-string break choices, or formal illegal-break options.
 * Snapshot the shooter's group before the stroke so that sinking the final
 * group ball and the 8 on the same shot cannot be mistaken for a legal win.
 */
export const groupOf=id=>id>=1&&id<=7?'solids':id>=9&&id<=15?'stripes':null;
/** Nine-ball has no groups; the only legal first contact is the lowest ball, written 'low-N'. */
export const lowestGroup=ids=>{const live=ids.filter(id=>id>0);return live.length?`low-${Math.min(...live)}`:'low-9';};
export const groupContains=(id,group)=>typeof group==='string'&&group.startsWith('low-')?id===Number(group.slice(4)):group==='solids'?id>=1&&id<=7:group==='stripes'?id>=9&&id<=15:group==='eight'?id===8:group==='open'?groupOf(id)!==null:false;

/**
 * @param {{turn:number,breakShot:boolean,groups:(string|null)[],shot:
 * {first:number|null,pots:number[],rail:boolean,groupAtStart:string,
 * callRequired?:boolean,call?:number,potRecords?:{id:number,pocket:number}[]}}} input
 * @returns {object} resolved turn, foul, and winner state. No world mutations.
 */
export function resolveCasualEight({turn,breakShot,groups,shot}){
 if(!shot||![0,1].includes(turn))throw new TypeError('Invalid casual 8-ball shot');
 const next=1-turn,pots=shot.pots||[],ordinary=pots.filter(id=>groupOf(id));
 const scratch=pots.includes(0),eight=pots.includes(8);
 const group=shot.groupAtStart||'open';
 if(eight&&!breakShot){
   // Optional "call the 8": the eight must drop in the pocket the shooter named.
   const dropped=(shot.potRecords||[]).find(record=>record?.id===8);
   const pocketOk=!shot.callRequired||dropped?.pocket===shot.call;
   const legal=group==='eight'&&!scratch&&shot.first===8&&pocketOk;
   return {type:'end',winner:legal?turn:next,legal,reason:legal?'eight-cleared':
     scratch?'scratch-on-eight':group!=='eight'?'early-eight':shot.first!==8?'wrong-ball-first':'wrong-pocket',
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

/**
 * Casual nine-ball (WPA flavour, without push-out or the three-foul rule).
 *  - The first ball struck must be the lowest numbered ball on the table.
 *  - Legally pot any ball and you keep shooting; pot the 9 legally and you win,
 *    on the break or by combination.
 *  - A foul (scratch, wrong first ball, no contact, or nothing to a cushion after
 *    contact) gives ball in hand and flips the turn; a 9 potted on a foul is re-spotted.
 * Pure: no world mutation.
 * @param {{turn:number,breakShot:boolean,shot:{first:number|null,pots:number[],rail:boolean,
 *   groupAtStart:string}}} input
 */
export function resolveNineBall({turn,breakShot,shot,priorFouls=0}){
 if(!shot||![0,1].includes(turn))throw new TypeError('Invalid nine-ball shot');
 const next=1-turn,pots=shot.pots||[];
 const lowest=Number((shot.groupAtStart||'low-1').slice(4));
 const scratch=pots.includes(0),nine=pots.includes(9);
 // WPA break: pot a ball or drive at least four object balls to a cushion.
 const railBalls=new Set((shot.railBalls||[]).filter(id=>id>0)).size;
 const brokeLegally=!breakShot||pots.some(id=>id>0)||railBalls>=4;
 const reason=scratch?'scratch':shot.first===null?'no-contact':shot.first!==lowest?'wrong-ball-first':
  !brokeLegally?'illegal-break':!shot.rail&&!pots.some(id=>id>0)?'no-rail':null;
 const foul=reason!==null;
 // Three fouls in a row lose the rack, and warning is given at two.
 if(foul&&priorFouls>=2)return {type:'end',winner:next,legal:false,reason:'three-fouls',spotNine:false,
  groups:[null,null],turn:next,ballInHand:false,foul:true};
 if(nine&&!foul)return {type:'end',winner:turn,legal:true,reason:'nine-potted',spotNine:false,
  groups:[null,null],turn,ballInHand:false,foul:false};
 const potted=pots.some(id=>id>0&&id!==9);
 return {type:foul?'foul':potted?'retain':'turn',reason,spotNine:nine&&foul,
  turn:foul||!potted?next:turn,winner:null,legal:null,groups:[null,null],ballInHand:foul,foul};
}
