/** Compact Web Audio sound language. Never schedules sound until a user gesture
 * unlocks the audio context. Impact loudness is derived from physics events,
 * not FPS or cosmetic cue/table selection.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function impactFor(event){
 if(!event)return null;
 const speed=Number(event.speed)||0;
 if(event.type==='contact'){
  if(speed<18)return null;
  const energy=clamp(speed/1100,0,1);
  return {family:'contact',spacing:.018,frequency:700-270*energy,
   end:220-75*energy,volume:.026+.123*energy,length:.031+.027*energy};
 }
 if(event.type==='rail'){
  if(speed<35)return null;
  const energy=clamp(speed/1150,0,1);
  return {family:'rail',spacing:.028,frequency:event.jaw?270:310,
   end:event.jaw?115:145,volume:.022+.091*energy,length:.042+.052*energy};
 }
 if(event.type==='pocket'){
  return {family:'pocket',spacing:.040,frequency:132,end:52,
   volume:.135,length:.15};
 }
 return null;
}
export class Audio {
 constructor(){this.ctx=null;this.enabled=true;this.lastImpact=Object.create(null);}
 unlock(){
  if(!this.enabled)return;
  if(!this.ctx){
   const C=window.AudioContext||window.webkitAudioContext;
   if(C)this.ctx=new C();
  }
  this.resume();
 }
 resume(){if(this.enabled&&this.ctx?.state==='suspended')this.ctx.resume().catch(()=>{});}
 suspend(){if(this.ctx?.state==='running')this.ctx.suspend().catch(()=>{});}
 tone({frequency=200,end=75,volume=.1,length=.08,wave='triangle',delay=0}){
  if(!this.enabled||!this.ctx||this.ctx.state==='suspended')return;
  const ctx=this.ctx,now=ctx.currentTime+delay,o=ctx.createOscillator(),gain=ctx.createGain();
  o.type=wave;o.frequency.setValueAtTime(Math.max(40,frequency),now);
  o.frequency.exponentialRampToValueAtTime(Math.max(40,end),now+length);
  gain.gain.setValueAtTime(Math.max(.0001,volume),now);
  gain.gain.exponentialRampToValueAtTime(.0001,now+length);
  o.connect(gain).connect(ctx.destination);o.start(now);o.stop(now+length+.012);
 }
 play(event){
  if(!this.ctx||!this.enabled||this.ctx.state==='suspended'||!event)return;
  const p=clamp(Number(event.power)||.5,.08,1);
  if(event.type==='draw'){
   this.tone({frequency:330,end:215,volume:.014,length:.052,wave:'sine'});
   return;
  }
  if(event.type==='tick'){
   // Last-five-seconds shot clock: a quiet, dry click; the last second is a touch higher.
   this.tone({frequency:event.last?980:820,end:event.last?820:700,volume:.03,length:.04,wave:'sine'});
   return;
  }
  if(event.type==='turn'){
   this.tone({frequency:420,end:540,volume:.024,length:.075,wave:'sine'});
   return;
  }
  if(event.type==='foul'){
   this.tone({frequency:205,end:135,volume:.045,length:.16});
   return;
  }
  if(event.type==='win'){
   // Briefly acknowledge the finish without blocking the next-match button.
   this.tone({frequency:330,end:390,volume:.057,length:.16,wave:'sine'});
   this.tone({frequency:440,end:520,volume:.064,length:.22,wave:'sine',delay:.075});
   this.tone({frequency:555,end:660,volume:.054,length:.27,wave:'sine',delay:.15});
   return;
  }
  if(event.type==='loss'){
   this.tone({frequency:280,end:196,volume:.043,length:.16,wave:'sine'});
   this.tone({frequency:210,end:164,volume:.035,length:.2,wave:'sine',delay:.10});
   return;
  }
  if(event.type==='strike'){
   // A felt-tip click followed by a lower wood/body resonance. No extra
   // electrical buzz or long reverb for frequent short pool sessions.
   this.tone({frequency:650+160*p,end:255,volume:.023+.043*p,length:.021,wave:'sine'});
   this.tone({frequency:205-67*p,end:73-15*p,volume:.051+.146*p,length:.079});
   return;
  }
  const hit=impactFor(event);
  if(!hit)return;
  const now=this.ctx.currentTime,last=this.lastImpact[hit.family]??-Infinity;
  if(now-last<hit.spacing)return; // one audible transient per close impact cluster
  this.lastImpact[hit.family]=now;
  this.tone(hit);
  if(hit.family==='contact'&&hit.volume>.09){
   // Hard ball-to-ball collisions receive a crisp, very short upper click.
   this.tone({frequency:hit.frequency*1.7,end:hit.frequency*1.05,
    volume:hit.volume*.26,length:.013,wave:'sine'});
  }
 }
}
