/** Cosmetic-only cue catalog. No stat modifiers, random drops or time gates.
 * Unlock conditions are IDs from actual committed live-match milestones.
 * The renderer uses the same colors as the locker preview.
 */
export const CUES=Object.freeze([
 {id:'house',name:'House Maple',description:'Warm maple, linen wrap, ivory ferrule.',
  requirement:null,earn:'Ready to play',butt:'#704222',wrap:'#38261d',
  shaft:'#e5c494',metal:'#d9c7a0',tip:'#9ab7bc',accent:'#c9a56d'},
 {id:'smoke',name:'Smoke',description:'Charred walnut and graphite linen.',
  requirement:null,earn:'Ready to play',butt:'#312f30',wrap:'#15191d',
  shaft:'#cebca3',metal:'#adb7b2',tip:'#87aebf',accent:'#9caaa5'},
 {id:'copperline',name:'Copperline',description:'Copper rings on dark chestnut.',
  requirement:'first-match',earn:'Finish one real match',butt:'#51352a',wrap:'#251e20',
  shaft:'#e1ba8f',metal:'#d5a06f',tip:'#94b7c8',accent:'#de9262'},
 {id:'juniper',name:'Juniper',description:'Green wrap and pale maple.',
  requirement:'beat-rookie',earn:'Beat Rookie in casual 8-ball',butt:'#3a5244',wrap:'#19392e',
  shaft:'#ebd8ab',metal:'#b3c4a5',tip:'#81b6ba',accent:'#82aa7c'},
 {id:'slate',name:'Slate',description:'Slate blue with a satin nickel band.',
  requirement:'clean-eight',earn:'Win with a legal 8-ball finish',butt:'#384d65',wrap:'#202f43',
  shaft:'#d4cfbf',metal:'#dbe2da',tip:'#8cacb5',accent:'#9bb4c7'},
 {id:'nightfall',name:'Nightfall',description:'Ink-black grip and muted gold.',
  requirement:'beat-club',earn:'Beat Club Pro with a legal 8-ball finish',
  butt:'#24242b',wrap:'#101116',shaft:'#d9c49d',metal:'#e3c481',
  tip:'#82bdc1',accent:'#bb9b55'}
].map(cue=>Object.freeze(cue)));
export const cueById=id=>CUES.find(cue=>cue.id===id)||CUES[0];
export const cueUnlocked=(progress,cue)=>Boolean(cue)&&
 (!cue.requirement||progress?.achievements?.includes(cue.requirement));
export function equippedCue(progress){
 const cue=CUES.find(c=>c.id===progress?.selectedCue)||CUES[0];
 return cueUnlocked(progress,cue)?cue:CUES[0];
}
export function equipCue(progress,id){
 const cue=CUES.find(c=>c.id===id);
 return cueUnlocked(progress,cue)&&progress.selectedCue!==id
  ?{...progress,selectedCue:id}:progress;
}
export function toggleFavorite(progress,id){
 const cue=CUES.find(c=>c.id===id);
 if(!cueUnlocked(progress,cue))return progress;
 const favorites=(progress.favorites||[]).filter(key=>CUES.some(item=>item.id===key));
 return {...progress,favorites:favorites.includes(id)?
  favorites.filter(key=>key!==id):[...favorites,id].slice(0,CUES.length)};
}
/** Purpose-built static full-shaft preview, not a fictitious ability meter. */
export function paintCuePreview(canvas,cue){
 const g=canvas?.getContext?.('2d');
 if(!g)return;
 const w=canvas.width,h=canvas.height;
 g.clearRect(0,0,w,h);g.save();g.lineCap='round';
 const a={x:w*.11,y:h*.73},b={x:w*.91,y:h*.29};
 const interp=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 const seg=(from,to,width,color)=>{
  const p=interp(from),q=interp(to);
  g.beginPath();g.moveTo(p.x,p.y);g.lineTo(q.x,q.y);
  g.lineWidth=width;g.strokeStyle=color;g.stroke();
 };
 g.shadowColor='#000b';g.shadowBlur=14;g.shadowOffsetY=6;
 seg(0,1,17,cue.butt);g.shadowBlur=0;g.shadowOffsetY=0;
 seg(.03,.33,14,cue.wrap);
 seg(.03,.045,19,cue.accent);seg(.34,.35,17,cue.metal);
 seg(.36,.90,11,cue.shaft);seg(.91,.975,8,'#eee5cf');
 seg(.976,.992,8,cue.metal);seg(.992,1,7,cue.tip);
 // Narrow hand-crafted grip and ring details read at phone sizes.
 for(const t of [.08,.13,.18,.23,.28])seg(t,t+.006,15,cue.accent);
 seg(.36,.88,2,'#fff9da5c');
 g.restore();
}
