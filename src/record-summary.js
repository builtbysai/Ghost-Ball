/** Read-only presentation of real local results. No analytics or network. */
export function recordSummary(progress,maximum=3){
 const count=(value)=>Number.isSafeInteger(value)&&value>=0?value:0;
 const reasonLabel={'eight-cleared':'LEGAL 8','early-eight':'EARLY 8',
  'scratch-on-eight':'8 SCRATCH','wrong-ball-first':'WRONG FIRST','wrong-pocket':'WRONG POCKET'};
 const records=Array.isArray(progress?.records)?progress.records:[];
 return {
  matches:count(progress?.matchesPlayed),wins:count(progress?.vsCpuWins),
  losses:count(progress?.vsCpuLosses),local:count(progress?.localMatches),
  clean:count(progress?.cleanWins),run:count(progress?.bestRun),
  recent:records.slice(0,Math.max(0,Math.min(3,maximum))).map(entry=>{
   const cpu=entry.players==='cpu',win=cpu?entry.winner===0:entry.winner===0;
   return {
    title:cpu?(win?'WIN':'LOSS'):`P${win?1:2} WON`,
    opponent:cpu?(entry.difficulty==='club'?'CLUB PRO':'ROOKIE'):'LOCAL',
    detail:reasonLabel[entry.reason]||'MATCH',
    shots:count(entry.shots)
   };
  })
 };
}
