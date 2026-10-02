import {slotModels} from './score-slots.js';
import {Game} from './game.js';
import {TableRenderer,halls} from './render.js';
import {TABLE,POCKETS} from './physics.js';
import {Audio} from './audio.js';
import {bindPower,bindAimWheel,spinFromPoint,cueShaftHit,rearAimAngle,wrapAngle} from './touch-controls.js';
import {flyTable} from './table-transition.js';
import {cueGeometry,tensionStage} from './cue-feel.js';
import {nearbyLegalCuePlacement} from './placement-guide.js';
const $=id=>document.getElementById(id);
const all=(query)=>[...document.querySelectorAll(query)];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let room=1,mode='match',rival='rookie',spin={x:0,y:0},angle=0,power=.50;
let current=null,active='lobby',motion=true,placement=null,pointerMode=null;
let settingsOrigin='lobby',updateWaiting=false,powerSide='left';
let matchElapsed=0,lastClockSecond=-1;
let lastScoreSignature='',pullProgress=0,tensionLevel=0,shotMotion=null;
let previousShotAngles=[0,0];
let attract=new Game({kind:'attract'}),audio=new Audio();
let ambient=new TableRenderer($('attractCanvas'),{view:'perspective'}),table=new TableRenderer($('gameCanvas'),{view:'flat'});
const setText=(id,value)=>{$(id).textContent=value;};
function savePreference(key,value){try{localStorage.setItem(key,value);}catch{}}

