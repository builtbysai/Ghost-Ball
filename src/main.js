import {Game} from './game.js';
import {TableRenderer,halls} from './render.js';
import {TABLE} from './physics.js';
import {Audio} from './audio.js';
const $=id=>document.getElementById(id);
const all=(query)=>[...document.querySelectorAll(query)];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let room=0,mode='match',rival='rookie',view='perspective',english=0,angle=0,power=.50;
let current=null,active='lobby',motion=true,releaseToShoot=false,placement=null;
let webgl=null,viewRequest=0;
let attract=new Game({kind:'attract'}),audio=new Audio();
let ambient=new TableRenderer($('attractCanvas'),{view:'perspective'}),table=new TableRenderer($('gameCanvas'),{view});
const setText=(id,value)=>{$(id).textContent=value;};
function notify(message){if(message)setText('status',message);}
function applyRoom(){const h=halls[room];ambient.setHall(room);table.setHall(room);webgl?.setHall(room);
  document.documentElement.style.setProperty('--hall',h.felt);setText('roomEyebrow',`ROOM 0${room+1} · ESTABLISHED ${h.year}`);
  setText('roomName',h.name);setText('roomDescription',h.detail);setText('roomCount',`0${room+1} / 0${halls.length}`);
  setText('playText',mode==='practice'?`Practice at ${h.name}`:`Break at ${h.name}`);
  if(current)setText('roundLabel',`${h.name.toUpperCase()} · ${current.kind==='practice'?'PRACTICE':'CASUAL 8-BALL'}`);
}
function chooseView(next){
 const request=++viewRequest;
 if(!['flat','perspective','webgl'].includes(next))next='perspective';
 view=next;table.setView(view==='flat'?'flat':'perspective');ambient.setView(view==='flat'?'flat':'perspective');
 all('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
 const order=['flat','perspective','webgl'],labels=['2D','2.5D','3D'];
 const following=(order.indexOf(view)+1)%3;
 setText('gameView',`${labels[following]} VIEW`);
 $('gameView').setAttribute('aria-label',`Switch to ${labels[following]} table view`);
 if(next!=='webgl'){
  $('webglCanvas').hidden=true;table.canvas.style.visibility='visible';resize();return;
 }
 // Only allocate a GPU context on demand; no GPU tax in the animated lobby.
 if(!webgl){
  import('./render3d.js').then(({WebGLTableRenderer})=>{
   if(request!==viewRequest)return;
   try{webgl=new WebGLTableRenderer($('webglCanvas'),{hall:room,onContextLost:()=>{
    if(view==='webgl'){chooseView('perspective');notify('3D graphics paused. Switched to 2.5D.');}
   }});chooseView('webgl');}
   catch(err){console.warn('3D view unavailable, using 2.5D',err);chooseView('perspective');notify('3D is not available on this device.');}
  }).catch(err=>{if(request!==viewRequest)return;console.warn('3D module failed',err);chooseView('perspective');notify('3D did not load. Using 2.5D.');});
  // Until loaded, 2.5D remains visible and interactive.
  $('webglCanvas').hidden=true;
 }else{$('webglCanvas').hidden=false;webgl.resize();}
 resize();
}
function show(id){$(id).hidden=false;}function hide(id){$(id).hidden=true;}
function openSetup(){$('rivals').closest('.setting').hidden=mode==='practice';show('backdrop');show('setupSheet');$('closeSetup').focus();}
function closeSetup(){hide('setupSheet');if($('settingsSheet').hidden)hide('backdrop');$('openSetup').focus();}
function openSettings(){hide('clubMenu');hide('setupSheet');show('backdrop');show('settingsSheet');$('soundToggle').checked=audio.enabled;$('motionToggle').checked=motion;$('releaseToggle').checked=releaseToShoot;}
function closeSettings(){hide('settingsSheet');hide('backdrop');}
function openMenu(){show('clubMenu');$('closeMenu').focus();}
function refreshMenu(){setText('matchSummary',mode==='practice'?'Open practice table':rival==='local'?'8-Ball · Two players':`8-Ball vs ${rival==='rookie'?'Rookie':'Club Pro'}`);
  setText('playSubtitle',mode==='practice'?'FREE PLAY · EXPLORE THE ANGLES':'CASUAL 8-BALL · NO ENTRY FEE');
  all('.mode[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));}
function resize(){ambient.resize();table.resize();if(webgl&&!webgl.lost&&view==='webgl')webgl.resize();}
function turnUI(){if(!current)return;const ai=current.isAI(),busy=current.sim.moving;
  setText('turnLabel',current.over?'RACK COMPLETE':current.kind==='practice'?'PRACTICE TABLE':current.kind==='attract'?'AI EXHIBITION':current.break?'THE BREAK':current.turn===0?'YOUR SHOT':current.players==='local'?'PLAYER TWO':'ROOKIE AT THE TABLE');
  const p1=current.groups[0]?.toUpperCase()||'OPEN TABLE',p2=current.groups[1]?.toUpperCase()||'OPEN TABLE';
  $('playerOne').innerHTML=`${current.kind==='attract'?'CLUB PRO':'PLAYER ONE'} <small>${p1}</small>`;
  $('playerTwo').innerHTML=`${current.kind==='attract'?'ROOKIE':current.players==='local'?'PLAYER TWO':'ROOKIE'} <small>${p2}</small>`;
  const canPlay=!current.over&&!busy&&!ai;
  $('shootBtn').disabled=!canPlay||current.ballInHand;
  $('powerRange').disabled=!canPlay||current.ballInHand;
  $('aimRange').disabled=!canPlay||current.ballInHand;
  setText('guideBadge',current.ballInHand?'DRAG, THEN RELEASE TO PLACE':ai?'WATCH THE SHOT':canPlay?'DRAG ANYWHERE TO AIM':'BALLS IN MOTION');
  $('guideBadge').style.opacity=busy?'0':'.85';
}
function begin(kind){hide('clubMenu');hide('setupSheet');hide('settingsSheet');hide('backdrop');placement=null;
  angle=0;english=0;power=.50;syncAim();setPower(50);$('spin').value='0';setText('spinLabel','CENTER');
  current=new Game({kind,players:rival==='local'?'local':'cpu',difficulty:rival==='club'?'club':'rookie',notify});
  if(kind==='attract'){current.turn=0;setText('status','An exhibition between our house rivals.');}
  active='game';show('gameScreen');$('lobby').setAttribute('aria-hidden','true');
  chooseView(view);applyRoom();turnUI();resize();}
function exit(){active='lobby';current=null;placement=null;hide('gameScreen');$('lobby').removeAttribute('aria-hidden');resize();}
function aimAt(clientX,clientY){if(!current||current.isAI()||current.over||current.sim.moving)return;
  const rect=$('gameCanvas').getBoundingClientRect(),pt=(view==='webgl'&&webgl&&!webgl.lost?webgl:table).unproject(clientX-rect.left,clientY-rect.top);
  if(current.ballInHand)return;
  const cue=current.sim.cue();if(!cue||cue.pocketed)return;
  const dx=pt.x-cue.x,dy=pt.y-cue.y;if(dx*dx+dy*dy<250)return;
  angle=Math.atan2(dy,dx);syncAim();}
function previewPlacement(clientX,clientY){
  if(!current?.ballInHand||current.sim.moving)return;
  const rect=$('gameCanvas').getBoundingClientRect(),pt=(view==='webgl'&&webgl&&!webgl.lost?webgl:table).unproject(clientX-rect.left,clientY-rect.top);
  placement={...pt,legal:current.sim.canPlaceCue(pt.x,pt.y)};
}
function syncAim(){angle=Math.atan2(Math.sin(angle),Math.cos(angle));$('aimRange').value=String(angle*180/Math.PI);}
function fire(){if(!current||current.isAI()||current.ballInHand||current.over)return;
  audio.unlock();if(current.beginShot(angle,power,english)){
    placement=null;if(motion)navigator.vibrate?.(Math.round(4+power*12));audio.play({type:'strike',power});turnUI();}}
function setPower(n){power=clamp(Number(n)/100,.08,1);$('powerRange').value=Math.round(power*100);setText('powerValue',`${Math.round(power*100)}%`);}
$('menuBtn').onclick=openMenu;$('closeMenu').onclick=()=>hide('clubMenu');
$('menuPractice').onclick=()=>begin('practice');$('menuSettings').onclick=openSettings;
$('inGameSettings').onclick=openSettings;
$('closeSettings').onclick=closeSettings;
$('soundToggle').onchange=event=>{audio.enabled=event.target.checked;localStorage.setItem('ghostball-sound',audio.enabled?'on':'off');};
$('motionToggle').onchange=event=>{motion=event.target.checked;localStorage.setItem('ghostball-motion',motion?'on':'off');};
$('releaseToggle').onchange=event=>{releaseToShoot=event.target.checked;localStorage.setItem('ghostball-release',releaseToShoot?'on':'off');$('powerRange').setAttribute('aria-label',releaseToShoot?'Shot power, release after dragging to shoot':'Shot power, use Take Shot to shoot');};
$('openSetup').onclick=openSetup;$('closeSetup').onclick=closeSetup;$('backdrop').onclick=()=>{closeSetup();closeSettings();};
$('prevRoom').onclick=()=>{room=(room-1+halls.length)%halls.length;applyRoom();};
$('nextRoom').onclick=()=>{room=(room+1)%halls.length;applyRoom();};
all('.mode[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;refreshMenu();applyRoom();});
all('#rivals [data-rival]').forEach(b=>b.onclick=()=>{rival=b.dataset.rival;all('#rivals button').forEach(n=>n.classList.toggle('selected',n===b));refreshMenu();});
all('[data-view]').forEach(b=>b.onclick=()=>{chooseView(b.dataset.view);localStorage.setItem('ghostball-view',view);});
$('playBtn').onclick=()=>begin(mode);$('watchBtn').onclick=()=>begin('attract');
$('leaveGame').onclick=exit;$('rerack').onclick=()=>{current?.reset();placement=null;angle=0;english=0;syncAim();setPower(50);$('spin').value='0';setText('spinLabel','CENTER');turnUI();};
$('gameView').onclick=()=>{const order=['flat','perspective','webgl'];chooseView(order[(order.indexOf(view)+1)%3]);};
$('aimLeft').onclick=()=>{angle-=Math.PI/720;syncAim();};
$('aimRight').onclick=()=>{angle+=Math.PI/720;syncAim();};
$('aimRange').oninput=e=>{angle=Number(e.target.value)*Math.PI/180;};
$('spin').oninput=e=>{english=Number(e.target.value)/100;setText('spinLabel',english===0?'CENTER':english<0?`${Math.abs(Math.round(english*100))}% LEFT`:`${Math.round(english*100)}% RIGHT`);};
$('powerRange').oninput=e=>setPower(e.target.value);
// Optional pull-and-release is intentionally off initially: adjusting power
// should never silently commit a shot for users who expect an explicit button.
let pulled=false,startPower=0;
$('powerRange').addEventListener('pointerdown',()=>{pulled=true;startPower=power;audio.unlock();});
$('powerRange').addEventListener('pointerup',()=>{if(pulled&&releaseToShoot&&Math.abs(power-startPower)>.09)fire();pulled=false;});
$('powerRange').addEventListener('pointercancel',()=>{pulled=false;});
$('shootBtn').onclick=fire;
let pointerId=null;
$('gameCanvas').addEventListener('pointerdown',e=>{if(active!=='game'||!current||current.over||current.sim.moving||current.isAI())return;
  pointerId=e.pointerId;$('gameCanvas').setPointerCapture?.(pointerId);
  if(current.ballInHand)previewPlacement(e.clientX,e.clientY);else aimAt(e.clientX,e.clientY);audio.unlock();});
$('gameCanvas').addEventListener('pointermove',e=>{if(e.pointerId!==pointerId)return;
  if(current?.ballInHand)previewPlacement(e.clientX,e.clientY);else aimAt(e.clientX,e.clientY);});
$('gameCanvas').addEventListener('pointerup',e=>{if(e.pointerId!==pointerId)return;pointerId=null;
  if(current?.ballInHand){previewPlacement(e.clientX,e.clientY);if(placement?.legal&&current.placeCue(placement.x,placement.y)){placement=null;turnUI();}}});
$('gameCanvas').addEventListener('pointercancel',e=>{if(e.pointerId===pointerId){pointerId=null;placement=null;}});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('settingsSheet').hidden)closeSettings();else if(!$('setupSheet').hidden)closeSetup();else if(!$('clubMenu').hidden)hide('clubMenu');else if(active==='game')exit();return;}
  if(!$('settingsSheet').hidden||!$('setupSheet').hidden||!$('clubMenu').hidden)return;
  if(active!=='game'||['INPUT','BUTTON','TEXTAREA'].includes(document.activeElement?.tagName)&&document.activeElement?.type==='range')return;
  if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a'){angle-=Math.PI/720;syncAim();e.preventDefault();}
  if(e.key==='ArrowRight'||e.key.toLowerCase()==='d'){angle+=Math.PI/720;syncAim();e.preventDefault();}
  if(e.code==='Space'){e.preventDefault();fire();}
  if(e.key.toLowerCase()==='r'){current?.reset();turnUI();}
});
try{audio.enabled=localStorage.getItem('ghostball-sound')!=='off';motion=localStorage.getItem('ghostball-motion')!=='off';view=['flat','perspective','webgl'].includes(localStorage.getItem('ghostball-view'))?localStorage.getItem('ghostball-view'):'perspective';releaseToShoot=localStorage.getItem('ghostball-release')==='on';}catch{}
if(releaseToShoot)$('powerRange').setAttribute('aria-label','Shot power, release after dragging to shoot');
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
  else{const frame={interactive:!g.isAI()&&!g.over,aim:{angle,power},placement,fx:motion?g.fx:[]};
   if(view==='webgl'&&webgl&&!webgl.lost){webgl.draw(g.sim);table.drawOverlay(g.sim,frame,webgl);}
   else table.draw(g.sim,frame);uiTimer+=elapsed;if(uiTimer>.2){turnUI();uiTimer=0;}}
}
requestAnimationFrame(frame);
new ResizeObserver(resize).observe($('attractCanvas').parentElement);
new ResizeObserver(resize).observe($('tableArea'));
// Prior deployments were cache-first; ship a no-cache worker to clear stale copies.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
