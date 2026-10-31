/* HALL behavior: material sounds, tactile hooks, nameplate, ticking counters.
   All sound is synthesized with WebAudio (no assets), gated on the game's
   own audio.enabled flag. Respects prefers-reduced-motion for animation. */
import {readLocalProgress} from './player-progress.js';
import {recordSummary} from './record-summary.js';
import {cueById} from './cue-catalog.js';
import {halls} from './render.js';

const SHEET_SOUND_IDS=new Set(['setupSheet','clubMenu','settingsSheet','lockerSheet',
  'recordSheet','challengeSheet','guideSheet','onlineSheet','pauseMenu']);
const BRASS_SEL='.sheet-done,.menu-primary,.seg button,.guide-tabs button';
const LIFT_SEL='.menu-item,.cue-card,.challenge-row,.chalk-entry';

function makeSynth(){
  let ctx=null,master=null,noise=null,lastTick=0;
  const fine=matchMedia('(pointer:fine)').matches;
  function ac(){
    if(!ctx){
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)return null;
      ctx=new AC();master=ctx.createGain();master.gain.value=.14;master.connect(ctx.destination);
      const len=ctx.sampleRate|0;noise=ctx.createBuffer(1,len,ctx.sampleRate);
      const d=noise.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    }
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    return ctx;
  }
  function burst({t=0,dur=.05,type='bandpass',freq=2500,q=8,peak=.8,slide=0}){
    const c=ac();if(!c)return;const t0=c.currentTime+t;
    const src=c.createBufferSource();src.buffer=noise;src.loop=true;
    const f=c.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
    if(slide)f.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),t0+dur);
    const g=c.createGain();g.gain.setValueAtTime(0,t0);
    g.gain.linearRampToValueAtTime(peak,t0+.004);
    g.gain.exponentialRampToValueAtTime(.0008,t0+dur);
    src.connect(f);f.connect(g);g.connect(master);src.start(t0);src.stop(t0+dur+.05);
  }
  function tone({t=0,dur=.2,freq=440,freqEnd=0,type='sine',peak=.5}){
    const c=ac();if(!c)return;const t0=c.currentTime+t;
    const o=c.createOscillator();o.type=type;
    o.frequency.setValueAtTime(freq*(0.96+Math.random()*.08),t0);
    if(freqEnd)o.frequency.exponentialRampToValueAtTime(freqEnd,t0+dur);
    const g=c.createGain();g.gain.setValueAtTime(0,t0);
    g.gain.linearRampToValueAtTime(peak,t0+.005);
    g.gain.exponentialRampToValueAtTime(.0008,t0+dur);
    o.connect(g);g.connect(master);o.start(t0);o.stop(t0+dur+.05);
  }
  return {
    unlock(){ac();},
    chalkTick(){
      const now=performance.now();if(now-lastTick<70)return;lastTick=now;
      burst({dur:.035,freq:2800,q:9,peak:.5});
    },
    brassClink(){
      tone({dur:.22,freq:2093,type:'triangle',peak:.4});
      tone({dur:.16,freq:2960,type:'sine',peak:.25});
      tone({dur:.1,freq:4186,type:'sine',peak:.12});
    },
    woodKnock(){
      tone({dur:.09,freq:165,freqEnd:95,type:'sine',peak:.7});
      burst({dur:.05,type:'lowpass',freq:900,peak:.35});
    },
    rackClack(){
      burst({dur:.06,type:'highpass',freq:1400,peak:.7});
      tone({t:.015,dur:.14,freq:740,freqEnd:520,type:'triangle',peak:.4});
      burst({t:.03,dur:.05,type:'highpass',freq:1800,peak:.4});
    },
    feltThunk(){burst({dur:.07,type:'lowpass',freq:170,peak:.6});},
    get fine(){return fine;}
  };
}

function animateCount(el,to,dur=650){
  if(!el)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce||!Number.isFinite(to)){el.textContent=String(to);return;}
  const t0=performance.now();
  (function frame(now){
    const p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3);
    el.textContent=String(Math.round(to*e));
    if(p<1)requestAnimationFrame(frame);
  })(t0);
}

function progress(){
  try{return readLocalProgress().progress||{};}catch{return {};}
}

export function initHall({isEnabled}){
  const s=makeSynth();
  const on=()=>{try{return !!isEnabled();}catch{return true;}};
  const play=fn=>{if(on()){try{fn();}catch{}}};

  // unlock audio on first gesture
  const unlock=()=>{s.unlock();window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);};
  window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);

  // hover: chalk tick on anything liftable (fine pointers only)
  document.addEventListener('pointerover',e=>{
    if(!s.fine||!on())return;
    if(e.target.closest(BRASS_SEL+','+LIFT_SEL))play(()=>s.chalkTick());
  },{passive:true});

  // press: brass clink on confirms, felt thunk on backs-outs
  document.addEventListener('pointerdown',e=>{
    if(!on())return;
    const t=e.target;
    if(t.closest('.sheet-done,.menu-primary'))play(()=>s.brassClink());
    else if(t.closest('.sheet-x,.menu-item.danger'))play(()=>s.feltThunk());
  },{capture:true,passive:true});

  // Escape backs out with a thunk when a sheet is open
  window.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||!on())return;
    if(document.querySelector('.club-sheet:not([hidden])'))play(()=>s.feltThunk());
  });

  function renderNameplate(){
    const p=progress(),sum=recordSummary(p);
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    set('hallRec',sum.wins+'–'+sum.losses);
    set('hallMatches',sum.matches+(sum.matches===1?' MATCH':' MATCHES'));
    try{const cue=cueById(p.selectedCue);if(cue)set('hallCue',String(cue.name||'').toUpperCase());}catch{}
    try{const r=halls[p.selectedRoom||0];if(r)set('hallRoom',String(r.name||'').toUpperCase());}catch{}
  }

  function tickRecord(){
    const p=progress(),sum=recordSummary(p);
    animateCount(document.getElementById('recordMatches'),sum.matches);
    animateCount(document.getElementById('recordClean'),sum.clean);
    animateCount(document.getElementById('recordRun'),sum.run);
    const rv=document.getElementById('recordRivals');
    if(rv){ // "W / L" pair
      const w=document.createElement('b'),l=document.createElement('b');
      rv.replaceChildren(w,document.createTextNode(' / '),l);
      animateCount(w,sum.wins);animateCount(l,sum.losses);
    }
    const dr=document.getElementById('recordDrills');
    if(dr){
      const m=/^(\d+)\s*\/\s*(\d+)/.exec(dr.textContent||'');
      if(m){
        const n=document.createElement('b');
        dr.replaceChildren(n,document.createTextNode(' / '+m[2]));
        animateCount(n,parseInt(m[1],10));
      }
    }
  }

  return {
    onShow(id){
      if(SHEET_SOUND_IDS.has(id))play(()=>s.woodKnock());
      if(id==='recordSheet')tickRecord();
      if(id==='clubMenu')renderNameplate();
    },
    rack(){play(()=>s.rackClack());},
    clink(){play(()=>s.brassClink());},
    refreshNameplate:renderNameplate
  };
}
