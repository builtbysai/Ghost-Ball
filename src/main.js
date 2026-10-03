import {slotModels} from './score-slots.js';
import {Game} from './game.js';
import {TableRenderer,halls} from './render.js';
import {TABLE,POCKETS} from './physics.js';
import {Audio} from './audio.js';
import {bindPower,bindAimWheel,spinFromPoint,cueShaftHit,rearAimAngle,wrapAngle} from './touch-controls.js';
import {flyTable} from './table-transition.js';
import {cueGeometry,tensionStage} from './cue-feel.js';
import {cuePlacementDraft,initialCuePlacement} from './placement-guide.js';
import {CUES,cueUnlocked,cueById,equippedCue,equipCue,toggleFavorite,paintCuePreview} from './cue-catalog.js';
import {readLocalProgress,writeLocalProgress,recordLiveMatch,bestLegalRun,chooseRoom,
 freshProgress,exportLocalProgress,resetLocalProgress,recordLiveDrill} from './player-progress.js';
import {SKILL_DRILLS,skillDrillById} from './skill-drills.js';
import {recordSummary} from './record-summary.js';
const $=id=>document.getElementById(id);
const all=(query)=>[...document.querySelectorAll(query)];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const progressAccess=readLocalProgress();
let progress=progressAccess.progress;
const newMatchId=()=>globalThis.crypto?.randomUUID?.()||
  `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let matchEventId=null,drillEventId=null,lockerSelected='house',newlyEarnedCueCount=0;
let room=clamp(progress.selectedRoom,0,halls.length-1),mode='match',rival='rookie',spin={x:0,y:0},angle=0,power=.50;
let current=null,active='lobby',motion=true,placement=null,pointerMode=null,placeGesture=null;
let settingsOrigin='lobby',updateWaiting=false,powerSide='left';
let matchElapsed=0,lastClockSecond=-1;
let lastScoreSignature='',pullProgress=0,tensionLevel=0,shotMotion=null;
let previousShotAngles=[0,0],toastTimeout=null;
let attract=new Game({kind:'attract'}),audio=new Audio();
let ambient=new TableRenderer($('attractCanvas'),{view:'perspective'}),table=new TableRenderer($('gameCanvas'),{view:'flat'});
function syncEquippedCue(){const cue=equippedCue(progress);ambient.setCue(cue.id);table.setCue(cue.id);}
function saveProgress(next){if(next===progress)return;progress=next;syncEquippedCue();
 if(progressAccess.writable&&!writeLocalProgress(progress))progressAccess.writable=false;}
const setText=(id,value)=>{$(id).textContent=value;};
function savePreference(key,value){try{localStorage.setItem(key,value);}catch{}}

function notify(message){if(message)setText('matchAnnouncements',message);}
function clearTableToast(){
 if(toastTimeout!==null)clearTimeout(toastTimeout);
 toastTimeout=null;hide('tableToast');
}
function tableToast(message,kind='turn'){
 clearTableToast();setText('tableToast',message);
 $('tableToast').dataset.kind=kind;show('tableToast');
 toastTimeout=setTimeout(()=>{hide('tableToast');toastTimeout=null;},kind==='foul'?1700:1150);
}
function matchTurn(event){
 if(active!=='game')return;
 if(event.type==='drill-end'){
  clearTableToast();
  if(current.kind==='drill'&&current.over&&drillEventId){
   if(event.completed)saveProgress(recordLiveDrill(progress,{
    kind:'drill',source:'live',id:drillEventId,at:new Date().toISOString(),
    drillId:event.drillId,completed:true,shots:event.shots,evidence:event.evidence
   }));
   drillEventId=null;
  }
  if(event.completed)audio.play({type:'win'});else audio.play({type:'foul'});
  return;
 }
 if(event.type==='win'){
  clearTableToast();
  if(current.kind==='match'&&current.over&&matchEventId){
   const previouslyOwned=CUES.filter(cue=>cueUnlocked(progress,cue)).map(cue=>cue.id);
   const updated=recordLiveMatch(progress,{
    kind:'match',source:'live',id:matchEventId,
    at:new Date().toISOString(),shots:current.shots,winner:current.winner,
    players:current.players,difficulty:current.difficulty,room,
    reason:event.reason,
    bestRun:current.players==='local'
      ?Math.max(bestLegalRun(current.history,0),bestLegalRun(current.history,1))
      :bestLegalRun(current.history,0)
   });
   // Matches discarded via quit, restart, replay or exhibition can never
   // mint achievements; a finished match is recorded at most once.
   matchEventId=null;
   newlyEarnedCueCount=CUES.filter(cue=>cueUnlocked(updated,cue)&&!previouslyOwned.includes(cue.id)).length;
   saveProgress(updated);
  }
  audio.play({type:event.practice||current.players==='local'||event.winner===0?'win':'loss'});
  return;
 }
 const local=current.players==='local',human=event.turn===0;
 const who=local?`PLAYER ${event.turn+1}`:human?'YOU':'RIVAL';
 if(event.type==='foul'){
  const reasons={
   scratch:'SCRATCH','no-contact':'NO CONTACT',
   'wrong-ball-first':'WRONG BALL','no-rail':'NO RAIL',
   'shot-clock':'TIMEOUT'
  };
  const reason=reasons[event.reason]||'FOUL';
  const receiving=local?`${who} PLACES`:human?'BALL IN HAND':'RIVAL PLACES';
  tableToast(`${reason} · ${receiving}`,'foul');
  audio.play({type:'foul'});
 }else if(event.type==='turn'){
  const action=event.retain?'KEEPS TABLE':'TO SHOOT';
  if(event.assignment){
   const group=event.assignment.toUpperCase();
   tableToast(`${group} · ${local?who:human?'YOU':'RIVAL'}`,'turn');
  }else tableToast(local?`${who} ${action}`:human?event.retain?'YOUR TABLE':'YOUR TURN':event.retain?'RIVAL KEEPS TABLE':'RIVAL TURN');
  if(local||human)audio.play({type:'turn'});
 }
}
function applyRoom(){const h=halls[room];ambient.setHall(room);table.setHall(room);
 const selected=chooseRoom(progress,room,halls.length);
 if(selected!==progress){
  progress=selected;
  if(progressAccess.writable&&!writeLocalProgress(progress))progressAccess.writable=false;
 }
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
function ensureLockerCards(){
 if($('lockerGrid').children.length)return;
 for(const cue of CUES){
  const button=document.createElement('button');button.type='button';button.className='locker-card';
  button.dataset.cue=cue.id;
  for(const [property,color] of [['--cue-butt',cue.butt],['--cue-wrap',cue.wrap],
      ['--cue-metal',cue.metal],['--cue-shaft',cue.shaft],['--cue-tip',cue.tip]])
   button.style.setProperty(property,color);
  const name=document.createElement('span');name.className='locker-card-name';name.textContent=cue.name;
  const preview=document.createElement('span');preview.className='locker-mini-cue';preview.setAttribute('aria-hidden','true');
  const status=document.createElement('span');status.className='locker-card-status';
  button.append(name,preview,status);$('lockerGrid').append(button);
 }
}
function renderLocker(){
 ensureLockerCards();
 const selected=cueById(lockerSelected),owned=cueUnlocked(progress,selected);
 const equipped=equippedCue(progress).id;
 for(const button of $('lockerGrid').children){
  const cue=cueById(button.dataset.cue),available=cueUnlocked(progress,cue);
  const favorite=(progress.favorites||[]).includes(cue.id);
  button.classList.toggle('locked',!available);
  button.setAttribute('aria-pressed',String(selected.id===cue.id));
  button.setAttribute('aria-label',cue.name+', '+(!available?'locked, '+cue.earn:
    equipped===cue.id?'equipped':favorite?'favorite, owned':'owned'));
  button.lastElementChild.textContent=!available?'LOCKED':equipped===cue.id?'EQUIPPED':
    favorite?'★ FAVORITE':'OWNED';
 }
 paintCuePreview($('lockerPreview'),selected);
 $('lockerPreview').setAttribute('aria-label',selected.name+' full-length cue');
 setText('lockerName',selected.name);
 setText('lockerDescription',selected.description);
 setText('lockerRequirement',owned?'Permanently owned':selected.earn);
 setText('lockerStatus',!progressAccess.writable?'SESSION ONLY':!owned?'TO EARN':
   selected.id===equipped?'EQUIPPED':'AVAILABLE');
 $('lockerEquip').disabled=!owned||equipped===selected.id;
 $('lockerEquip').textContent=!owned?'LOCKED':equipped===selected.id?'EQUIPPED':'EQUIP';
 $('lockerFavorite').disabled=!owned;
 const favorite=(progress.favorites||[]).includes(selected.id);
 $('lockerFavorite').textContent=favorite?'★':'☆';
 $('lockerFavorite').setAttribute('aria-pressed',String(favorite));
 $('lockerFavorite').setAttribute('aria-label',favorite?'Remove from favorites':'Add to favorites');
}
function openLocker(){
 if(active!=='lobby')return;
 hide('clubMenu');lockerSelected=equippedCue(progress).id;renderLocker();
 show('lockerSheet');
 $('lockerGrid').querySelector('[data-cue="'+lockerSelected+'"]').focus();
}
function closeLocker(){
 if($('lockerSheet').hidden)return;
 hide('lockerSheet');show('clubMenu');$('menuLocker').focus();
}
function showRecord(){
 const summary=recordSummary(progress);
 setText('recordMatches',String(summary.matches));
 setText('recordRivals',summary.wins+' / '+summary.losses);
 setText('recordClean',String(summary.clean));
 setText('recordRun',String(summary.run));
 setText('recordDrills',Object.keys(progress.drills||{}).length+' / '+SKILL_DRILLS.length+' SKILLS');
 const rows=summary.recent.map(item=>{
  const row=document.createElement('div');row.className='record-row';row.setAttribute('role','listitem');
  const title=document.createElement('strong');title.textContent=item.title+' · '+item.opponent;
  const detail=document.createElement('span');detail.textContent=item.detail+' · '+item.shots+' SHOTS';
  row.append(title,detail);return row;
 });
 if(!rows.length){
  const empty=document.createElement('span');empty.textContent='No completed matches yet.';
  rows.push(empty);
 }
 $('recordHistory').replaceChildren(...rows);
 let label='THIS DEVICE ONLY',reason='';
 if(!progressAccess.writable){
  label=progressAccess.reason==='unsupported-version'?'NEWER SAVED FORMAT':
    progressAccess.reason==='invalid-data'?'SAVED DATA NEEDS REVIEW':'SESSION ONLY';
  reason=progressAccess.reason==='unsupported-version'?
    'An existing record uses a newer format. It was not changed.':
    progressAccess.reason==='invalid-data'?
    'An existing record could not be read. It was not changed.':
    'Storage is unavailable. This session may not be saved.';
 }
 setText('recordStorage',label);
 setText('recordMessage',reason);
 $('exportRecord').disabled=progressAccess.reason==='unsupported-version'||
  progressAccess.reason==='invalid-data';
 $('resetRecord').disabled=!progressAccess.writable;
 $('recordConfirm').hidden=true;$('resetRecord').hidden=false;
}
function openRecord(){
 if($('settingsSheet').hidden)return;
 hide('settingsSheet');showRecord();show('recordSheet');$('closeRecord').focus();
}
function closeRecord(){
 if($('recordSheet').hidden)return;
 hide('recordSheet');$('recordConfirm').hidden=true;$('resetRecord').hidden=false;
 show('settingsSheet');$('openRecord').focus();
}
function downloadRecord(){
 const contents=exportLocalProgress(progress);
 if(!contents){setText('recordMessage','Record could not be exported.');return;}
 const object=URL.createObjectURL(new Blob([contents],{type:'application/json'}));
 const anchor=document.createElement('a');
 anchor.href=object;anchor.download='ghost-ball-record-'+new Date().toISOString().slice(0,10)+'.json';
 anchor.style.display='none';document.body.append(anchor);
 try{anchor.click();setText('recordMessage','Export prepared. Your data stays local.');}
 finally{anchor.remove();setTimeout(()=>URL.revokeObjectURL(object),2000);}
}
function confirmLocalReset(){
 if(!progressAccess.writable)return;
 if(!resetLocalProgress()){setText('recordMessage','Could not clear storage. No progress was reset.');return;}
 progress=freshProgress();room=progress.selectedRoom;newlyEarnedCueCount=0;
 syncEquippedCue();applyRoom();showRecord();
 setText('recordMessage','Local match history and equipment progress cleared.');
 $('resetRecord').focus();
}
function ensureChallengeCards(){
 if($('challengeCards').children.length)return;
 for(const drill of SKILL_DRILLS){
  const button=document.createElement('button');button.type='button';button.className='challenge-card';
  button.dataset.drill=drill.id;
  const top=document.createElement('span');
  const tag=document.createElement('span');tag.className='challenge-card-tag';
  tag.textContent='ROOM 0'+(drill.room+1)+' · '+drill.subtitle.toUpperCase();
  const title=document.createElement('span');title.className='challenge-card-name';title.textContent=drill.name;
  top.append(tag,title);
  const instruction=document.createElement('span');instruction.className='challenge-card-rule';
  instruction.textContent=drill.instruction;
  const status=document.createElement('span');status.className='challenge-card-status';
  button.append(top,instruction,status);$('challengeCards').append(button);
 }
}
function renderChallenges(){
 ensureChallengeCards();
 for(const button of $('challengeCards').children){
  const drill=skillDrillById(button.dataset.drill),best=progress.drills?.[drill.id];
  button.querySelector('.challenge-card-status').textContent=best?
   'COMPLETED · BEST '+best+(best===1?' SHOT':' SHOTS')+' ↗':'PLAY CHALLENGE →';
  button.setAttribute('aria-label',drill.name+', '+drill.instruction+', '+
   (best?'completed, best '+best+' shots':'not yet completed'));
 }
}
function openChallenges(){
 if(active!=='lobby')return;
 hide('clubMenu');renderChallenges();show('challengeSheet');
 $('challengeCards').querySelector('button')?.focus();
}
function closeChallenges(){
 if($('challengeSheet').hidden)return;
 hide('challengeSheet');show('clubMenu');$('menuChallenges').focus();
}
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
 const ai=current.isAI(),busy=current.sim.moving,drill=current.kind==='drill',practice=current.kind==='practice'||drill;
  const drillInfo=drill?skillDrillById(current.drillId):null;
  $('gameScreen').dataset.drill=String(drill);
 $('gameScreen').dataset.practice=String(practice);
 $('twoCard').hidden=practice;
 const passAndPlay=current.players==='local'&&current.kind==='match';
 setText('turnLabel',current.over?drill?'DRILL FINISHED':'FINISHED':drill?'SKILL DRILL':current.ballInHand?passAndPlay?`P${current.turn+1} PLACING`:current.isAI()?'RIVAL PLACING':'BALL IN HAND':current.kind==='practice'?'PRACTICE':current.kind==='attract'?'EXHIBITION':current.break?passAndPlay?`P${current.turn+1} BREAK`:'THE BREAK':passAndPlay?`P${current.turn+1} TURN`:current.turn===0?'YOUR TURN':'RIVAL TURN');
 $('turnLabel').setAttribute('aria-label',passAndPlay?`Player ${current.turn+1}${current.ballInHand?' placing cue ball':current.break?' breaking':' to shoot'}`:$('turnLabel').textContent);
 const p1=current.groups[0]?.toUpperCase()||'OPEN',p2=current.groups[1]?.toUpperCase()||'OPEN';
 $('playerOne').innerHTML=drill?`YOU <small>${current.shots} / ${drillInfo.attempts} SHOTS · ONE TARGET</small>`:
   practice?`YOU <small>${current.shots} SHOTS · ${current.sim.balls.filter(b=>b.id!==0&&b.pocketed).length} POCKETED</small>`:`${current.kind==='attract'?'CLUB PRO':current.players==='local'?'PLAYER ONE':'YOU'} <small>${p1}</small>`;
 $('playerTwo').innerHTML=`${current.kind==='attract'?'ROOKIE':current.players==='local'?'PLAYER TWO':rival==='club'?'CLUB PRO':'ROOKIE'} <small>${p2}</small>`;
 const signature=current.groups.join(':')+':'+current.sim.balls.filter(b=>b.pocketed).map(b=>b.id).sort((a,b)=>a-b).join(',');
 if(signature!==lastScoreSignature){ballSlots($('ballsOne'),0);ballSlots($('ballsTwo'),1);lastScoreSignature=signature;}
 $('gameScreen').dataset.shots=String(current.shots);
 const completed=current.over&&current.kind!=='attract';
 $('matchResult').hidden=!completed;
 if(completed){
  const player=current.winner===0?(current.players==='local'?'PLAYER ONE':'YOU'):current.players==='local'?'PLAYER TWO':rival==='club'?'CLUB PRO':'ROOKIE';
  setText('matchResultTitle',drill?current.drillOutcome==='completed'?'DRILL COMPLETE':'TRY AGAIN':practice?'TABLE CLEARED':`${player} WINS`);
  const finalReason=current.history.at(-1)?.reason;
  const resultKind=practice?'practice':finalReason==='eight-cleared'?'clean':'foul';
  $('matchResult').dataset.finish=resultKind;
   if(drill){
    const best=progress.drills?.[current.drillId];
    setText('matchResultDetail',current.drillOutcome==='completed'?
     `${current.shots} ${current.shots===1?'SHOT':'SHOTS'} · ${best?progressAccess.writable?'SAVED BEST: '+best:'SESSION BEST: '+best:'COMPLETED'}`:
     'RESET AND TRY THE ANGLE AGAIN');
   }else
  setText('matchResultDetail',practice?`${current.shots} SHOTS THIS SESSION`:
     `${current.shots} SHOTS · ${resultKind==='clean'?'CLEAN 8-BALL':'FOUL ON THE 8'}`+
     (newlyEarnedCueCount?` · ${newlyEarnedCueCount} ${newlyEarnedCueCount===1?'CUE':'CUES'} EARNED`:''));
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
 updatePlacementTools();
 const help=drill&&!current.over?drillInfo.brief:
  current.ballInHand&&!current.over&&!current.isAI()?'TAP TO PREVIEW · DRAG TO PLACE':'';
 setText('guideBadge',help);
 $('guideBadge').classList.toggle('is-visible',Boolean(help));
 $('guideBadge').style.opacity=busy?'0':'.95';
}
function begin(kind,drillId=null){
 if(active!=='lobby')return;
 if(kind==='drill'&&!skillDrillById(drillId))return;
 if(kind==='drill')room=skillDrillById(drillId).room;
 lastScoreSignature='';newlyEarnedCueCount=0;matchElapsed=0;lastClockSecond=-1;previousShotAngles=[0,0];clearTableToast();placeGesture=null;$('collectedBalls').replaceChildren();hide('clubMenu');hide('challengeSheet');hide('setupSheet');hide('settingsSheet');hide('backdrop');placement=null;
 angle=kind==='drill'?skillDrillById(drillId).referenceAngle:0;spin={x:0,y:0};power=.50;shotMotion=null;pullProgress=0;tensionLevel=0;syncAim();setPower(50);setText('powerValue','PULL ↓');syncSpin();powerControl?.reset();
 current=new Game({kind,drillId,players:rival==='local'?'local':'cpu',difficulty:rival==='club'?'club':'rookie',notify,onPocket:animatePocket,onTurn:matchTurn});
 matchEventId=kind==='match'?newMatchId():null;
 drillEventId=kind==='drill'?newMatchId():null;
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
 active='lobby';current=null;matchEventId=null;drillEventId=null;placement=null;placeGesture=null;pointerMode=null;shotMotion=null;pullProgress=0;tensionLevel=0;clearTableToast();
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
 if(active!=='game')return;active='paused';clearTableToast();hide('spinSheet');hide('spinShade');hide('settingsSheet');hide('backdrop');
 setText('pauseSummary',current?.kind==='practice'?'Practice table':current?.kind==='drill'?'Skill challenge':current?.kind==='attract'?'Exhibition table':'Your match is on hold');
 show('pauseMenu');$('resumeMatch').focus();
}
function resumeMatch(){if(active!=='paused')return;hide('pauseMenu');hide('settingsSheet');hide('backdrop');active='game';$('pauseButton').focus();turnUI();}
function resetMatch(){
 if(!current)return;current.reset();matchEventId=current.kind==='match'?newMatchId():null;
 drillEventId=current.kind==='drill'?newMatchId():null;lastScoreSignature='';matchElapsed=0;lastClockSecond=-1;previousShotAngles=[0,0];clearTableToast();
 newlyEarnedCueCount=0;$('collectedBalls').replaceChildren();placement=null;placeGesture=null;angle=current.kind==='drill'?skillDrillById(current.drillId).referenceAngle:0;
 spin={x:0,y:0};syncAim();syncSpin();
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
function insideGameCanvas(clientX,clientY){const r=$('gameCanvas').getBoundingClientRect();
 return clientX>=r.left&&clientX<=r.right&&clientY>=r.top&&clientY<=r.bottom;}
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
function placementActive(){
 return current?.ballInHand&&!current?.over&&!current?.isAI()&&active!=='lobby';
}
function updatePlacementTools(){
 const enabled=Boolean(placementActive());
 if(enabled&&!placement)placement=initialCuePlacement(current.sim);
 $('gameScreen').dataset.placing=String(enabled);
 $('placementTools').hidden=!enabled;
 $('spinButton').hidden=enabled;
 $('aimWheel').closest('.aim-wheel-control').hidden=enabled;
 $('placeCueConfirm').disabled=!enabled||!placement?.candidate;
 if(enabled){
  const status=!placement?.candidate?'FIND OPEN SPACE':placement.legal?'READY':'SNAPS TO OPEN';
  if($('placementStatus').textContent!==status)setText('placementStatus',status);
 }
}
function previewPlacement(clientX,clientY,canvasOffset=0){
 if(!current||(!current.ballInHand&&pointerMode!=='break-place')||current.sim.moving)return;
 if(!insideGameCanvas(clientX,clientY)){placement=null;updatePlacementTools();return;}
 const px=localCanvasPoint(clientX,clientY);
 const pt=table.unproject(px.x,px.y-canvasOffset);
 placement=cuePlacementDraft(current.sim,pt.x,pt.y,{breakOnly:pointerMode==='break-place'});
 updatePlacementTools();
}
function commitPlacement(){
 if(!placementActive()||!placement?.candidate)return false;
 const {x,y}=placement.candidate;
 if(!current.placeCue(x,y)){
   setText('placementStatus','PICK AN OPEN SPOT');
   return false;
 }
 placement=null;placeGesture=null;
 if(motion)navigator.vibrate?.(8);
 tableToast('CUE BALL SET');turnUI();
 return true;
}
function resetPlacement(){
 if(!placementActive())return;
 placement=initialCuePlacement(current.sim);updatePlacementTools();
}
function nudgePlacement(dx,dy){
 if(!placementActive())return;
 const position=placement?.candidate||initialCuePlacement(current.sim)?.candidate;
 if(!position)return;
 placement=cuePlacementDraft(current.sim,Math.max(30,Math.min(970,position.x+dx)),
   Math.max(30,Math.min(470,position.y+dy)));
 updatePlacementTools();
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
 $('powerTrack').classList.toggle('max-charged',amount>=.96);
 if(amount>=.96)setText('powerValue','MAX');
 else if(amount>.005)setText('powerValue',Math.round(Math.max(.08,amount)*100)+'%');
 else setText('powerValue','PULL ↓');
}
function setPower(n){power=clamp(Number(n)/100,.08,1);setText('powerValue',`${Math.round(power*100)}%`);}
$('menuBtn').onclick=openMenu;$('closeMenu').onclick=()=>hide('clubMenu');
$('menuPractice').onclick=()=>begin('practice');$('menuSettings').onclick=openSettings;
$('menuChallenges').onclick=openChallenges;$('closeChallenges').onclick=closeChallenges;
$('challengeCards').onclick=event=>{
 const choice=event.target.closest('[data-drill]');
 if(choice){hide('challengeSheet');begin('drill',choice.dataset.drill);}
};
$('menuLocker').onclick=openLocker;$('closeLocker').onclick=closeLocker;
$('lockerEquip').onclick=()=>{saveProgress(equipCue(progress,lockerSelected));renderLocker();};
$('lockerFavorite').onclick=()=>{saveProgress(toggleFavorite(progress,lockerSelected));renderLocker();};
$('lockerGrid').onclick=event=>{const card=event.target.closest('[data-cue]');
 if(!card)return;lockerSelected=card.dataset.cue;renderLocker();card.focus();};
$('pauseButton').onclick=pauseMatch;$('resumeMatch').onclick=resumeMatch;
$('pauseSettings').onclick=openSettings;$('rerack').onclick=()=>{resetMatch();resumeMatch();};$('quitMatch').onclick=quitToLobby;
$('playAgain').onclick=()=>{if(active==='game'&&current?.over)resetMatch();};
$('resultMenu').onclick=quitToLobby;
$('closeSettings').onclick=closeSettings;
$('openRecord').onclick=openRecord;$('closeRecord').onclick=closeRecord;
$('exportRecord').onclick=downloadRecord;
$('resetRecord').onclick=()=>{
 $('recordMessage').textContent='';$('resetRecord').hidden=true;
 $('recordConfirm').hidden=false;$('cancelRecordReset').focus();
};
$('cancelRecordReset').onclick=()=>{
 $('recordConfirm').hidden=true;$('resetRecord').hidden=false;$('resetRecord').focus();
};
$('confirmRecordReset').onclick=confirmLocalReset;
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
$('placeCueConfirm').onclick=()=>commitPlacement();
$('placeCueReset').onclick=()=>resetPlacement();
$('gameCanvas').addEventListener('pointerdown',e=>{
 if(!canAct()&&!(active==='game'&&current?.ballInHand&&!current?.isAI()))return;
 if(pointerId!==null||e.pointerType==='mouse'&&e.button!==0||e.isPrimary===false)return;
 const cue=current.sim.cue(),pt=cuePoint(e.clientX,e.clientY);
 const place=current.ballInHand?'place':current.break&&current.shots===0&&cue&&Math.hypot(cue.x-pt.x,cue.y-pt.y)<35?'break-place':null;
 if(place){
   pointerMode=place;
   placeGesture={x:e.clientX,y:e.clientY,touch:e.pointerType==='touch',travel:0,offset:0,previous:placement};
   previewPlacement(e.clientX,e.clientY);
 }else if(cue&&!cue.pocketed&&startCueDrag(e,pt,cue)){pointerMode='cue-aim';}
 else return; // Aiming still starts on the rear cue shaft, never the guide.
 pointerId=e.pointerId;$('gameCanvas').setPointerCapture?.(pointerId);
 audio.unlock();e.preventDefault();
});
$('gameCanvas').addEventListener('pointermove',e=>{
 if(e.pointerId!==pointerId)return;
 if(pointerMode==='cue-aim')moveCueDrag(e.clientX,e.clientY);
 else if(pointerMode==='place'||pointerMode==='break-place'){
   if(placeGesture){
     placeGesture.travel=Math.hypot(e.clientX-placeGesture.x,e.clientY-placeGesture.y);
     // Small progressive offset during a touch drag keeps the ghost above
     // the finger without causing a jump on the initial grab.
     placeGesture.offset=placeGesture.touch?Math.min(24,Math.max(0,(placeGesture.travel-10)*.8)):0;
   }
   previewPlacement(e.clientX,e.clientY,placeGesture?.offset||0);
 }
 e.preventDefault();
});
$('gameCanvas').addEventListener('pointerup',e=>{
 if(e.pointerId!==pointerId)return;
 pointerId=null;
 if(pointerMode==='cue-aim')moveCueDrag(e.clientX,e.clientY);
 if(pointerMode==='place'||pointerMode==='break-place'){
   if(insideGameCanvas(e.clientX,e.clientY)){
     if(placeGesture)placeGesture.travel=Math.hypot(e.clientX-placeGesture.x,e.clientY-placeGesture.y);
     previewPlacement(e.clientX,e.clientY,placeGesture?.offset||0);
     if(pointerMode==='break-place'){
       const drop=placement?.candidate;
       if(drop&&current.placeBreakCue(drop.x,drop.y)){placement=null;turnUI();}
     }else if((placeGesture?.travel||0)>12)commitPlacement();
     // Taps create a stable preview: PLACE commits it, RESET repositions.
   }else if(pointerMode==='place')placement=placeGesture?.previous||initialCuePlacement(current.sim);
   else placement=null;
 }
 placeGesture=null;rearGesture=null;pointerMode=null;updatePlacementTools();
 e.preventDefault();
});
function cancelTablePointer(e){
 if(e.pointerId!==pointerId)return;
 pointerId=null;rearGesture=null;
 if(pointerMode==='place')placement=placeGesture?.previous||initialCuePlacement(current.sim);
 else if(pointerMode==='break-place')placement=null;
 placeGesture=null;pointerMode=null;updatePlacementTools();
}
$('gameCanvas').addEventListener('pointercancel',cancelTablePointer);
$('gameCanvas').addEventListener('lostpointercapture',cancelTablePointer);
window.addEventListener('keydown',e=>{
  if(!$('challengeSheet').hidden){
   if(e.key==='Escape'){e.preventDefault();closeChallenges();return;}
   if(e.key==='Tab'){
    const buttons=[...$('challengeSheet').querySelectorAll('button')];
    const first=buttons[0],last=buttons.at(-1);
    if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}
    else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}
   }
   return;
  }
  if(!$('recordSheet').hidden){
   if(e.key==='Escape'){e.preventDefault();closeRecord();return;}
   if(e.key==='Tab'){
    const actions=[...$('recordSheet').querySelectorAll('button:not([hidden]):not(:disabled)')]
      .filter(button=>button.offsetParent!==null);
    const first=actions[0],last=actions.at(-1);
    if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}
    else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}
   }
   return;
  }
  if(!$('lockerSheet').hidden){
    const options=[...$('lockerGrid').querySelectorAll('[data-cue]')];
    if(e.key==='Escape'){e.preventDefault();closeLocker();return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&document.activeElement?.dataset.cue){
      e.preventDefault();const index=CUES.findIndex(cue=>cue.id===document.activeElement.dataset.cue);
      const step=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='ArrowUp'?-3:3;
      const card=options[(index+step+CUES.length)%CUES.length];lockerSelected=card.dataset.cue;renderLocker();card.focus();return;
    }
    if(e.key==='Tab'){
      const focusable=[...$('lockerSheet').querySelectorAll('button:not(:disabled)')];
      const first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}
      else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}
    }
    return;
  }
  if(e.key==='Escape'){if(!$('spinSheet').hidden){closeSpin();return;}if(!$('settingsSheet').hidden)closeSettings();else if(!$('setupSheet').hidden)closeSetup();else if(!$('clubMenu').hidden)hide('clubMenu');else if(active==='paused')resumeMatch();else if(active==='game')pauseMatch();return;}
  if(!$('settingsSheet').hidden||!$('setupSheet').hidden||!$('clubMenu').hidden||!$('spinSheet').hidden)return;
  if(active!=='game'||['INPUT','BUTTON','TEXTAREA'].includes(document.activeElement?.tagName)&&document.activeElement?.type==='range')return;
  if(placementActive()){
    if(document.activeElement?.tagName==='BUTTON')return;
    const step=e.shiftKey?3:12;
    if(e.key==='ArrowLeft')nudgePlacement(-step,0);
    else if(e.key==='ArrowRight')nudgePlacement(step,0);
    else if(e.key==='ArrowUp')nudgePlacement(0,-step);
    else if(e.key==='ArrowDown')nudgePlacement(0,step);
    else if(e.key==='Enter'||e.code==='Space')commitPlacement();
    else if(e.key==='Backspace')resetPlacement();
    else return;
    e.preventDefault();return;
  }
  if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a'){angle-=Math.PI/720;syncAim();e.preventDefault();}
  if(e.key==='ArrowRight'||e.key.toLowerCase()==='d'){angle+=Math.PI/720;syncAim();e.preventDefault();}
  if(e.code==='Space'){e.preventDefault();fire();}
  if(e.key.toLowerCase()==='r'){pauseMatch();}
});
window.addEventListener('pagehide',()=>audio.suspend());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.suspend();else audio.resume();});
 try{audio.enabled=localStorage.getItem('ghostball-sound')!=='off';motion=localStorage.getItem('ghostball-motion')!=='off';powerSide=localStorage.getItem('ghostball-power-side')==='right'?'right':'left';}catch{}
 syncPowerSide();
syncSpin();syncEquippedCue();
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
    const frame={interactive:(!g.isAI()||!!cpuPose)&&!g.over&&!g.ballInHand&&pointerMode!=='break-place',aim:cpuPose||{angle,power,spin,drawback:pullProgress,strike},placement,placementZone:zone,fx:motion?g.fx:[]};
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