function notify(message){if(message)setText('matchAnnouncements',message);}
function applyRoom(){const h=halls[room];ambient.setHall(room);table.setHall(room);
  document.documentElement.style.setProperty('--hall',h.felt);document.documentElement.style.setProperty('--room-aura',h.aura);setText('roomEyebrow',`ROOM 0${room+1} · ESTABLISHED ${h.year}`);
  setText('roomPlaque',String(h.year));setText('roomArt',h.name.toUpperCase());$('roomEyebrow').dataset.short=`ROOM 0${room+1} · ${h.year}`;setText('roomName',h.name);setText('roomDescription',h.detail);setText('roomCount',`0${room+1} / 0${halls.length}`);
  setText('playText',mode==='practice'?`Practice at ${h.name}`:`Break at ${h.name}`);
  if(current)setText('roundLabel',h.name.toUpperCase());
}
function show(id){$(id).hidden=false;}function hide(id){$(id).hidden=true;}
function openSetup(){$('rivals').closest('.setting').hidden=mode==='practice';show('backdrop');show('setupSheet');$('closeSetup').focus();}
function closeSetup(){const wasOpen=!$('setupSheet').hidden;hide('setupSheet');if($('settingsSheet').hidden)hide('backdrop');if(wasOpen)$('openSetup').focus();}
function syncPowerSide(){
 $('gameScreen').classList.toggle('power-right',powerSide==='right');
 all('[data-power-side]').forEach(b=>{const pressed=b.dataset.powerSide===powerSide;b.setAttribute('aria-pressed',String(pressed));b.classList.toggle('selected',pressed);});
}
function openSettings(){syncPowerSide();settingsOrigin=active==='paused'?'pause':!$('clubMenu').hidden?'menu':'lobby';hide('clubMenu');hide('setupSheet');show('backdrop');show('settingsSheet');$('soundToggle').checked=audio.enabled;$('motionToggle').checked=motion;$('closeSettings').focus();}
function closeSettings(){if($('settingsSheet').hidden)return;hide('settingsSheet');hide('backdrop');if(settingsOrigin==='menu'&&active==='lobby'){show('clubMenu');$('menuSettings').focus();}else if(active==='paused')$('pauseSettings').focus();else if(active==='lobby')$('menuBtn').focus();}
function openMenu(){show('clubMenu');$('closeMenu').focus();}
function refreshMenu(){setText('matchSummary',mode==='practice'?'Open practice table':rival==='local'?'8-Ball · Two players':`8-Ball vs ${rival==='rookie'?'Rookie':'Club Pro'}`);
  setText('playSubtitle',mode==='practice'?'FREE PLAY · EXPLORE THE ANGLES':'CASUAL 8-BALL · NO ENTRY FEE');
  all('.mode[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));}
function resize(){ambient.resize();table.resize();}
function canAct(){return active==='game'&&current&&!current.over&&!current.sim.moving&&!current.isAI()&&!current.ballInHand;}
function ballSlots(container,player){
 const group=current.groups[player],pocketed=current.sim.balls.filter(b=>b.pocketed).map(b=>b.id);
 const models=slotModels(current.groups,player,pocketed);
 container.replaceChildren(...models.map(ball=>{
  const el=document.createElement('span');el.className='ball-slot'+(ball.preview?' preview':' assigned')+(ball.stripe?' striped':'')+(ball.pocketed?' pocketed':'');
  el.style.setProperty('--slot-color',ball.color);
  const numeral=document.createElement('b');numeral.className='ball-number';numeral.textContent=String(ball.id);el.append(numeral);el.setAttribute('role','listitem');
  el.setAttribute('aria-label',`Ball ${ball.id}${ball.preview?' (unassigned preview)':''}${ball.pocketed?', pocketed':''}`);
  return el;
 }));
 container.setAttribute('role','list');
 container.setAttribute('aria-label',group?`${group}: ${models.filter(b=>!b.pocketed).length} balls remaining`:'Open table. Sample ball numbers, not assigned yet.');
}
function turnUI(){if(!current)return;
 const ai=current.isAI(),busy=current.sim.moving,practice=current.kind==='practice';
 $('gameScreen').dataset.practice=String(practice);
 $('twoCard').hidden=practice;
 setText('turnLabel',current.over?'FINISHED':current.kind==='practice'?'PRACTICE':current.kind==='attract'?'EXHIBITION':current.break?'THE BREAK':current.turn===0?'YOUR TURN':current.players==='local'?'PLAYER TWO':'RIVAL TURN');
 const p1=current.groups[0]?.toUpperCase()||'OPEN',p2=current.groups[1]?.toUpperCase()||'OPEN';
 $('playerOne').innerHTML=practice?`YOU <small>${current.shots} SHOTS · ${current.sim.balls.filter(b=>b.id!==0&&b.pocketed).length} POCKETED</small>`:`${current.kind==='attract'?'CLUB PRO':current.players==='local'?'PLAYER ONE':'YOU'} <small>${p1}</small>`;
 $('playerTwo').innerHTML=`${current.kind==='attract'?'ROOKIE':current.players==='local'?'PLAYER TWO':rival==='club'?'CLUB PRO':'ROOKIE'} <small>${p2}</small>`;
 const signature=current.groups.join(':')+':'+current.sim.balls.filter(b=>b.pocketed).map(b=>b.id).sort((a,b)=>a-b).join(',');
 if(signature!==lastScoreSignature){ballSlots($('ballsOne'),0);ballSlots($('ballsTwo'),1);lastScoreSignature=signature;}
 $('gameScreen').dataset.shots=String(current.shots);
 const completed=current.over&&current.kind!=='attract';
 $('matchResult').hidden=!completed;
 if(completed){
  const player=current.winner===0?(current.players==='local'?'PLAYER ONE':'YOU'):current.players==='local'?'PLAYER TWO':rival==='club'?'CLUB PRO':'ROOKIE';
  setText('matchResultTitle',practice?'TABLE CLEARED':`${player} WINS`);
  setText('matchResultDetail',practice?`${current.shots} SHOTS THIS SESSION`:`${current.shots} SHOTS · RACK COMPLETE`);
 }
 const seconds=Math.ceil(current.shotRemaining);const pct=current.kind==='match'?`${Math.max(0,current.shotRemaining/45)*100}%`:'100%';
 for(const [i,id,clock] of [[0,'oneCard','clockOne'],[1,'twoCard','clockTwo']]){
  $(id).style.setProperty('--turn-progress',current.turn===i?pct:'100%');
  $(clock).textContent=String(seconds);$(clock).hidden=current.kind!=='match'||current.turn!==i||current.ballInHand||current.over;
  $(clock).classList.toggle('clock-warning',current.kind==='match'&&current.turn===i&&seconds<=10&&!current.ballInHand&&!current.over);
 }
 $('oneCard').classList.toggle('playing',current.turn===0);$('twoCard').classList.toggle('playing',current.turn===1);
 const toolsDisabled=!canAct();
 for(const id of ['spinButton','aimLeft','aimRight'])$(id).disabled=toolsDisabled;
 $('powerTrack').classList.toggle('is-disabled',toolsDisabled);
 $('powerTrack').setAttribute('aria-disabled',String(!canAct()));$('aimWheel').setAttribute('aria-disabled',String(!canAct()));
 const help=current.ballInHand&&!current.over&&!current.isAI()?'DRAG TO PLACE · GREEN SHOWS A CLEAR SPOT':'';
 setText('guideBadge',help);
 $('guideBadge').classList.toggle('is-visible',Boolean(help));
 $('guideBadge').style.opacity=busy?'0':'.95';
}
function begin(kind){
 if(active!=='lobby')return;
 lastScoreSignature='';matchElapsed=0;lastClockSecond=-1;previousShotAngles=[0,0];$('collectedBalls').replaceChildren();hide('clubMenu');hide('setupSheet');hide('settingsSheet');hide('backdrop');placement=null;
 angle=0;spin={x:0,y:0};power=.50;shotMotion=null;pullProgress=0;tensionLevel=0;syncAim();setPower(50);setText('powerValue','PULL ↓');syncSpin();powerControl?.reset();
 current=new Game({kind,players:rival==='local'?'local':'cpu',difficulty:rival==='club'?'club':'rookie',notify,onPocket:animatePocket});
 if(kind==='attract'){current.turn=0;notify('An exhibition between our house rivals.');}
 let needsHint=false;try{needsHint=localStorage.getItem('ghostball-controls-taught')!=='yes';}catch{}
 if(kind==='match'&&needsHint)show('controlsHint');else hide('controlsHint');
 active='transition';show('gameScreen');$('lobby').setAttribute('aria-hidden','true');
 $('gameScreen').classList.add('entering');$('app').classList.add('entering-match');
 applyRoom();turnUI();resize();
 // Start from the exact live exhibition frame rather than swapping in a still.
 $('ambient').style.visibility='hidden';
 const finish=()=>{
  if(active!=='transition')return;
  // Paint the real rack before removing the flying canvas: no empty-frame flash.
  resize();table.draw(current.sim,{interactive:!current.isAI()&&!current.over,aim:{angle,power},placement:null,fx:[]});
  active='game';$('gameScreen').classList.remove('entering');$('app').classList.remove('entering-match');
  turnUI();
 };
 try{flyTable({app:$('app'),source:$('attractCanvas'),target:$('tableArea'),
   from:attract.sim,to:current.sim,hall:room,gameRenderer:table,done:finish,isActive:()=>active==='transition'});}
 catch(err){console.warn('Table entrance skipped',err);finish();}
}
function finishLobby(){
 active='lobby';current=null;placement=null;pointerMode=null;shotMotion=null;pullProgress=0;tensionLevel=0;
 hide('spinShade');hide('spinSheet');hide('pauseMenu');hide('gameScreen');hide('controlsHint');
 $('gameScreen').classList.remove('entering','leaving');$('app').classList.remove('entering-match','leaving-match');
 $('ambient').style.visibility='';$('lobby').removeAttribute('aria-hidden');resize();$('menuBtn').focus();
 if(updateWaiting)window.location.reload();
}
function quitToLobby(){
 if(active!=='paused'&&active!=='game')return;
 closeSettings();hide('pauseMenu');hide('spinShade');hide('spinSheet');
 const leaving=current;active='transition';$('gameScreen').classList.add('leaving');$('app').classList.add('leaving-match');
 resize();ambient.draw(attract.sim,{fx:[]});
 try{flyTable({app:$('app'),source:$('gameCanvas'),target:$('attractCanvas'),from:leaving.sim,to:attract.sim,
   hall:room,gameRenderer:ambient,reverse:true,done:finishLobby,isActive:()=>active==='transition'});}
 catch(err){console.warn('Return transition skipped',err);finishLobby();}
}
function pauseMatch(){
 if(active!=='game')return;active='paused';hide('spinSheet');hide('spinShade');hide('settingsSheet');hide('backdrop');
 setText('pauseSummary',current?.kind==='practice'?'Practice table':current?.kind==='attract'?'Exhibition table':'Your match is on hold');
 show('pauseMenu');$('resumeMatch').focus();
}
function resumeMatch(){if(active!=='paused')return;hide('pauseMenu');hide('settingsSheet');hide('backdrop');active='game';$('pauseButton').focus();turnUI();}
function resetMatch(){
 if(!current)return;current.reset();lastScoreSignature='';matchElapsed=0;lastClockSecond=-1;previousShotAngles=[0,0];
 $('collectedBalls').replaceChildren();placement=null;angle=0;spin={x:0,y:0};syncAim();syncSpin();
 setPower(50);powerControl.reset();$('powerTrack').classList.remove('impact');turnUI();
}
const pocketColors=['#f4f3e9','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d','#191918','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d'];
function animatePocket(event){
 if(active!=='game'||!current)return;
 const dock=$('collectedBalls'),ball=document.createElement('span');ball.className='return-ball'+(event.id>=9?' striped':'');
 ball.style.setProperty('--ball-color',pocketColors[event.id]);ball.textContent=event.id||'';
 ball.setAttribute('aria-label',event.id?'Ball '+event.id+' pocketed':'Cue ball scratched');dock.append(ball);
 const [px,py]=POCKETS[event.pocket],[x,y]=table.project(px,py),canvasBox=$('gameCanvas').getBoundingClientRect(),end=ball.getBoundingClientRect();
 const source=mobileLandscape()?{x:canvasBox.right-y,y:canvasBox.top+x}:{x:canvasBox.left+x,y:canvasBox.top+y};
 const dx=source.x-(end.left+end.width/2),dy=source.y-(end.top+end.height/2);
 if(motion&&ball.animate&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  const flight=ball.animate([
   {transform:`translate(${dx}px,${dy}px) scale(1.1)`,opacity:1,offset:0},
   {transform:`translate(${dx*.4}px,${dy*.23}px) scale(.9)`,opacity:1,offset:.65},
   {transform:'translate(0,0) scale(1)',opacity:1,offset:1}
  ],{duration:600,easing:'cubic-bezier(.15,.78,.2,1)'});
  if(event.id===0)flight.onfinish=()=>ball.remove();
 }else if(event.id===0)ball.remove();
}
function updateClocks(elapsed){
 if(!current)return;
 matchElapsed+=elapsed;
 const whole=Math.floor(matchElapsed);
 if(whole!==lastClockSecond){
  lastClockSecond=whole;
  setText('matchTime',`${String(Math.floor(whole/60)).padStart(2,'0')}:${String(whole%60).padStart(2,'0')}`);
 }
}
// Cue aiming is acquired on the stick behind the cue ball, not the guide in
// front. Offset-preserving relative rotation avoids a jump when grabbed.
function mobileLandscape(){return window.matchMedia('(orientation:portrait) and (max-width:820px)').matches;}
function localCanvasPoint(clientX,clientY){const rect=$('gameCanvas').getBoundingClientRect();
 return mobileLandscape()?{x:clientY-rect.top,y:rect.right-clientX}:{x:clientX-rect.left,y:clientY-rect.top};}
function cuePoint(clientX,clientY){const p=localCanvasPoint(clientX,clientY);return table.unproject(p.x,p.y);}
let rearGesture=null;
function startCueDrag(e,pt,cue){
 const rect=$('gameCanvas').getBoundingClientRect(),geo=cueGeometry(cue,angle,pullProgress);
 const [cx,cy]=table.project(cue.x,cue.y);
 const [tx,ty]=table.project(geo.tip.x,geo.tip.y);
 const [bx,by]=table.project(geo.butt.x,geo.butt.y);
 const p=localCanvasPoint(e.clientX,e.clientY);
 if(!cueShaftHit(p,{x:cx,y:cy},{x:tx,y:ty},{x:bx,y:by},e.pointerType==='touch'?32:20))return false;
 const bearing=rearAimAngle(cue,pt);
 if(bearing===null)return false;
 rearGesture={bearing,angle};
 return true;
}
function moveCueDrag(clientX,clientY){
 if(!rearGesture||!current)return;
 const bearing=rearAimAngle(current.sim.cue(),cuePoint(clientX,clientY));
 if(bearing===null)return;
 angle=wrapAngle(rearGesture.angle+wrapAngle(bearing-rearGesture.bearing));syncAim();
}
function previewPlacement(clientX,clientY){
  if(!current||(!current.ballInHand&&pointerMode!=='break-place')||current.sim.moving)return;
  const pt=cuePoint(clientX,clientY);
  const isBreak=pointerMode==='break-place';
   const direct=current.sim.canPlaceCue(pt.x,pt.y)&&(!isBreak||pt.x<=265);
   const nearby=direct?null:nearbyLegalCuePlacement(current.sim,pt.x,pt.y,{breakOnly:isBreak,maxDistance:48});
   placement={...pt,legal:direct,suggestion:nearby?.snapped?nearby:null};
}
function syncAim(){angle=Math.atan2(Math.sin(angle),Math.cos(angle));$('aimRange').value=String(angle*180/Math.PI);$('aimWheel').setAttribute('aria-valuenow',String(Math.round(angle*180/Math.PI)));}
function fire(){
 if(!canAct())return;
 const strikingCue=current.sim.cue(),strength=power,shotAngle=angle;
 audio.unlock();
 if(current.beginShot(shotAngle,strength,spin)){
  previousShotAngles[current.turn]=shotAngle;
  powerControl.reset();$('powerTrack').classList.remove('held');
  if(!$('controlsHint').hidden){hide('controlsHint');savePreference('ghostball-controls-taught','yes');}
  shotMotion=motion&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches
   ?{cue:{x:strikingCue.x,y:strikingCue.y},angle:shotAngle,power:strength,start:performance.now()}:null;
  placement=null;
  if(motion)navigator.vibrate?.(strength>.7?[15,18,7]:[Math.round(4+strength*12)]);
  audio.play({type:'strike',power:strength});
  if(shotMotion)$('powerTrack').classList.add('impact');
  notify('Balls in motion…');setPower(50);setText('powerValue','PULL ↓');turnUI();
 }
}
function onPull(amount){
 pullProgress=amount;
 const stage=tensionStage(amount);
 if(stage>tensionLevel&&stage>0&&motion){
  navigator.vibrate?.(stage>=3?7:4);
 }
 if(stage>=2&&tensionLevel<2)audio.play({type:'draw',power:amount});
 tensionLevel=stage;
 $('powerTrack').classList.toggle('armed',amount>=.68);
 if(amount>.005)setText('powerValue',Math.round(Math.max(.08,amount)*100)+'%');
 else setText('powerValue','PULL ↓');
}
function setPower(n){power=clamp(Number(n)/100,.08,1);setText('powerValue',`${Math.round(power*100)}%`);}
$('menuBtn').onclick=openMenu;$('closeMenu').onclick=()=>hide('clubMenu');
$('menuPractice').onclick=()=>begin('practice');$('menuSettings').onclick=openSettings;
$('pauseButton').onclick=pauseMatch;$('resumeMatch').onclick=resumeMatch;
$('pauseSettings').onclick=openSettings;$('rerack').onclick=()=>{resetMatch();resumeMatch();};$('quitMatch').onclick=quitToLobby;
$('playAgain').onclick=()=>{if(active==='game'&&current?.over)resetMatch();};
$('resultMenu').onclick=quitToLobby;
$('closeSettings').onclick=closeSettings;
 all('[data-power-side]').forEach(b=>b.onclick=()=>{powerSide=b.dataset.powerSide;savePreference('ghostball-power-side',powerSide);syncPowerSide();});
$('soundToggle').onchange=event=>{audio.enabled=event.target.checked;if(audio.enabled)audio.unlock();else audio.suspend();savePreference('ghostball-sound',audio.enabled?'on':'off');};
$('motionToggle').onchange=event=>{motion=event.target.checked;savePreference('ghostball-motion',motion?'on':'off');};
$('openSetup').onclick=openSetup;$('closeSetup').onclick=closeSetup;$('backdrop').onclick=()=>{closeSetup();closeSettings();};
$('prevRoom').onclick=()=>{room=(room-1+halls.length)%halls.length;applyRoom();};
$('nextRoom').onclick=()=>{room=(room+1)%halls.length;applyRoom();};
all('.mode[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;refreshMenu();applyRoom();});
all('#rivals [data-rival]').forEach(b=>b.onclick=()=>{rival=b.dataset.rival;all('#rivals button').forEach(n=>n.classList.toggle('selected',n===b));refreshMenu();});
$('playBtn').onclick=()=>begin(mode);$('watchBtn').onclick=()=>begin('attract');
$('aimLeft').onclick=()=>{angle-=Math.PI/720;syncAim();};
$('aimRight').onclick=()=>{angle+=Math.PI/720;syncAim();};
$('aimRange').oninput=e=>{angle=Number(e.target.value)*Math.PI/180;};
const powerControl=bindPower({
 track:$('powerTrack'),handle:$('pullHandle'),canShoot:()=>Boolean(canAct()),
 onPower:n=>{setPower(n*100);audio.unlock();},
 onPull,
 onShoot:()=>{fire();return true;},
 onCancel:()=>{setPower(50);}
});
bindAimWheel({element:$('aimWheel'),canAim:()=>Boolean(canAct()),getAngle:()=>angle,
 setAngle:n=>{angle=n;syncAim();},
 onReset:()=>{angle=previousShotAngles[current?.turn||0]||0;syncAim();
  notify('Aim restored to the previous shot direction.');}});
function syncSpin(){
 const label=spin.y>.18?'FOLLOW':spin.y<-.18?'DRAW':'CENTER';
 const side=spin.x>.18?'RIGHT':spin.x<-.18?'LEFT':'';
 setText('spinLabel',[label,side].filter(Boolean).join(' · '));
 for(const id of ['spinDot','spinPreview']){const dot=$(id);dot.style.left=`${50+spin.x*39}%`;dot.style.top=`${50-spin.y*39}%`;}
}
$('spinButton').onclick=()=>{if(!canAct())return;show('spinShade');show('spinSheet');$('spinDone').focus();};
function closeSpin(){hide('spinShade');hide('spinSheet');$('spinButton').focus();}
$('spinDone').onclick=closeSpin;$('spinShade').onclick=closeSpin;
$('spinReset').onclick=()=>{spin={x:0,y:0};syncSpin();};
let spinPointer=null;
function spinPosition(e){const rect=$('spinBall').getBoundingClientRect();
 if(mobileLandscape()){spin=spinFromPoint(e.clientY-rect.top,rect.right-e.clientX,{left:0,top:0,width:rect.height,height:rect.width});}
 else spin=spinFromPoint(e.clientX,e.clientY,rect);syncSpin();}
$('spinBall').addEventListener('pointerdown',e=>{if(spinPointer!==null)return;spinPointer=e.pointerId;$('spinBall').setPointerCapture?.(spinPointer);spinPosition(e);});
$('spinBall').addEventListener('pointermove',e=>{if(e.pointerId===spinPointer)spinPosition(e);});
$('spinBall').addEventListener('pointerup',e=>{if(e.pointerId!==spinPointer)return;spinPosition(e);spinPointer=null;});
$('spinBall').addEventListener('pointercancel',()=>{spinPointer=null;});
let pointerId=null;
$('gameCanvas').addEventListener('pointerdown',e=>{
 if(!canAct()&&!(active==='game'&&current?.ballInHand&&!current?.isAI()))return;
 if(pointerId!==null)return;
 const cue=current.sim.cue(),pt=cuePoint(e.clientX,e.clientY);
 const place=current.ballInHand?'place':current.break&&current.shots===0&&cue&&Math.hypot(cue.x-pt.x,cue.y-pt.y)<35?'break-place':null;
 if(place){pointerMode=place;previewPlacement(e.clientX,e.clientY);}
 else if(cue&&!cue.pocketed&&startCueDrag(e,pt,cue)){pointerMode='cue-aim';}
 else return; // Touches in front of the stick never move the cue.
 pointerId=e.pointerId;$('gameCanvas').setPointerCapture?.(pointerId);
 audio.unlock();e.preventDefault();
});
$('gameCanvas').addEventListener('pointermove',e=>{
 if(e.pointerId!==pointerId)return;
 if(pointerMode==='cue-aim')moveCueDrag(e.clientX,e.clientY);
 else if(pointerMode==='place'||pointerMode==='break-place')previewPlacement(e.clientX,e.clientY);
 e.preventDefault();
});
$('gameCanvas').addEventListener('pointerup',e=>{
 if(e.pointerId!==pointerId)return;
 pointerId=null;
 if(pointerMode==='cue-aim')moveCueDrag(e.clientX,e.clientY);
 if(pointerMode==='place'||pointerMode==='break-place'){
  previewPlacement(e.clientX,e.clientY);
  const drop=placement?.legal?placement:placement?.suggestion;
  if(drop&&(pointerMode==='break-place'?current.placeBreakCue(drop.x,drop.y):current.placeCue(drop.x,drop.y))){
   placement=null;turnUI();
  }
 }
 rearGesture=null;pointerMode=null;
});
$('gameCanvas').addEventListener('pointercancel',e=>{
 if(e.pointerId===pointerId){pointerId=null;rearGesture=null;pointerMode=null;placement=null;}
});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('spinSheet').hidden){closeSpin();return;}if(!$('settingsSheet').hidden)closeSettings();else if(!$('setupSheet').hidden)closeSetup();else if(!$('clubMenu').hidden)hide('clubMenu');else if(active==='paused')resumeMatch();else if(active==='game')pauseMatch();return;}
  if(!$('settingsSheet').hidden||!$('setupSheet').hidden||!$('clubMenu').hidden||!$('spinSheet').hidden)return;
  if(active!=='game'||['INPUT','BUTTON','TEXTAREA'].includes(document.activeElement?.tagName)&&document.activeElement?.type==='range')return;
  if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a'){angle-=Math.PI/720;syncAim();e.preventDefault();}
  if(e.key==='ArrowRight'||e.key.toLowerCase()==='d'){angle+=Math.PI/720;syncAim();e.preventDefault();}
  if(e.code==='Space'){e.preventDefault();fire();}
  if(e.key.toLowerCase()==='r'){pauseMatch();}
});
window.addEventListener('pagehide',()=>audio.suspend());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.suspend();else audio.resume();});
 try{audio.enabled=localStorage.getItem('ghostball-sound')!=='off';motion=localStorage.getItem('ghostball-motion')!=='off';powerSide=localStorage.getItem('ghostball-power-side')==='right'?'right':'left';}catch{}
 syncPowerSide();
