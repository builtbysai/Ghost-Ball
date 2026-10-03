/** Short-lived material feedback derived from physics events, never a force. */
export function impactEffectFor(event,sim){
 if(!event||!Array.isArray(sim?.balls)||!Number.isFinite(event.speed))return null;
 if(event.type==='contact'&&event.speed>=160){
  const a=sim.balls.find(ball=>ball.id===event.a&&!ball.pocketed);
  const b=sim.balls.find(ball=>ball.id===event.b&&!ball.pocketed);
  if(!a||!b)return null;
  return {type:'impact',x:(a.x+b.x)/2,y:(a.y+b.y)/2,
   strength:Math.min(1,event.speed/1250),life:1};
 }
 if(event.type==='rail'&&event.speed>=250&&!event.jaw){
  const ball=sim.balls.find(b=>b.id===event.id&&!b.pocketed);
  if(!ball)return null;
  return {type:'cushion',x:ball.x,y:ball.y,
   strength:Math.min(1,event.speed/1400),life:1};
 }
 return null;
}
