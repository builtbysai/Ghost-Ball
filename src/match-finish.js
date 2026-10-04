/** Explain only the genuine last terminal casual referee ruling.
 * A missing pocket event never becomes a fabricated eight-ball pot.
 */
export const POCKET_LABELS=Object.freeze([
 'TOP LEFT','TOP MIDDLE','TOP RIGHT','BOTTOM LEFT','BOTTOM MIDDLE','BOTTOM RIGHT'
]);
export function decisiveShot(history){
 if(!Array.isArray(history))return null;
 const ruling=[...history].reverse().find(entry=>entry?.kind==='ruling');
 if(!ruling||ruling.result!=='end')return null;
 const eight=Array.isArray(ruling.potRecords)?
  ruling.potRecords.find(p=>(p?.id===8||((ruling.reason==='nine-potted'&&p?.id===9)||(ruling.reason==='ten-potted'&&p?.id===10)))&&Number.isInteger(p.pocket)&&p.pocket>=0&&p.pocket<6):null;
 const pocket=eight?.pocket??null;
 switch(ruling.reason){
  case 'eight-cleared':
   return {label:pocket===null?'CLEAN EIGHT':'EIGHT · '+POCKET_LABELS[pocket],pocket,clean:true};
  case 'early-eight':
   return {label:pocket===null?'EARLY EIGHT':'EARLY EIGHT · '+POCKET_LABELS[pocket],pocket:null,clean:false};
  case 'scratch-on-eight':
   return {label:'SCRATCH ON THE EIGHT',pocket:null,clean:false};
  case 'nine-potted':
   return {label:pocket===null?'NINE':'NINE · '+POCKET_LABELS[pocket],pocket,clean:true};
  case 'ten-potted':
   return {label:pocket===null?'TEN':'TEN · '+POCKET_LABELS[pocket],pocket,clean:true};
  case 'race-won':
   return {label:'RACE WON',pocket:null,clean:true};
  case 'three-fouls':
   return {label:'THREE FOULS IN A ROW',pocket:null,clean:false};
  case 'wrong-pocket':
   return {label:pocket===null?'WRONG POCKET':'WRONG POCKET · '+POCKET_LABELS[pocket],pocket:null,clean:false};
  case 'wrong-ball-first':
   return {label:'WRONG FIRST CONTACT',pocket:null,clean:false};
  default:return null;
 }
}
