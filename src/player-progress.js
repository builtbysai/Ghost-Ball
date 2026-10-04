/** Ghost Ball v0: local-only, versioned, bounded match and ownership ledger.
 * No telemetry, account, currency or faux achievements. A newer/corrupt
 * record is never silently replaced by this version of the game.
 */
import {validHighlights} from './highlights.js';
import {groupContains} from './casual-rules.js';
import {skillDrillById,gradeSkillDrill} from './skill-drills.js';
import {awardRoomMatch,awardRoomDrill} from './room-mastery.js';

export const PROGRESS_KEY='ghostball-progress-v1';
export const PROGRESS_VERSION=1;
/** The Club Circuit: beat each named opponent in turn. A win advances; a loss replays the round. */
export const CIRCUIT=Object.freeze(['rookie','dex','vera','club']);
const RECORD_LIMIT=80,DAILY_LIMIT=60,DAY_KEY=/^\d{4}-\d\d-\d\d$/;
const FINISH_REASONS=new Set(['eight-cleared','early-eight','scratch-on-eight','wrong-ball-first','wrong-pocket','nine-potted','ten-potted','three-fouls','race-won']);

export function freshProgress(){
 return {version:PROGRESS_VERSION,matchesPlayed:0,vsCpuWins:0,vsCpuLosses:0,
  localMatches:0,cleanWins:0,bestRun:0,selectedCue:'house',selectedRoom:1,favorites:[],
  achievements:[],records:[],drills:{},drillEvents:[],roomMastery:{}};
}
function validProgress(p){
 const count=n=>Number.isSafeInteger(n)&&n>=0;
 return p&&typeof p==='object'&&p.version===PROGRESS_VERSION&&
  ['matchesPlayed','vsCpuWins','vsCpuLosses','localMatches','cleanWins','bestRun']
   .every(key=>count(p[key]))&&
  typeof p.selectedCue==='string'&&p.selectedCue.length<=64&&
  count(p.selectedRoom)&&p.selectedRoom<64&&
  (p.favorites===undefined||Array.isArray(p.favorites)&&p.favorites.length<=6&&
   p.favorites.every(id=>typeof id==='string'&&id.length<=64))&&
  Array.isArray(p.achievements)&&p.achievements.every(id=>typeof id==='string')&&
  (p.drills===undefined||(p.drills&&typeof p.drills==='object'&&!Array.isArray(p.drills)&&
   Object.entries(p.drills).every(([id,shots])=>skillDrillById(id)&&count(shots)&&
   shots>=1&&shots<=skillDrillById(id).attempts)))&&
  (p.drillEvents===undefined||(Array.isArray(p.drillEvents)&&p.drillEvents.length<=48&&
   p.drillEvents.every(id=>typeof id==='string'&&id.length>0&&id.length<=128)))&&
  (p.roomMastery===undefined||(p.roomMastery&&typeof p.roomMastery==='object'&&
   !Array.isArray(p.roomMastery)&&Object.entries(p.roomMastery).every(([room,mask])=>
    ['0','1','2','3','4'].includes(room)&&Number.isInteger(mask)&&mask>=0&&mask<=7)))&&
  (p.daily===undefined||(p.daily&&typeof p.daily==='object'&&!Array.isArray(p.daily)&&Object.keys(p.daily).length<=DAILY_LIMIT&&
   Object.entries(p.daily).every(([day,shots])=>DAY_KEY.test(day)&&Number.isSafeInteger(shots)&&shots>=1&&shots<=400)))&&
  (p.circuit===undefined||(p.circuit&&typeof p.circuit==='object'&&Number.isInteger(p.circuit.stage)&&p.circuit.stage>=0&&p.circuit.stage<CIRCUIT.length&&
   Number.isSafeInteger(p.circuit.champion)&&p.circuit.champion>=0&&p.circuit.champion<=999))&&
  validHighlights(p.highlights)&&
  Array.isArray(p.records)&&p.records.length<=RECORD_LIMIT&&
  p.records.every(e=>e&&typeof e.id==='string'&&e.id.length<=128);
}
/** Inject storage as a function so getter errors and restricted browsers are safe. */
export function readLocalProgress(storage=()=>globalThis.localStorage){
 try{
  const store=storage();
  if(!store||typeof store.getItem!=='function')
   return {progress:freshProgress(),writable:false,reason:'unavailable'};
  const raw=store.getItem(PROGRESS_KEY);
  if(raw===null)return {progress:freshProgress(),writable:true,reason:null};
  const parsed=JSON.parse(raw);
  if(parsed?.version!==PROGRESS_VERSION)
   return {progress:freshProgress(),writable:false,reason:'unsupported-version'};
  if(!validProgress(parsed))
   return {progress:freshProgress(),writable:false,reason:'invalid-data'};
  // Existing version-one ledgers predate favorites; safely default only that
  // optional cosmetic field without touching saved match records.
  return {progress:{...parsed,favorites:parsed.favorites||[],drills:parsed.drills||{},
    drillEvents:parsed.drillEvents||[],roomMastery:parsed.roomMastery||{}},writable:true,reason:null};
 }catch{
  return {progress:freshProgress(),writable:false,reason:'unavailable'};
 }
}
export function writeLocalProgress(progress,storage=()=>globalThis.localStorage){
 if(!validProgress(progress))return false;
 try{
  const store=storage();
  if(!store||typeof store.setItem!=='function')return false;
  store.setItem(PROGRESS_KEY,JSON.stringify(progress));
  return true;
 }catch{return false;}
}
/** This counts legal group-ball runs only, not exhibition/test shots or
 * accidental opponent pots. The group's post-shot assignment handles the
 * first valid pot while the table was open.
 */
