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
export const lowestGroup=(ids,topBall=9)=>{const live=ids.filter(id=>id>0);return live.length?`low-${Math.min(...live)}`:`low-${topBall}`;};
export const groupContains=(id,group)=>typeof group==='string'&&group.startsWith('low-')?id===Number(group.slice(4)):group==='solids'?id>=1&&id<=7:group==='stripes'?id>=9&&id<=15:group==='eight'?id===8:group==='any'?id>=1&&id<=15:group==='open'?groupOf(id)!==null:false;

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
 * Official (WPA-style) 8-ball, layered on the casual referee.
 *  - After the break every shot names a pocket (or is a safety). Only object balls that drop in the
 *    called pocket count; any other pot stays down but does not continue the turn or assign a group.
 *  - The 8 must go in the called pocket after the group is cleared (a wrong pocket loses the rack).
 *  - The break must pot a ball or drive four object balls to a cushion; otherwise the incoming player
 *    chooses to accept the table or have it re-racked with themselves breaking.
 * Pure: no world mutation. `shot.call` is the pocket index, or a negative number for a safety.
 */
export function resolveOfficialEight({turn,breakShot,groups,shot}){
 if(!shot||![0,1].includes(turn))throw new TypeError('Invalid official 8-ball shot');
 const next=1-turn,pots=shot.pots||[],records=shot.potRecords||[];
 if(breakShot){
  const base=resolveCasualEight({turn,breakShot,groups,shot});
  const potted=pots.some(id=>id>0),rails=new Set((shot.railBalls||[]).filter(id=>id>0)).size;
  if(!base.foul&&base.type!=='end'&&!potted&&rails<4)
   return {...base,type:'break-choice',reason:'illegal-break',turn:next,breakShooter:turn,winner:null,ballInHand:false,foul:false};
  return base;
 }
 const called=Number.isInteger(shot.call)&&shot.call>=0?shot.call:null;
 const counted=new Set(records.filter(r=>groupOf(r.id)&&called!==null&&r.pocket===called).map(r=>r.id));
 const ordinaryPotted=pots.some(id=>groupOf(id));
 const adjusted={...shot,
  callRequired:shot.groupAtStart==='eight'?true:shot.callRequired,
  call:called??-1,
  pots:pots.filter(id=>!groupOf(id)||counted.has(id)),
  // Any ball that dropped means the shot reached a cushion or pocket, so an uncalled pot is not a no-rail foul.
  rail:shot.rail||ordinaryPotted};
 return resolveCasualEight({turn,breakShot,groups,shot:adjusted});
}

/**
 * Straight pool (14.1) for phones: a race to a point target. Every ball is a point.
 *  - After the opening shot, a pocket is called on every shot; balls that drop in the called pocket
 *    score one point each and keep the turn. A ball in any other pocket stays down and scores nothing.
 *  - The opening shot scores whatever it pots and only a scratch is a foul.
 *  - A foul (scratch, no contact, nothing reaching a cushion) costs one point and gives ball in hand;
 *    the third foul in a row costs fifteen more.
 * Pure: no world mutation. `shot.call` is the pocket index, or negative for a safety.
 */
export function resolveStraightPool({turn,breakShot,shot,priorFouls=0}){
 if(!shot||![0,1].includes(turn))throw new TypeError('Invalid straight pool shot');
 const next=1-turn,pots=shot.pots||[],records=shot.potRecords||[];
 const scratch=pots.includes(0),object=pots.filter(id=>id>0);
 const called=Number.isInteger(shot.call)&&shot.call>=0?shot.call:null;
 const counted=breakShot?object:records.filter(r=>r.id>0&&called!==null&&r.pocket===called).map(r=>r.id);
 const reason=scratch?'scratch':shot.first===null?'no-contact':
  !breakShot&&!shot.rail&&object.length===0?'no-rail':null;
 const foul=reason!==null;
 if(foul){
  const third=priorFouls>=2;
  return {type:'foul',reason,turn:next,points:third?-16:-1,gained:0,counted:[],ballInHand:true,foul:true,threeFouls:third};
 }
 return {type:counted.length?'retain':'turn',reason:null,turn:counted.length?turn:next,points:counted.length,gained:counted.length,
  counted,ballInHand:false,foul:false};
}

