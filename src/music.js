/** Generative lounge music: no audio files, nothing to download. A slow jazz-club
 * loop (electric piano chords, a walking bass, brushed hats) whose key and tempo follow
 * the hall. Pure scheduling maths is exported for tests; the Web Audio part is
 * only created after a user gesture. Quiet by design: it sits under the click of the balls. */
export const HALL_MUSIC=Object.freeze([
 {name:'Parlor',bpm:66,root:53,mode:'major',swing:.2,wave:'triangle'},      // F, warm jazz
 {name:'Observatory',bpm:58,root:50,mode:'dorian',swing:.08,wave:'sine'},    // D, spacious
 {name:'Foundry',bpm:76,root:45,mode:'blues',swing:.28,wave:'triangle'},      // A, slow blues
 {name:'Wintergarden',bpm:84,root:55,mode:'major',swing:.12,wave:'sine'},     // G, light
 {name:'Afterhours',bpm:72,root:57,mode:'minor',swing:.16,wave:'sawtooth'}    // A, late night
]);
// Chord loops as [semitone offset from root, quality]. Eight bars: ii-V-I-vi turnaround feel.
const LOOPS={
 major:[[2,'m7'],[7,'7'],[0,'maj7'],[9,'m7'],[2,'m7'],[7,'7'],[0,'maj7'],[5,'maj7']],
 dorian:[[0,'m7'],[5,'7'],[0,'m7'],[10,'maj7'],[0,'m7'],[5,'7'],[3,'maj7'],[7,'m7']],
 blues:[[0,'7'],[0,'7'],[5,'7'],[0,'7'],[7,'7'],[5,'7'],[0,'7'],[7,'7']],
 minor:[[0,'m7'],[8,'maj7'],[3,'maj7'],[10,'7'],[0,'m7'],[5,'m7'],[8,'maj7'],[7,'7']]
};
const QUALITY={maj7:[0,4,7,11],m7:[0,3,7,10],'7':[0,4,7,10]};
export const midiHz=n=>440*2**((n-69)/12);
/** Voicing for a chord: root-position tones shifted into a comfortable mid register. */
export function chordNotes(root,offset,quality){
 const base=root+offset+12;
 return QUALITY[quality].map(step=>base+step);
}
/** The note events for one bar of `beats` quarter-notes at the given hall, deterministic per bar index. */
export function barPlan(hall,bar){
 const loop=LOOPS[hall.mode],[offset,quality]=loop[((bar%loop.length)+loop.length)%loop.length];
 const notes=chordNotes(hall.root,offset,quality),bassRoot=hall.root+offset-12;
 const beat=60/hall.bpm,events=[];
 // Rhodes chord stabs on 1 and the "and" of 2 (swung), spread slightly like a hand.
 notes.forEach((n,i)=>events.push({kind:'keys',at:i*.018,note:n,len:beat*1.7,vel:.8-i*.06}));
 notes.slice(1).forEach((n,i)=>events.push({kind:'keys',at:beat*(1.5+hall.swing)+i*.015,note:n,len:beat*1.1,vel:.5}));
 // Walking bass: root, fifth/third, approach, back.
 const walk=[0,quality==='m7'?3:4,7,quality==='7'?10:9];
 walk.forEach((step,i)=>events.push({kind:'bass',at:i*beat,note:bassRoot+step%12,len:beat*.9,vel:.9}));
 // Brushes: soft hats on 2 and 4 plus a shuffled ghost note.
 events.push({kind:'brush',at:beat,vel:.7},{kind:'brush',at:beat*3,vel:.7},{kind:'brush',at:beat*(2+hall.swing),vel:.28});
 // A sparse melody note now and then keeps it alive without being a tune.
 if(bar%2===1)events.push({kind:'lead',at:beat*(2.5+hall.swing),note:notes[(bar*3)%notes.length]+(notes[(bar*3)%notes.length]>78?0:12),len:beat*1.4,vel:.45});
 return {events,bar:beat*4};
}
export class Music{
 constructor(){this.ctx=null;this.master=null;this.timer=null;this.hall=0;this.bar=0;this.nextAt=0;this.enabled=true;this.level=.5;this.noise=null;}
 attach(ctx){
  if(this.ctx||!ctx)return;this.ctx=ctx;
  this.master=ctx.createGain();this.master.gain.value=0;
  const room=ctx.createBiquadFilter();room.type='lowpass';room.frequency.value=2600;
  this.master.connect(room).connect(ctx.destination);
  const len=ctx.sampleRate*1;this.noise=ctx.createBuffer(1,len,ctx.sampleRate);
  const data=this.noise.getChannelData(0);for(let i=0;i<len;i++)data[i]=Math.random()*2-1;
 }
 setHall(index){const next=Math.max(0,Math.min(HALL_MUSIC.length-1,index|0));if(next!==this.hall){this.hall=next;this.bar=0;}}
 start(){
  if(!this.ctx||!this.enabled||this.timer)return;
  this.nextAt=this.ctx.currentTime+.15;
  this.master.gain.cancelScheduledValues(this.ctx.currentTime);
  this.master.gain.linearRampToValueAtTime(.16*this.level,this.ctx.currentTime+2.5);
  this.timer=setInterval(()=>this.pump(),400);
 }
 stop(){
  if(this.timer){clearInterval(this.timer);this.timer=null;}
  if(this.ctx&&this.master){const t=this.ctx.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setTargetAtTime(0,t,.25);}
 }
 pump(){
  if(!this.ctx||this.ctx.state!=='running')return;
  const hall=HALL_MUSIC[this.hall];
  while(this.nextAt<this.ctx.currentTime+1.6){
   const plan=barPlan(hall,this.bar++);
   for(const e of plan.events)this.voice(e,this.nextAt+e.at,hall);
   this.nextAt+=plan.bar;
  }
 }
 env(gain,t,peak,attack,length){gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),t+attack);gain.gain.exponentialRampToValueAtTime(.0001,t+length);}
 voice(e,t,hall){
  const ctx=this.ctx,out=this.master;
  if(e.kind==='brush'){
   const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
   src.buffer=this.noise;f.type='highpass';f.frequency.value=5200;
   this.env(g,t,.06*e.vel,.004,.09);src.connect(f).connect(g).connect(out);src.start(t,Math.random()*.5,.12);return;
  }
  const hz=midiHz(e.note),o=ctx.createOscillator(),g=ctx.createGain();
  if(e.kind==='bass'){o.type='sine';o.frequency.value=hz;this.env(g,t,.2*e.vel,.012,e.len);}
  else if(e.kind==='lead'){o.type='sine';o.frequency.value=hz;this.env(g,t,.06*e.vel,.02,e.len);}
  else{ // electric piano: a soft tine over a body, with a little tremolo
   o.type=hall.wave;o.frequency.value=hz;this.env(g,t,.075*e.vel,.006,e.len);
   const tine=ctx.createOscillator(),tg=ctx.createGain();tine.type='sine';tine.frequency.value=hz*4;
   this.env(tg,t,.012*e.vel,.002,.22);tine.connect(tg).connect(out);tine.start(t);tine.stop(t+.3);
  }
  o.connect(g).connect(out);o.start(t);o.stop(t+e.len+.05);
 }
}