export function bestLegalRun(history,shooter=0){
 if(!Array.isArray(history))return 0;
 let run=0,best=0;
 for(const ruling of history){
  if(ruling?.kind!=='ruling')continue;
  if(ruling.shooter!==shooter||ruling.result==='foul'||
    ruling.result==='end'&&ruling.reason!=='eight-cleared'){
   run=0;continue;
  }
  const group=ruling.groupAtStart==='open'?
   ruling.groups?.[shooter]||'open':ruling.groupAtStart;
  const pots=(ruling.potRecords||[]).filter(p=>p&&
   groupContains(p.id,group)&&p.id!==8).length;
  run=pots?run+pots:0;
  best=Math.max(best,run);
 }
 return best;
}
/** Caller must pass the actual Game-completed live match ruling. Inputs from
 * exhibitions, replays, unfinished games and drills are intentionally refused.
 * Event ID makes duplicate UI callbacks idempotent while the bounded recent
 * history prevents unlimited localStorage growth.
 */
export function recordLiveMatch(previous,event){
 if(!validProgress(previous)||!event||event.kind!=='match'||event.source!=='live'||
  typeof event.id!=='string'||!event.id||event.id.length>128||
  !Number.isSafeInteger(event.shots)||event.shots<1||event.shots>2000||
  !Number.isSafeInteger(event.winner)||event.winner<0||event.winner>1||
  !Number.isSafeInteger(event.room)||event.room<0||event.room>=64||
  !Number.isSafeInteger(event.bestRun)||event.bestRun<0||event.bestRun>15||
  !FINISH_REASONS.has(event.reason)||
  !['cpu','local'].includes(event.players)||
  (event.players==='cpu'&&!['rookie','club'].includes(event.difficulty))||
  typeof event.at!=='string'||!/^\d{4}-\d\d-\d\dT/.test(event.at))
   return previous;
 if(previous.records.some(record=>record.id===event.id))return previous;
 const clean=event.reason==='eight-cleared',cpu=event.players==='cpu',
  humanWin=cpu&&event.winner===0;
 const achievements=new Set(previous.achievements);
 achievements.add('first-match');
 if(humanWin&&clean)achievements.add('clean-eight');
 if(humanWin&&clean)achievements.add(event.difficulty==='club'?'beat-club':'beat-rookie');
 const compact={id:event.id,at:event.at,players:event.players,
  difficulty:cpu?event.difficulty:null,
  // The named opponent, kept only when it is one of ours (older records have none).
  persona:cpu&&['rookie','dex','vera','club'].includes(event.persona)?event.persona:null,
  // Which game it was, so crests can tell an Official win from a casual one.
  ruleset:['eight','nine','ten','straight','onepocket'].includes(event.ruleset)?event.ruleset:'eight',
  official:Boolean(event.official),
  winner:event.winner,room:event.room,
  shots:event.shots,reason:event.reason,bestRun:event.bestRun};
 return {...previous,matchesPlayed:previous.matchesPlayed+1,
  vsCpuWins:previous.vsCpuWins+(humanWin?1:0),
  vsCpuLosses:previous.vsCpuLosses+(cpu&&!humanWin?1:0),
  localMatches:previous.localMatches+(cpu?0:1),
  cleanWins:previous.cleanWins+(humanWin&&clean?1:0),
  bestRun:Math.max(previous.bestRun,event.bestRun),
  achievements:[...achievements],
  records:[compact,...previous.records].slice(0,RECORD_LIMIT),
  roomMastery:awardRoomMatch(previous,event)};
}
/** A proof of actual settled target-pocket physics, minted by Game.resolve,
 * never by clicking a challenge card, watching the lobby or free Practice.
 * Local achievements are personal convenience, not anti-cheat assertions.
 */
