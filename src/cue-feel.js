/** Shared cue geometry: rendering and pointer acquisition must agree. */
export const clamp01=n=>Math.min(1,Math.max(0,Number(n)||0));
export const easeOutCubic=t=>1-(1-clamp01(t))**3;
// Deliberately generous visual travel: power should be readable at a glance.
export const cueDrawback=charge=>168*(.17*clamp01(charge)+.83*clamp01(charge)**1.15);
export function cueGeometry(cue,angle,charge=0){
 const dx=Math.cos(angle),dy=Math.sin(angle);
 const gap=18+cueDrawback(charge),reach=gap+355;
 const point=distance=>({x:cue.x-dx*distance,y:cue.y-dy*distance});
 return {tip:point(gap),grip:point(reach-110),butt:point(reach),gap,reach};
}
// A short, forceful 115 ms stroke. Starts at full draw then accelerates
// through contact rather than linearly gliding back to the cue ball.
export function strokeCharge(progress,power){
 const t=clamp01(progress);
 return t>=.76?0:clamp01(power)*(1-easeOutCubic(t/.76));
}
export function tensionStage(power){
 const p=clamp01(power);
 return p>=.96?4:p>=.75?3:p>=.5?2:p>=.25?1:0;
}
