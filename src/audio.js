/** Restrained billiards audio: a little mechanical tension, followed by
 * two short contact transients. Each note is scheduled independently of FPS.
 */
export class Audio {
 constructor(){this.ctx=null;this.enabled=true;}
 unlock(){
  if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(C)this.ctx=new C();}
  this.ctx?.resume();
 }
 tone({frequency=200,end=75,volume=.1,length=.08,wave='triangle',delay=0}){
  if(!this.enabled||!this.ctx)return;
  const ctx=this.ctx,now=ctx.currentTime+delay,o=ctx.createOscillator(),gain=ctx.createGain();
  o.type=wave;o.frequency.setValueAtTime(Math.max(40,frequency),now);
  o.frequency.exponentialRampToValueAtTime(Math.max(40,end),now+length);
  gain.gain.setValueAtTime(Math.max(.0001,volume),now);
  gain.gain.exponentialRampToValueAtTime(.0001,now+length);
  o.connect(gain).connect(ctx.destination);o.start(now);o.stop(now+length+.012);
 }
 play(event){
  if(!this.ctx||!this.enabled)return;
  const p=Math.min(1,Math.max(.08,Number(event.power)||.5));
  if(event.type==='draw'){
   this.tone({frequency:330,end:215,volume:.017,length:.055,wave:'sine'});
   return;
  }
  if(event.type==='strike'){
   this.tone({frequency:207-p*73,end:76-p*19,volume:.052+.17*p,length:.081,wave:'triangle'});
   this.tone({frequency:620+p*190,end:270,volume:.027+.038*p,length:.021,wave:'sine'});
   return;
  }
  if(event.type==='contact'&&event.speed<18)return;
  if(event.type==='rail'&&event.speed<35)return;
  const pitch=event.type==='pocket'?95:event.type==='rail'?260:460;
  const volume=event.type==='pocket'?.20:Math.min(.24,(event.speed||400)/2300);
  this.tone({frequency:pitch,end:Math.max(40,pitch*.36),volume,length:event.type==='pocket'?.18:.075});
 }
}
