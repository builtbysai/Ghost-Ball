export const SOLIDS=Object.freeze([1,2,3,4,5,6,7]);
export const STRIPES=Object.freeze([9,10,11,12,13,14,15]);
export const BALL_COLORS=Object.freeze(['#efece3','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d','#191918','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d']);
/** Open-table slots preview both groups without implying either player owns them. */
export function slotModels(groups,player,pocketed=[]){
 const group=groups[player],ids=group==='stripes'?STRIPES:group==='solids'?SOLIDS:player===0?SOLIDS:STRIPES;
 const taken=new Set(pocketed);
 return ids.map(id=>({id,color:BALL_COLORS[id],stripe:id>8,preview:!group,pocketed:taken.has(id)}));
}
