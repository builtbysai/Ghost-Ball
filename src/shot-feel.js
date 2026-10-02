/** Shared, DOM-independent stroke geometry. Physics power remains unchanged. */
export const clamp01=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
export function cueGeometry(radius,drawback=0){
 const t=clamp01(drawback);
 const gap=radius*1.5+142*Math.pow(t,.88);
 return {gap,reach:gap+355,grip:gap+243};
}
export function tensionStage(p){const n=clamp01(p);return n>=.82?3:n>=.55?2:n>=.27?1:0;}
export function strokeOffset(progress,power=0.5){
 const t=clamp01(progress);
 // Fast forward stroke into the ball, then rebound and disappear.
 if(t<.39)return (142*Math.pow(clamp01(power),.88)+8)*Math.pow(t/.39,1.8);
 return (142*Math.pow(clamp01(power),.88)+8)*Math.exp(-(t-.39)*10);
}
