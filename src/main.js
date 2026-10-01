import {Game} from './game.js';
import {TableRenderer,halls} from './render.js';
import {TABLE} from './physics.js';
import {Audio} from './audio.js';
const $=id=>document.getElementById(id);
const all=(query)=>[...document.querySelectorAll(query)];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let room=0,mode='match',rival='rookie',view='perspective',english=0,angle=0,power=.50;
let current=null,active='lobby',motion=true,spinTouched=false,started=false;
let attract=new Game({kind:'attract'}),audio=new Audio();
let ambient=new TableRenderer($('attractCanvas'),{view:'perspective'}),table=new TableRenderer($('gameCanvas'),{view});
const setText=(id,value)=>{$(id).textContent=value;};
function notify(message){if(message)setText('status',message);}
function applyRoom(){const h=halls[room];ambient.setHall(room);table.setHall(room);
  document.documentElement.style.setProperty('--hall',h.felt);setText('roomEyebrow',`ROOM 0${room+1} · ESTABLISHED ${h.year}`);
  setText('roomName',h.name);setText('roomDescription',h.detail);setText('roomCount',`0${room+1} / 0${halls.length}`);
  setText('playText',mode==='practice'?`Practice at ${h.name}`:`Break at ${h.name}`);
  if(current)setText('roundLabel',`${h.name.toUpperCase()} · ${current.kind==='practice'?'PRACTICE':'CASUAL 8-BALL'}`);
}
function chooseView(next){view=next;table.setView(view);ambient.setView(view);
  all('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===view);b.setAttribute('aria-pressed',b.dataset.view===view?'true':'false');});
  setText('gameView',view==='flat'?'2.5D VIEW':'2D VIEW');
  resize();}
function show(id){$(id).hidden=false;}function hide(id){$(id).hidden=true;}
function openSetup(){$('rivals').closest('.setting').hidden=mode==='practice';show('backdrop');show('setupSheet');$('closeSetup').focus();}
function closeSetup(){hide('setupSheet');if($('settingsSheet').hidden)hide('backdrop');$('openSetup').focus();}
function openSettings(){hide('clubMenu');hide('setupSheet');show('backdrop');show('settingsSheet');$('soundToggle').checked=audio.enabled;$('motionToggle').checked=motion;}
function closeSettings(){hide('settingsSheet');hide('backdrop');}
function openMenu(){show('clubMenu');$('closeMenu').focus();}
function refreshMenu(){setText('matchSummary',mode==='practice'?'Open practice table':rival==='local'?'8-Ball · Two players':`8-Ball vs ${rival==='rookie'?'Rookie':'Club Pro'}`);
  setText('playSubtitle',mode==='practice'?'FREE PLAY · EXPLORE THE ANGLES':'CASUAL 8-BALL · NO ENTRY FEE');
  all('.mode[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));}
function resize(){ambient.resize();table.resize();}
function turnUI(){if(!current)return;const ai=current.isAI(),busy=current.sim.moving;
  setText('turnLabel',current.over?'RACK COMPLETE':current.kind==='practice'?'PRACTICE TABLE':current.kind==='attract'?'AI EXHIBITION':current.break?'THE BREAK':current.turn===0?'YOUR SHOT':current.players==='local'?'PLAYER TWO':'ROOKIE AT THE TABLE');
  const p1=current.groups[0]?.toUpperCase()||'OPEN TABLE',p2=current.groups[1]?.toUpperCase()||'OPEN TABLE';
  $('playerOne').innerHTML=`${current.kind==='attract'?'CLUB PRO':'PLAYER ONE'} <small>${p1}</small>`;
  $('playerTwo').innerHTML=`${current.kind==='attract'?'ROOKIE':current.players==='local'?'PLAYER TWO':'ROOKIE'} <small>${p2}</small>`;
  const canPlay=!current.over&&!busy&&!ai;
  $('shootBtn').disabled=!canPlay||current.ballInHand;
  $('powerRange').disabled=!canPlay||current.ballInHand;
  $('aimRange').disabled=!canPlay||current.ballInHand;
  setText('guideBadge',current.ballInHand?'TAP TO PLACE CUE BALL':ai?'WATCH THE SHOT':canPlay?'DRAG ANYWHERE TO AIM':'BALLS IN MOTION');
  $('guideBadge').style.opacity=busy?'0':'.85';
}
function begin(kind){hide('clubMenu');hide('setupSheet');hide('settingsSheet');hide('backdrop');
  current=new Game({kind,players:rival==='local'?'local':'cpu',difficulty:rival==='club'?'club':'rookie',notify});
  if(kind==='attract'){current.turn=0;setText('status','An exhibition between our house rivals.');}
  active='game';show('gameScreen');$('lobby').setAttribute('aria-hidden','true');
  chooseView(view);applyRoom();turnUI();resize();}
function exit(){active='lobby';current=null;hide('gameScreen');$('lobby').removeAttribute('aria-hidden');resize();}
function aimAt(clientX,clientY){if(!current||current.isAI()||current.over||current.sim.moving)return;
  const rect=$('gameCanvas').getBoundingClientRect(),pt=table.unproject(clientX-rect.left,clientY-rect.top);
  if(current.ballInHand){if(current.placeCue(pt.x,pt.y))turnUI();return;}
  const cue=current.sim.cue();if(!cue||cue.pocketed)return;
  const dx=pt.x-cue.x,dy=pt.y-cue.y;if(dx*dx+dy*dy<250)return;
  angle=Math.atan2(dy,dx);syncAim();}
function syncAim(){const deg=angle*180/Math.PI;$('aimRange').value=String(deg);}
function fire(){if(!current||current.isAI()||current.ballInHand||current.over)return;
  audio.unlock();if(current.beginShot(angle,power,english)){
    started=true;if(motion)navigator.vibrate?.(Math.round(4+power*12));audio.play({type:'strike',power});turnUI();}}
function setPower(n){power=clamp(Number(n)/100,.08,1);$('powerRange').value=Math.round(power*100);setText('powerValue',`${Math.round(power*100)}%`);}
$('menuBtn').onclick=openMenu;$('closeMenu').onclick=()=>hide('clubMenu');
$('menuPractice').onclick=()=>begin('practice');$('menuSettings').onclick=openSettings;
$('closeSettings').onclick=closeSettings;
$('soundToggle').onchange=event=>{audio.enabled=event.target.checked;localStorage.setItem('ghostball-sound',audio.enabled?'on':'off');};
$('motionToggle').onchange=event=>{motion=event.target.checked;localStorage.setItem('ghostball-motion',motion?'on':'off');};
$('openSetup').onclick=openSetup;$('closeSetup').onclick=closeSetup;$('backdrop').onclick=()=>{closeSetup();closeSettings();};
$('prevRoom').onclick=()=>{room=(room-1+halls.length)%halls.length;applyRoom();};
$('nextRoom').onclick=()=>{room=(room+1)%halls.length;applyRoom();};
all('.mode[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;refreshMenu();applyRoom();});
all('#rivals [data-rival]').forEach(b=>b.onclick=()=>{rival=b.dataset.rival;all('#rivals button').forEach(n=>n.classList.toggle('selected',n===b));refreshMenu();});
all('[data-view]').forEach(b=>b.onclick=()=>{chooseView(b.dataset.view);localStorage.setItem('ghostball-view',view);});
$('playBtn').onclick=()=>begin(mode);$('watchBtn').onclick=()=>begin('attract');
$('leaveGame').onclick=exit;$('rerack').onclick=()=>{current?.reset();turnUI();};
$('gameView').onclick=()=>chooseView(view==='flat'?'perspective':'flat');
$('aimLeft').onclick=()=>{angle-=Math.PI/720;syncAim();};
$('aimRight').onclick=()=>{angle+=Math.PI/720;syncAim();};
$('aimRange').oninput=e=>{angle=Number(e.target.value)*Math.PI/180;};
$('spin').oninput=e=>{english=Number(e.target.value)/100;setText('spinLabel',english===0?'CENTER':english<0?`${Math.abs(Math.round(english*100))}% LEFT`:`${Math.round(english*100)}% RIGHT`);spinTouched=true;};
$('powerRange').oninput=e=>setPower(e.target.value);
// Pull back and release is optional; the explicit Take Shot button is always available.
let pulled=false,startPower=0;
$('powerRange').addEventListener('pointerdown',()=>{pulled=true;startPower=power;audio.unlock();});
$('powerRange').addEventListener('pointerup',()=>{if(pulled&&Math.abs(power-startPower)>.09)fire();pulled=false;});
$('powerRange').addEventListener('pointercancel',()=>{pulled=false;});
$('shootBtn').onclick=fire;
let pointerId=null;
$('gameCanvas').addEventListener('pointerdown',e=>{if(active!=='game')return;pointerId=e.pointerId;$('gameCanvas').setPointerCapture?.(pointerId);aimAt(e.clientX,e.clientY);audio.unlock();});
$('gameCanvas').addEventListener('pointermove',e=>{if(e.pointerId===pointerId)aimAt(e.clientX,e.clientY);});
for(const type of ['pointerup','pointercancel'])$('gameCanvas').addEventListener(type,e=>{if(e.pointerId===pointerId)pointerId=null;});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('settingsSheet').hidden)closeSettings();else if(!$('setupSheet').hidden)closeSetup();else if(!$('clubMenu').hidden)hide('clubMenu');else if(active==='game')exit();return;}
  if(active!=='game'||['INPUT','BUTTON','TEXTAREA'].includes(document.activeElement?.tagName)&&document.activeElement?.type==='range')return;
  if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a'){angle-=Math.PI/720;syncAim();e.preventDefault();}
  if(e.key==='ArrowRight'||e.key.toLowerCase()==='d'){angle+=Math.PI/720;syncAim();e.preventDefault();}
  if(e.code==='Space'){e.preventDefault();fire();}
  if(e.key.toLowerCase()==='r'){current?.reset();turnUI();}
});
try{audio.enabled=localStorage.getItem('ghostball-sound')!=='off';motion=localStorage.getItem('ghostball-motion')!=='off';view=localStorage.getItem('ghostball-view')==='flat'?'flat':'perspective';}catch{}
chooseView(view);applyRoom();refreshMenu();hide('gameScreen');
let previous=performance.now(),acc=0,uiTimer=0;
function frame(now){requestAnimationFrame(frame);let elapsed=Math.min((now-previous)/1000,.05);previous=now;
  if(document.hidden)return;
  const g=active==='lobby'?attract:current;if(!g)return;
  acc+=elapsed;let iterations=0;
  // Avoid spiral of death after tab suspension or background throttling.
  while(acc>=TABLE.step&&iterations++<14){g.step({audio,haptics:motion});acc-=TABLE.step;}
  if(iterations>=14)acc=0;
  g.update(elapsed,{audio,haptics:motion});
  if(active==='lobby'){ambient.draw(g.sim,{fx:motion?g.fx:[]});}
  else{table.draw(g.sim,{interactive:!g.isAI()&&!g.over,aim:{angle,power},fx:motion?g.fx:[]});uiTimer+=elapsed;if(uiTimer>.2){turnUI();uiTimer=0;}}
}
requestAnimationFrame(frame);
new ResizeObserver(resize).observe($('attractCanvas').parentElement);
new ResizeObserver(resize).observe($('tableArea'));
// Prior deployments were cache-first; ship a no-cache worker to clear stale copies.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