/**
 * One-pocket: each player owns one pocket and the first to put eight balls in it wins.
 *  - A ball in your pocket is yours and keeps your turn; a ball in your opponent's pocket is theirs.
 *  - A ball in any other pocket goes back on the table.
 *  - A foul (scratch, no contact, nothing reaching a cushion) gives ball in hand and costs the shooter a
 *    ball: one of theirs goes back on the table. Balls the shooter potted in their own pocket on that
 *    shot are spotted instead of counted.
 * Pure: no world mutation. `owner` is [seat0Pocket, seat1Pocket].
 */
export function resolveOnePocket({turn,shot,owner}){
 if(!shot||![0,1].includes(turn)||!Array.isArray(owner))throw new TypeError('Invalid one-pocket shot');
 const next=1-turn,records=(shot.potRecords||[]).filter(r=>r.id>0),pots=shot.pots||[];
 const scratch=pots.includes(0);
 const reason=scratch?'scratch':shot.first===null?'no-contact':!shot.rail&&records.length===0?'no-rail':null;
 const foul=reason!==null;
 const own=records.filter(r=>r.pocket===owner[turn]).map(r=>r.id);
 const theirs=records.filter(r=>r.pocket===owner[next]).map(r=>r.id);
 const stray=records.filter(r=>r.pocket!==owner[0]&&r.pocket!==owner[1]).map(r=>r.id);
 if(foul)return {type:'foul',reason,turn:next,credit:{[turn]:[],[next]:theirs},spot:[...own,...stray],penalty:1,ballInHand:true,foul:true};
 return {type:own.length?'retain':'turn',reason:null,turn:own.length?turn:next,credit:{[turn]:own,[next]:theirs},spot:stray,penalty:0,ballInHand:false,foul:false};
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
export function resolveNineBall({turn,breakShot,shot,priorFouls=0,topBall=9,callTop=false,pushOut=false}){
 if(!shot||![0,1].includes(turn))throw new TypeError('Invalid nine-ball shot');
 const next=1-turn,pots=shot.pots||[];
 const lowest=Number((shot.groupAtStart||'low-1').slice(4));
 const scratch=pots.includes(0),top=pots.includes(topBall);
 // Push-out (the shot right after a legal break): the cue ball may go anywhere, only a scratch is a foul,
 // and the opponent then chooses to shoot from there or pass it back. Nothing potted counts; the top ball is spotted.
 if(pushOut&&!breakShot&&!scratch)return {type:'pushout',reason:null,spotNine:top,spotTop:top,turn:next,pusher:turn,
  winner:null,legal:null,groups:[null,null],ballInHand:false,foul:false};
 // WPA break: pot a ball or drive at least four object balls to a cushion.
 const railBalls=new Set((shot.railBalls||[]).filter(id=>id>0)).size;
 const brokeLegally=!breakShot||pots.some(id=>id>0)||railBalls>=4;
 const reason=scratch?'scratch':shot.first===null?'no-contact':shot.first!==lowest?'wrong-ball-first':
  !brokeLegally?'illegal-break':!shot.rail&&!pots.some(id=>id>0)?'no-rail':null;
 const foul=reason!==null;
 // Three fouls in a row lose the rack, and warning is given at two.
 if(foul&&priorFouls>=2)return {type:'end',winner:next,legal:false,reason:'three-fouls',spotNine:false,spotTop:false,
  groups:[null,null],turn:next,ballInHand:false,foul:true};
 // Ten-ball: the last ball only wins when it is the lowest ball left and goes in the called pocket.
 let topWins=top&&!foul;
 if(topWins&&callTop){
  const record=(shot.potRecords||[]).find(r=>r.id===topBall);
  topWins=!breakShot&&lowest===topBall&&Number.isInteger(shot.call)&&record?.pocket===shot.call;
 }
 if(topWins)return {type:'end',winner:turn,legal:true,reason:callTop?'ten-potted':'nine-potted',spotNine:false,spotTop:false,
  groups:[null,null],turn,ballInHand:false,foul:false};
 const potted=pots.some(id=>id>0&&id!==topBall);
 const spot=top; // an uncounted top ball always goes back on the table
 return {type:foul?'foul':potted?'retain':'turn',reason,spotNine:spot,spotTop:spot,
  turn:foul||!potted?next:turn,winner:null,legal:null,groups:[null,null],ballInHand:foul,foul};
}
