export class Audio {
 constructor(){this.ctx=null;this.enabled=true;this.last=0;}
 unlock(){if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(C)this.ctx=new C();}this.ctx?.resume();}
 play(event){if(!this.ctx||!this.enabled)return;const now=this.ctx.currentTime;
  if(event.type==='contact'&&event.speed<18)return;
  if(event.type==='rail'&&event.speed<35)return;
  const pitch=event.type==='pocket'?95:event.type==='rail'?260: event.type==='strike'?170:460;
  const volume=event.type==='pocket'?.20:Math.min(.24,(event.speed||400)/2300);
  const o=this.ctx.createOscillator(),gain=this.ctx.createGain();o.type='triangle';o.frequency.setValueAtTime(pitch,now);o.frequency.exponentialRampToValueAtTime(Math.max(40,pitch*.36),now+.08);
  gain.gain.setValueAtTime(Math.max(.001,volume),now);gain.gain.exponentialRampToValueAtTime(.001,now+(event.type==='pocket'?.18:.075));o.connect(gain).connect(this.ctx.destination);o.start();o.stop(now+.20);}
}
