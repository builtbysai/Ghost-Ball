/** Crests: quiet, descriptive marks for things the player has actually done. Computed from the
 * local record every time, never stored, never time-limited and never a reason to come back. */
import {circuitState,dailySummary} from './player-progress.js';
import {SKILL_DRILLS} from './skill-drills.js';

const wonAs=(progress,test)=>(progress.records||[]).some(r=>r.players==='cpu'&&r.winner===0&&test(r));
export const CRESTS=Object.freeze([
 {id:'first-match',name:'First Rack',hint:'Finish a match',test:p=>p.matchesPlayed>=1},
 {id:'ten-matches',name:'Regular',hint:'Finish ten matches',test:p=>p.matchesPlayed>=10},
 {id:'run-5',name:'Run of Five',hint:'Pot five balls in one visit',test:p=>p.bestRun>=5},
 {id:'official',name:'By the Book',hint:'Win an Official 8-ball match',test:p=>wonAs(p,r=>r.official)},
 {id:'nine',name:'Nine on the Wire',hint:'Win a 9-ball match',test:p=>wonAs(p,r=>r.ruleset==='nine')},
 {id:'ten',name:'Called It',hint:'Win a 10-ball match',test:p=>wonAs(p,r=>r.ruleset==='ten')},
 {id:'straight',name:'Straight Shooter',hint:'Win a straight-pool race',test:p=>wonAs(p,r=>r.ruleset==='straight')},
 {id:'onepocket',name:'Patience',hint:'Win a game of one-pocket',test:p=>wonAs(p,r=>r.ruleset==='onepocket')},
 {id:'vera',name:'Safe Passage',hint:'Beat Vera',test:p=>wonAs(p,r=>r.persona==='vera')},
 {id:'dex',name:'Cool Under Fire',hint:'Beat Dex',test:p=>wonAs(p,r=>r.persona==='dex')},
 {id:'circuit',name:'Circuit Champion',hint:'Win the Club Circuit',test:p=>circuitState(p).champion>=1},
 {id:'daily-3',name:'Three Days Running',hint:'Clear the Daily Rack three days in a row',test:p=>dailySummary(p).streak>=3||Object.keys(p.daily||{}).length>=3},
 {id:'reel',name:'Highlight Reel',hint:'Save a three-ball highlight',test:p=>(p.highlights||[]).some(h=>h.pots>=3)},
 {id:'drills',name:'Skilled',hint:'Complete every skill drill',test:p=>Object.keys(p.drills||{}).length>=SKILL_DRILLS.length}
]);
export function crestSummary(progress){
 const list=CRESTS.map(c=>({id:c.id,name:c.name,hint:c.hint,earned:Boolean(progress&&c.test(progress))}));
 return {earned:list.filter(c=>c.earned).length,total:list.length,list};
}
