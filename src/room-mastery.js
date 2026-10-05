/** All five playable halls have an authored real-physics drill each.
 * Levels are immutable receipts: 1=skill, 2=finished CPU match here,
 * 4=legal CPU eight-ball victory here. No hall is locked by this module.
 */
export const FOUNDER_MASTERY=Object.freeze([
 Object.freeze({room:0,drillId:'center-drop',drillName:'CENTER DROP'}),
 Object.freeze({room:1,drillId:'corner-line',drillName:'CORNER LINE'}),
 Object.freeze({room:2,drillId:'rail-return',drillName:'RAIL RETURN'}),
 Object.freeze({room:3,drillId:'glass-angle',drillName:'GLASS ANGLE'}),
 Object.freeze({room:4,drillId:'midnight-bank',drillName:'MIDNIGHT BANK'})
]);
const find=room=>FOUNDER_MASTERY.find(h=>h.room===room);
export function roomMastery(progress,room){
 const config=find(room);if(!config)return null;
 const records=Array.isArray(progress?.records)?progress.records:[];
 const history=records.filter(e=>e?.room===room&&e.players==='cpu');
 const stored=Number.isInteger(progress?.roomMastery?.[room])?progress.roomMastery[room]&7:0;
 const drill=Boolean((stored&1)||progress?.drills?.[config.drillId]>=1);
 const match=Boolean((stored&2)||history.length);
 const win=Boolean((stored&4)||history.some(e=>e.winner===0&&e.reason==='eight-cleared'));
 const steps=[
  {id:'drill',done:drill,label:'COMPLETE '+config.drillName,drillId:config.drillId},
  {id:'match',done:match,label:'FINISH A RIVAL MATCH HERE'},
  {id:'win',done:win,label:'WIN CLEAN VS A RIVAL HERE'}
 ];
 const count=steps.filter(step=>step.done).length;
 return {room,count,total:3,complete:count===3,
  mask:(drill?1:0)|(match?2:0)|(win?4:0),
  next:steps.find(step=>!step.done)?.label??'ROOM MASTERED',steps};
}
function backfilled(progress){
 return Object.fromEntries(FOUNDER_MASTERY.map(h=>[h.room,roomMastery(progress,h.room).mask]));
}
/** Caller is the verified live-match persistence gate, never menu navigation. */
export function awardRoomMatch(progress,event){
 const out=backfilled(progress),config=find(event.room);
 if(config&&event.players==='cpu'){
  out[config.room]|=2;
  if(event.winner===0&&event.reason==='eight-cleared')out[config.room]|=4;
 }
 return out;
}
/** Caller must grade a completed live settled drill before using this. */
export function awardRoomDrill(progress,event){
 const out=backfilled(progress);
 const config=FOUNDER_MASTERY.find(h=>h.drillId===event.drillId);
 if(config)out[config.room]|=1;
 return out;
}