export function recordLiveDrill(previous,event){
 const drill=skillDrillById(event?.drillId);
 if(!validProgress(previous)||!drill||event?.kind!=='drill'||event.source!=='live'||
  event.completed!==true||typeof event.id!=='string'||!event.id||event.id.length>128||
  typeof event.at!=='string'||!/^(19|20)\d\d-\d\d-\d\dT/.test(event.at)||
  !Number.isInteger(event.shots)||event.shots<1||event.shots>drill.attempts)
  return previous;
 const grade=gradeSkillDrill(event.drillId,{shots:event.shots,shot:event.evidence});
 if(grade.status!=='completed'||(previous.drillEvents||[]).includes(event.id))return previous;
 const best=previous.drills?.[drill.id];
 const drills={...(previous.drills||{}),[drill.id]:best?Math.min(best,event.shots):event.shots};
 const achievements=[...new Set([...previous.achievements,'drill-'+drill.id])];
 return {...previous,drills,achievements,
  drillEvents:[event.id,...(previous.drillEvents||[])].slice(0,48),
  roomMastery:awardRoomDrill(previous,event)};
}
export function chooseRoom(previous,room,maxRooms){
 if(!validProgress(previous)||!Number.isInteger(room)||room<0||
  !Number.isInteger(maxRooms)||room>=maxRooms)return previous;
 return previous.selectedRoom===room?previous:{...previous,selectedRoom:room};
}
export function exportLocalProgress(progress){
 return validProgress(progress)?JSON.stringify(progress,null,2):null;
}
export function resetLocalProgress(storage=()=>globalThis.localStorage){
 try{const store=storage();if(!store||typeof store.removeItem!=='function')return false;
  store.removeItem(PROGRESS_KEY);return true;}catch{return false;}
}

/** The local calendar day, as the key the Daily Rack is stored under. */
export function dayKey(date=new Date()){
 const two=n=>String(n).padStart(2,'0');
 return `${date.getFullYear()}-${two(date.getMonth()+1)}-${two(date.getDate())}`;
}
/** Everyone gets the same rack on the same day: a stable seed from the day key. */
export function dailySeed(key){
 let h=2166136261;
 for(const ch of String(key)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
 return h%900000+1;
}
/** Keep the fewest shots a player needed to clear the day's rack (local, private, descriptive only). */
export function recordDaily(previous,{date,shots}={}){
 if(!validProgress(previous)||!DAY_KEY.test(String(date))||!Number.isSafeInteger(shots)||shots<1||shots>400)return previous;
 const daily={...(previous.daily||{})};
 daily[date]=Math.min(daily[date]??Infinity,shots);
 const days=Object.keys(daily).sort();
 for(const old of days.slice(0,Math.max(0,days.length-DAILY_LIMIT)))delete daily[old];
 return {...previous,daily};
}
/** Today's best, how many days in a row ending today (or yesterday) have a cleared rack, and the lifetime count. */
export function dailySummary(progress,today=dayKey()){
 const daily=validProgress(progress)&&progress.daily?progress.daily:{};
 const previousDay=key=>{const [y,m,d]=key.split('-').map(Number);return dayKey(new Date(y,m-1,d-1));};
 let streak=0,cursor=daily[today]!==undefined?today:previousDay(today);
 while(daily[cursor]!==undefined){streak++;cursor=previousDay(cursor);}
 return {today:daily[today]??null,streak,total:Object.keys(daily).length};
}

export function circuitState(progress){
 const c=validProgress(progress)?progress.circuit:undefined;
 return {stage:c?.stage??0,champion:c?.champion??0};
}
export function recordCircuitResult(previous,{stage,won}={}){
 if(!validProgress(previous)||!won)return previous;
 const state=circuitState(previous);
 if(stage!==state.stage)return previous;
 const next=stage+1;
 return {...previous,circuit:next>=CIRCUIT.length?{stage:0,champion:Math.min(999,state.champion+1)}:{stage:next,champion:state.champion}};
}
