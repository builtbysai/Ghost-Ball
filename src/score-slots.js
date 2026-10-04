export const SOLIDS=Object.freeze([1,2,3,4,5,6,7]);
export const STRIPES=Object.freeze([9,10,11,12,13,14,15]);
export const BALL_COLORS=Object.freeze(['#efece3','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d','#191918','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d']);
/**
 * Seven tray slots per player. While the table is open nobody owns a group, so
 * the slots are neutral ghosts (no number, no colour) rather than sample balls
 * that read as an assignment. Once groups are known the slots become the real
 * numbered solids or stripes, pocketed ones flagged for dimming.
 */
export function slotModels(groups,player,pocketed=[]){
 const group=groups[player];
 if(!group)return Array.from({length:7},(_,index)=>
  ({id:null,slot:index+1,color:null,stripe:false,ghost:true,preview:true,pocketed:false}));
 const ids=group==='stripes'?STRIPES:SOLIDS,taken=new Set(pocketed);
 return ids.map(id=>({id,slot:null,color:BALL_COLORS[id],stripe:id>8,ghost:false,preview:false,pocketed:taken.has(id)}));
}
/**
 * The dedicated 8-ball slot. It stays dormant until the player has cleared
 * their group ('active', "on the 8"), and shows the ball pocketed only when
 * that player legally won with it.
 * @param {{groups:(string|null)[],pocketed:number[],over:boolean,winner:number|null,
 *   legalEight:boolean}} state
 */
export function eightSlotModel(state,player){
 const {groups,pocketed=[],over=false,winner=null,legalEight=false}=state;
 const group=groups[player];
 if(over&&legalEight&&winner===player)return {state:'pocketed',id:8,color:BALL_COLORS[8]};
 if(over)return {state:'inactive',id:8,color:BALL_COLORS[8]};
 if(!group)return {state:'inactive',id:8,color:BALL_COLORS[8]};
 const own=group==='stripes'?STRIPES:SOLIDS,taken=new Set(pocketed);
 const cleared=own.every(id=>taken.has(id));
 return {state:cleared&&!taken.has(8)?'active':'inactive',id:8,color:BALL_COLORS[8]};
}