syncSpin();
applyRoom();refreshMenu();hide('gameScreen');
let previous=performance.now(),acc=0,uiTimer=0;
function frame(now){requestAnimationFrame(frame);let elapsed=Math.min((now-previous)/1000,.05);previous=now;
  if(document.hidden)return;
  if(active==='transition'||active==='paused'){previous=now;acc=0;return;}
  const g=active==='lobby'?attract:current;if(!g)return;
  acc+=elapsed;let iterations=0;
  // Avoid spiral of death after tab suspension or background throttling.
  while(acc>=TABLE.step&&iterations++<14){g.step({audio,haptics:motion});acc-=TABLE.step;}
  if(iterations>=14)acc=0;
  g.update(elapsed,{audio,haptics:motion});
  if(active==='lobby'){const pose=g.presentedCue;ambient.draw(g.sim,{interactive:!!pose&&!g.sim.moving,aim:pose,fx:motion?g.fx:[]});}
  else{updateClocks(elapsed);const strokeTime=shotMotion?(now-shotMotion.start)/115:1;
   const strike=shotMotion&&strokeTime<1?{...shotMotion,progress:Math.max(0,strokeTime)}:null;
   if(shotMotion&&strokeTime>=1){shotMotion=null;$('powerTrack').classList.remove('impact');}
   const cpuPose=g.isAI()?g.presentedCue:null;
   const zone=active==='game'&&!g.over&&!g.sim.moving&&!g.isAI()
     ?g.ballInHand?'all':pointerMode==='break-place'?'break':null:null;
    const frame={interactive:(!g.isAI()||!!cpuPose)&&!g.over,aim:cpuPose||{angle,power,spin,drawback:pullProgress,strike},placement,placementZone:zone,fx:motion?g.fx:[]};
   table.draw(g.sim,frame);uiTimer+=elapsed;if(uiTimer>.2){turnUI();uiTimer=0;}}
}
requestAnimationFrame(frame);
new ResizeObserver(resize).observe($('attractCanvas').parentElement);
new ResizeObserver(resize).observe($('tableArea'));
// Prior deployments were cache-first; ship a no-cache worker to clear stale copies.
if ('serviceWorker' in navigator){
 let hadController=Boolean(navigator.serviceWorker.controller);
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(!hadController){hadController=true;return;}
  updateWaiting=true;
  if(active==='lobby')window.location.reload();
  else show('updateNotice');
 });
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
}
$('applyUpdate').onclick=()=>window.location.reload();
