import {slotModels,eightSlotModel,nineSlotModels,creditedBalls} from './score-slots.js';
import {Game} from './game.js';
import {TableRenderer,halls} from './render.js';
import {TABLE,POCKETS} from './physics.js';
import {Audio} from './audio.js';
import {bindPower,bindAimWheel,spinFromPoint,cueShaftHit,rearAimAngle,wrapAngle,aimStep,keyPullAmount,KEY_PULL_MIN_HOLD} from './touch-controls.js';
import {TAP_SLOP,leadFor,tapAim,bearingTo,classifyPress,AIM_MODES} from './aim-gestures.js';
import {planFlock,flockAt} from './rack-flock.js';
import {flyTable} from './table-transition.js';
import {cueGeometry,tensionStage} from './cue-feel.js';
import {PERSONAS,PERSONA_ORDER,personaFor,exhibitionPair} from './ai-personas.js';
import {cuePlacementDraft,initialCuePlacement} from './placement-guide.js';
import {CUES,cueUnlocked,cueById,equippedCue,equipCue,toggleFavorite,paintCuePreview} from './cue-catalog.js';
import {readLocalProgress,writeLocalProgress,recordLiveMatch,bestLegalRun,chooseRoom,
 freshProgress,exportLocalProgress,resetLocalProgress,recordLiveDrill} from './player-progress.js';
import {SKILL_DRILLS,skillDrillById} from './skill-drills.js';
import {recordSummary} from './record-summary.js';
import {decisiveShot,POCKET_LABELS} from './match-finish.js';
import {roomMastery} from './room-mastery.js';
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
let settingsOrigin='lobby',updateWaiting=false,powerSide='left',aimMode='smart',rules='casual',calledPocket=null,guideMode='full',wheelFine=false,clockSeconds=45,spinKeep=false,gameType='eight';
let matchElapsed=0,lastClockSecond=-1;
let lastScoreSignature='',pullProgress=0,tensionLevel=0,shotMotion=null;
let previousShotAngles=[0,0],toastTimeout=null;
let exhibitionIndex=Math.floor(Math.random()*6),exhibitionTimer=null;
let attract=new Game({kind:'attract'}),audio=new Audio();
let ambient=new TableRenderer($('attractCanvas'),{view:'perspective'}),table=new TableRenderer($('gameCanvas'),{view:'flat'});
function syncEquippedCue(){const cue=equippedCue(progress);ambient.setCue(cue.id);table.setCue(cue.id);}
function saveProgress(next){if(next===progress)return;progress=next;syncEquippedCue();renderRoomMastery();
 if(progressAccess.writable&&!writeLocalProgress(progress))progressAccess.writable=false;}
const setText=(id,value)=>{$(id).textContent=value;};
function savePreference(key,value){try{localStorage.setItem(key,value);}catch{}}

function notify(message){if(message)setText('matchAnnouncements',message);}
function clearTableToast(){
 if(toastTimeout!==null)clearTimeout(toastTimeout);
 toastTimeout=null;hide('tableToast');
}
function tableToast(message,kind='turn',duration=kind==='foul'?1700:kind==='hint'?4600:1150){
 clearTableToast();setText('tableToast',message);
 $('tableToast').dataset.kind=kind;show('tableToast');
 toastTimeout=setTimeout(()=>{hide('tableToast');toastTimeout=null;},duration);
}
// A turn change is announced by a centered banner that outlives the toast, so
// a fast CPU turn can never be mistaken for the human's own turn continuing.
const BANNER_MS=1900;
let bannerTimeout=null;
function clearTurnBanner(){
 if(bannerTimeout!==null)clearTimeout(bannerTimeout);
 bannerTimeout=null;hide('turnBanner');
}
function turnBanner(title,kicker,kind='turn'){
 clearTurnBanner();
 setText('turnBannerTitle',title);setText('turnBannerKicker',kicker||'');
 const banner=$('turnBanner');banner.dataset.kind=kind;banner.dataset.side=title.startsWith('YOUR')?'you':'rival';
 banner.hidden=false;
 // Restart the entrance animation when two banners arrive back to back.
 banner.classList.remove('is-in');void banner.offsetWidth;banner.classList.add('is-in');
 bannerTimeout=setTimeout(()=>{hide('turnBanner');bannerTimeout=null;},BANNER_MS);
}
const FOUL_TEXT={scratch:'cue ball potted','no-contact':'no ball hit','wrong-ball-first':'wrong ball first','no-rail':'no rail after contact','shot-clock':'shot clock expired'};
const FOUL_TAG={scratch:'SCRATCH','no-contact':'NO CONTACT','wrong-ball-first':'WRONG BALL','no-rail':'NO RAIL','shot-clock':'TIMEOUT'};
function seatName(seat){
 if(current?.players==='local')return `Player ${seat+1}`;
 if(current?.players==='ai')return current.personaAt(seat).name;
 return seat===0?'You':(current?.persona||personaFor(rival)).name;
}
const seatTable=seat=>current?.players==='local'||current?.players==='ai'?`${seatName(seat)}'s table`:seat===0?'Your table':`${seatName(seat)}'s table`;
const ballList=ids=>ids.length===1?`the ${ids[0]}`:`the ${ids.slice(0,-1).join(', ')} and ${ids.at(-1)}`;
/** One sentence that stays on screen until the next shot resolves. It is
 * derived only from the referee's onTurn event so it can never disagree with
 * the actual game state. */
function recapFor(event){
 const turn=event.turn,next=seatName(turn);
 if(event.type==='foul'){
  const offender=event.offender??event.shooter??1-turn;
  const why=FOUL_TEXT[event.reason]||'foul';
  const tail=`${next} ${next==='You'?'have':'has'} ball in hand${event.kitchen?' behind the head line':''}.`;
  if(event.reason==='shot-clock')return `${seatName(offender)}${seatName(offender)==='You'?'r':"'s"} shot clock expired. ${tail}`;
  return `${seatName(offender)} fouled: ${why}. ${tail}`;
 }
 const shooter=event.shooter??turn,name=seatName(shooter),potted=event.potted||[];
 const potText=potted.length?`${name} potted ${ballList(potted)}.`:`${name} missed.`;
 if(event.assignment)return `${potText} ${seatName(shooter)==='You'?'You have':name+' has'} ${event.assignment}.`;
 if(event.retain)return `${potText} ${name==='You'?'You shoot':name+' shoots'} again.`;
 return `${potText} ${next==='You'?'Your':next+"'s"} turn.`;
}
function setRecap(text,tone=''){
 const el=$('turnRecap');
 el.textContent=text||'';el.dataset.tone=tone;
 el.hidden=!text||current?.kind!=='match';
}
function matchTurn(event){
 if(active!=='game')return;
 if(event.type==='drill-continue'){
  tableToast('ONE SHOT LEFT · RECHECK THE ANGLE');return;
 }
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
  clearTableToast();clearTurnBanner();
  if(current.kind==='match'&&current.over&&matchEventId){
   const previouslyOwned=CUES.filter(cue=>cueUnlocked(progress,cue)).map(cue=>cue.id);
   const updated=recordLiveMatch(progress,{
    kind:'match',source:'live',id:matchEventId,
    at:new Date().toISOString(),shots:current.shots,winner:current.winner,
    players:current.players,difficulty:current.difficulty,room,
    reason:event.reason,
    bestRun:current.ruleset==='nine'?nineBestRun(current.history,0):current.players==='local'
      ?Math.max(bestLegalRun(current.history,0),bestLegalRun(current.history,1))
      :bestLegalRun(current.history,0)
   });
   // Matches discarded via quit, restart, replay or exhibition can never
   // mint achievements; a finished match is recorded at most once.
   matchEventId=null;
   newlyEarnedCueCount=CUES.filter(cue=>cueUnlocked(updated,cue)&&!previouslyOwned.includes(cue.id)).length;
   saveProgress(updated);
  }
  if(current.players==='ai'){clearTimeout(exhibitionTimer);exhibitionTimer=setTimeout(()=>{if(active==='game'&&current?.players==='ai'&&current.over){resetMatch();}},7000);}
  audio.play({type:event.practice||current.players==='local'||current.players==='ai'||event.winner===0?'win':'loss'});
  if(current.kind==='match')setRecap(`${seatName(event.winner)} ${seatName(event.winner)==='You'?'win':'wins'} the rack.`);
  turnUI(); // Show result before keyboard focus is transferred.
  $('playAgain').focus();
  return;
 }
 const watching=current.players==='ai',local=current.players==='local'||watching,human=event.turn===0&&!watching;
 const who=watching?seatName(event.turn).toUpperCase():local?`PLAYER ${event.turn+1}`:human?'YOU':'RIVAL';
 calledPocket=null;
 if(current.kind==='match')setRecap(recapFor(event),event.type==='foul'?'foul':'');
 const incoming=watching?`${who}'S TURN`:local?`PLAYER ${event.turn+1}'S TURN`:human?'YOUR TURN':`${seatName(1).toUpperCase()}'S TURN`;
 if(event.type==='foul'){
  const reason=FOUL_TAG[event.reason]||'FOUL';
  turnBanner(incoming,`${reason} · BALL IN HAND${event.kitchen?' BEHIND THE LINE':''}`,'foul');
  audio.play({type:'foul'});
 }else if(event.type==='turn'){
  if(event.assignment){
   tableToast(`${event.assignment.toUpperCase()} · ${local?who:human?'YOU':'RIVAL'}`,'turn');
  }else if(event.retain){
   tableToast(local?`${who} KEEPS TABLE`:human?'YOUR TABLE':'RIVAL KEEPS TABLE');
  }else{
   const potted=(event.potted||[]).length>0,shooter=seatName(event.shooter??1-event.turn).toUpperCase();
   turnBanner(incoming,potted?`${shooter} POTTED THE OTHER GROUP`:`${shooter} MISSED`);
  }
  if(local||human)audio.play({type:'turn'});
 }
}
function renderRoomMastery(){
 const badge=$('roomMastery'),model=roomMastery(progress,room);
 badge.hidden=!model;
 if(!model)return; // Preserve this guard if later venues have no authored mastery.
 setText('roomMasteryCount',model.count+' / '+model.total);
 setText('roomMasteryNext',model.complete?'ROOM MASTERED':'NEXT · '+model.next);
 badge.dataset.mastered=String(model.complete);
 badge.setAttribute('aria-label',halls[room].name+' mastery: '+model.count+' of 3. '+model.next);
 badge.title=model.steps.map(step=>(step.done?'✓ ':'○ ')+step.label).join('\n');
}
let shiftTimer=null;
function applyRoom(){const h=halls[room];audio.music.setHall(room);ambient.setHall(room);table.setHall(room);
 const appEl=$('app');
 if(appEl.dataset.hall!==undefined&&appEl.dataset.hall!==String(room)&&active==='lobby'){
  appEl.classList.remove('room-shift');void appEl.offsetWidth;appEl.classList.add('room-shift');
  clearTimeout(shiftTimer);shiftTimer=setTimeout(()=>appEl.classList.remove('room-shift'),560);
 }
 appEl.dataset.hall=String(room);document.documentElement.style.setProperty('--room-wall',h.wall);
 const selected=chooseRoom(progress,room,halls.length);
 if(selected!==progress){
  progress=selected;
  if(progressAccess.writable&&!writeLocalProgress(progress))progressAccess.writable=false;
 }
  document.documentElement.style.setProperty('--hall',h.felt);document.documentElement.style.setProperty('--room-aura',h.aura);setText('roomEyebrow',`ROOM 0${room+1} · ESTABLISHED ${h.year}`);
  setText('roomPlaque',String(h.year));setText('roomArt',h.name.toUpperCase());$('roomEyebrow').dataset.short=`ROOM 0${room+1} · ${h.year}`;setText('roomName',h.name);setText('roomDescription',h.detail);setText('roomCount',`0${room+1} / 0${halls.length}`);
  setText('playText',mode==='practice'?`Practice at ${h.name}`:`Break at ${h.name}`);
  renderRoomMastery();
  if(current)setText('roundLabel',h.name.toUpperCase());
}
function show(id){$(id).hidden=false;}function hide(id){$(id).hidden=true;}
function openSetup(){$('rivals').closest('.setting').hidden=mode==='practice';$('clockSetting').closest('.setting').hidden=mode==='practice';syncClock();$('gameType').closest('.setting').hidden=mode==='practice';syncGameType();syncRules();show('backdrop');show('setupSheet');$('closeSetup').focus();}
function closeSetup(){const wasOpen=!$('setupSheet').hidden;hide('setupSheet');if($('settingsSheet').hidden)hide('backdrop');if(wasOpen)$('openSetup').focus();}
const SETUP_NOTES={eight:'8-ball, casual: no called shots. Call the 8: when you are down to the black, name its pocket first; any other pocket loses the rack.',
 nine:'9-ball, casual: always hit the lowest ball first, pot the 9 to win. No push-out or three-foul rule yet.'};
function syncGameType(){
 all('#gameType [data-game]').forEach(b=>{const on=b.dataset.game===gameType;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
 const nine=gameType==='nine';
 $('ruleset').closest('.setting').hidden=nine||mode==='practice';
 setText('setupNote',SETUP_NOTES[gameType]);
}
function syncRules(){
 all('#ruleset [data-rules]').forEach(b=>{b.classList.toggle('selected',b.dataset.rules===rules);b.setAttribute('aria-pressed',String(b.dataset.rules===rules));});
}
function syncGuideMode(){
 all('[data-guide-mode]').forEach(b=>{const on=b.dataset.guideMode===guideMode;b.setAttribute('aria-pressed',String(on));b.classList.toggle('selected',on);});
 all('[data-wheel]').forEach(b=>{const on=(b.dataset.wheel==='fine')===wheelFine;b.setAttribute('aria-pressed',String(on));b.classList.toggle('selected',on);});
}
function syncSpinKeep(){
 all('[data-spin-keep]').forEach(b=>{const on=(b.dataset.spinKeep==='keep')===spinKeep;b.setAttribute('aria-pressed',String(on));b.classList.toggle('selected',on);});
}
function syncClock(){
 all('#clockSetting [data-clock]').forEach(b=>{const on=Number(b.dataset.clock)===clockSeconds;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
}
function syncAimMode(){
 all('[data-aim-mode]').forEach(b=>{const pressed=b.dataset.aimMode===aimMode;b.setAttribute('aria-pressed',String(pressed));b.classList.toggle('selected',pressed);});
}
function syncPowerSide(){
 $('gameScreen').classList.toggle('power-right',powerSide==='right');
 all('[data-power-side]').forEach(b=>{const pressed=b.dataset.powerSide===powerSide;b.setAttribute('aria-pressed',String(pressed));b.classList.toggle('selected',pressed);});
}
function openSettings(){syncPowerSide();syncAimMode();syncGuideMode();syncSpinKeep();settingsOrigin=active==='paused'?'pause':!$('clubMenu').hidden?'menu':'lobby';hide('clubMenu');hide('setupSheet');show('backdrop');show('settingsSheet');$('soundToggle').checked=audio.enabled;$('musicToggle').checked=audio.musicOn;$('motionToggle').checked=motion;$('closeSettings').focus();}
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
  tag.dataset.compact='ROOM 0'+(drill.room+1);
  const title=document.createElement('span');title.className='challenge-card-name';title.textContent=drill.name;
  top.append(tag,title);
  const instruction=document.createElement('span');instruction.className='challenge-card-rule';
  instruction.textContent=drill.instruction;
  const pockets=['TOP LEFT','TOP MIDDLE','TOP RIGHT','BOTTOM LEFT','BOTTOM MIDDLE','BOTTOM RIGHT'];
  instruction.dataset.compact=drill.targetId+' → '+(drill.requiredCushion?'RAIL → ':'')+pockets[drill.targetPocket];
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
let guideOrigin='menu';
function selectGuideTab(name,focus=false){
 all('[data-guide-tab]').forEach(tab=>{const on=tab.dataset.guideTab===name;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;if(on&&focus)tab.focus();});
 all('[data-guide-panel]').forEach(panel=>{panel.hidden=panel.dataset.guidePanel!==name;});
 $('guideSheet').querySelector('.guide-body').scrollTop=0;
}
function openGuide(origin){
 guideOrigin=origin;hide('clubMenu');hide('pauseMenu');selectGuideTab('controls');show('guideSheet');$('closeGuide').focus();
}
function closeGuide(){
 if($('guideSheet').hidden)return;
 hide('guideSheet');
 if(guideOrigin==='pause'){show('pauseMenu');$('pauseGuide').focus();}
 else{show('clubMenu');$('menuGuide').focus();}
}
function openMenu(){show('clubMenu');$('closeMenu').focus();}
function refreshMenu(){const ball=gameType==='nine'?'9-Ball':'8-Ball';
  setText('matchSummary',mode==='practice'?'Open practice table':(rival==='local'?`${ball} · Two players`:`${ball} vs ${personaFor(rival).name}`)+(rules==='call8'&&gameType==='eight'?' · Call the 8':''));
  setText('playSubtitle',mode==='practice'?'FREE PLAY · EXPLORE THE ANGLES':`CASUAL ${ball.toUpperCase()} · NO ENTRY FEE`);
  all('.mode[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));}
function resize(){ambient.resize();table.resize();}
let rackFlock=null;
function canAct(){return active==='game'&&current&&!rackFlock&&!current.over&&!current.sim.moving&&!current.isAI()&&!current.ballInHand;}
function nineBallSlots(container,player){
 const credited=creditedBalls(current.history,player),models=nineSlotModels(credited);
 const wasOpen=container.dataset.game!=='nine';container.dataset.game='nine';container.dataset.group='open';
 container.replaceChildren(...models.map((ball,index)=>{
  const el=document.createElement('span');el.setAttribute('role','listitem');
  if(ball.ghost){el.className='ball-slot ghost';el.setAttribute('aria-label',`Ball ${ball.slot} not potted by this player`);return el;}
  el.className='ball-slot assigned'+(ball.stripe?' striped':'')+(wasOpen?'':' just-assigned');
  el.style.setProperty('--slot-color',ball.color);el.style.setProperty('--slot-index',String(index));
  const numeral=document.createElement('b');numeral.className='ball-number';numeral.textContent=String(ball.id);el.append(numeral);
  el.setAttribute('aria-label',`Ball ${ball.id} potted`);return el;
 }));
 container.setAttribute('role','list');
 container.setAttribute('aria-label',credited.length?`Potted: ${credited.join(', ')}`:'No balls potted yet');
}
function ballSlots(container,player){
 if(current.ruleset==='nine'){nineBallSlots(container,player);return;}
 delete container.dataset.game;
 const group=current.groups[player],pocketed=current.sim.balls.filter(b=>b.pocketed).map(b=>b.id);
 const models=slotModels(current.groups,player,pocketed);
 const eight=eightSlotModel({groups:current.groups,pocketed,over:current.over,winner:current.winner,
  legalEight:current.history.at(-1)?.reason==='eight-cleared'},player);
 // Swap animation only when this tray's ownership just changed.
 const assigned=Boolean(group),justAssigned=assigned&&container.dataset.group==='open';
 container.dataset.group=assigned?group:'open';
 const slots=models.map((ball,index)=>{
  const el=document.createElement('span');el.setAttribute('role','listitem');
  el.style.setProperty('--slot-index',String(index));
  if(ball.ghost){
   el.className='ball-slot ghost';el.setAttribute('aria-label','Open table slot');
   return el;
  }
  el.className='ball-slot assigned'+(ball.stripe?' striped':'')+(ball.pocketed?' pocketed':'')+(justAssigned?' just-assigned':'');
  el.style.setProperty('--slot-color',ball.color);
  const numeral=document.createElement('b');numeral.className='ball-number';numeral.textContent=String(ball.id);el.append(numeral);
  el.setAttribute('aria-label',`Ball ${ball.id}${ball.pocketed?', pocketed':''}`);
  return el;
 });
 const last=document.createElement('span');
 last.className='ball-slot eight-slot';last.dataset.state=eight.state;last.setAttribute('role','listitem');
 last.style.setProperty('--slot-color',eight.color);
 const numeral=document.createElement('b');numeral.className='ball-number';numeral.textContent='8';last.append(numeral);
 last.setAttribute('aria-label',eight.state==='active'?'The 8 ball: on the 8':eight.state==='pocketed'?'The 8 ball: pocketed, rack won':'The 8 ball: not yet');
 container.replaceChildren(...slots,last);
 container.setAttribute('role','list');
 container.setAttribute('aria-label',group?`${group}: ${models.filter(b=>!b.pocketed).length} balls remaining${eight.state==='active'?', on the 8':''}`:'Open table. Groups are not assigned yet.');
}
/** Honest per-seat numbers from the referee log: balls potted and fouls committed. */
/** Most balls potted legally in one visit: the nine-ball run. */
function nineBestRun(history,seat){
 let run=0,best=0;
 for(const e of history){if(e?.kind!=='ruling')continue;if(e.shooter!==seat||e.result==='foul'){run=0;continue;}
  const n=(e.potRecords||[]).filter(p=>p.id>0).length;run=n?run+n:0;best=Math.max(best,run);}
 return Math.min(15,best);
}
function seatStats(history,seat){
 let potted=0,fouls=0;
 for(const entry of history){
  if(entry?.kind!=='ruling'||entry.shooter!==seat)continue;
  potted+=(entry.potRecords||[]).filter(p=>p.id>0&&p.id!==8).length;
  if(entry.result==='foul')fouls++;
 }
 return {potted,fouls};
}
function turnUI(){if(!current)return;
 const ai=current.isAI(),busy=current.sim.moving,drill=current.kind==='drill',practice=current.kind==='practice'||drill;
  const drillInfo=drill?skillDrillById(current.drillId):null;
  $('gameScreen').dataset.drill=String(drill);
 $('gameScreen').dataset.practice=String(practice);
 $('twoCard').hidden=practice;
 const passAndPlay=current.players==='local'&&current.kind==='match';
 setText('turnLabel',current.over?drill?'DRILL FINISHED':'FINISHED':drill?'SKILL DRILL':current.ballInHand?passAndPlay?`P${current.turn+1} PLACING`:current.players==='ai'?`${seatName(current.turn).toUpperCase()} PLACING…`:current.isAI()?`${seatName(1).toUpperCase()} PLACING…`:'BALL IN HAND':current.kind==='practice'?'PRACTICE':current.kind==='attract'?'EXHIBITION':current.break?passAndPlay?`P${current.turn+1} BREAK`:'THE BREAK':passAndPlay?`P${current.turn+1} TURN`:current.players==='ai'?`${seatName(current.turn).toUpperCase()}'S SHOT`:current.turn===0?'YOUR TURN':`${seatName(1).toUpperCase()}'S TURN`);
 $('turnLabel').setAttribute('aria-label',passAndPlay?`Player ${current.turn+1}${current.ballInHand?' placing cue ball':current.break?' breaking':' to shoot'}`:$('turnLabel').textContent);
 const nineLabel=seat=>`${creditedBalls(current.history,seat).length} POTTED`;
 const p1=current.ruleset==='nine'?nineLabel(0):current.groups[0]?.toUpperCase()||'OPEN TABLE',p2=current.ruleset==='nine'?nineLabel(1):current.groups[1]?.toUpperCase()||'OPEN TABLE';
 $('playerOne').innerHTML=drill?`YOU <small>${current.shots} / ${drillInfo.attempts} SHOTS · ONE TARGET</small>`:
   practice?`YOU <small>${current.shots} SHOTS · ${current.sim.balls.filter(b=>b.id!==0&&b.pocketed).length} POCKETED</small>`:`${current.players==='ai'?current.personaAt(0).name.toUpperCase():current.players==='local'?'PLAYER ONE':'YOU'} <small>${p1}</small>`;
 $('playerTwo').innerHTML=`${current.players==='ai'?current.personaAt(1).name.toUpperCase():current.players==='local'?'PLAYER TWO':current.persona.name.toUpperCase()} <small>${p2}</small>`;
 const signature=current.groups.join(':')+':'+current.ruleset+':'+current.history.length+':'+current.over+':'+current.winner+':'+current.sim.balls.filter(b=>b.pocketed).map(b=>b.id).sort((a,b)=>a-b).join(',');
 if(signature!==lastScoreSignature){ballSlots($('ballsOne'),0);ballSlots($('ballsTwo'),1);lastScoreSignature=signature;}
 $('gameScreen').dataset.shots=String(current.shots);
 const completed=current.over&&current.kind!=='attract';
 $('matchResult').hidden=!completed;
 if(completed){
  const player=current.players==='ai'?current.personaAt(current.winner).name.toUpperCase():current.winner===0?(current.players==='local'?'PLAYER ONE':'YOU'):current.players==='local'?'PLAYER TWO':current.persona.name.toUpperCase();
  setText('matchResultTitle',drill?current.drillOutcome==='completed'?'DRILL COMPLETE':'TRY AGAIN':practice?'TABLE CLEARED':`${player} ${player==='YOU'?'WIN':'WINS'}`);
  setText('playAgain',drill?'RETRY DRILL ↻':current.players==='ai'?'NEXT EXHIBITION ↻':"RACK 'EM AGAIN ↻");
  const finalReason=current.history.at(-1)?.reason;
  const resultKind=practice?'practice':finalReason==='eight-cleared'||finalReason==='nine-potted'?'clean':'foul';
  $('matchResult').dataset.finish=resultKind;
  const last=drill||practice?null:decisiveShot(current.history);
  $('resultLastShot').hidden=!last;
  if(last)setText('resultLastShotText',last.label);
  // Never spotlight an eight unless the referee recorded a legal pot.
  $('tableArea').dataset.finishSpot=last?.clean&&last.pocket!==null?'yes':'no';
  if(last?.clean&&last.pocket!==null){
   const [px,py]=POCKETS[last.pocket], [sx,sy]=table.project(px,py);
   $('tableArea').style.setProperty('--finish-x',`${clamp(sx/Math.max(1,table.w)*100,0,100)}%`);
   $('tableArea').style.setProperty('--finish-y',`${clamp(sy/Math.max(1,table.h)*100,0,100)}%`);
  }
   if(drill){
    const best=progress.drills?.[current.drillId];
    setText('matchResultDetail',current.drillOutcome==='completed'?
     `${current.shots} ${current.shots===1?'SHOT':'SHOTS'} · ${best?progressAccess.writable?'SAVED BEST: '+best:'SESSION BEST: '+best:'COMPLETED'}`:
     ({scratch:'SCRATCH · RESET AND TRY AGAIN','wrong-pocket':'WRONG POCKET · TRY AGAIN',
       'out-of-shots':'TWO SHOTS USED · TRY AGAIN',
        'no-bank':'NO CUSHION BANK · TRY AGAIN'})[current.history.at(-1)?.reason]||'RESET AND TRY AGAIN');
   }else
  setText('matchResultDetail',practice?`${current.shots} ${current.shots===1?'SHOT':'SHOTS'} THIS SESSION`:
     `${current.shots} ${current.shots===1?'SHOT':'SHOTS'} · `+(current.players==='local'||current.players==='ai'?'':(()=>{const s=seatStats(current.history,0);return `YOU POTTED ${s.potted} · ${s.fouls} ${s.fouls===1?'FOUL':'FOULS'} · `;})())+`${resultKind==='clean'?(current.ruleset==='nine'?'LEGAL 9':'CLEAN 8-BALL'):resultKind==='foul'&&current.history.at(-1)?.reason==='wrong-pocket'?'WRONG POCKET':'FOUL ON THE 8'}`+
     (newlyEarnedCueCount?` · ${newlyEarnedCueCount} ${newlyEarnedCueCount===1?'CUE':'CUES'} EARNED`:''));
 }
 const seconds=Math.ceil(current.shotRemaining);
 const timed=current.kind==='match'&&!current.over&&current.shotClockSeconds>0;
 const pct=timed?`${Math.max(0,current.shotRemaining/current.shotClockSeconds)*100}%`:'100%';
 const clockLive=timed&&!current.ballInHand&&!busy;
 for(const [i,id,clock] of [[0,'oneCard','clockOne'],[1,'twoCard','clockTwo']]){
  $(id).style.setProperty('--turn-progress',current.turn===i?pct:'100%');
  $(clock).textContent=String(seconds);$(clock).hidden=!timed||current.turn!==i||current.ballInHand;
  $(clock).classList.toggle('clock-warning',timed&&current.turn===i&&seconds<=10&&!current.ballInHand);
 }
 // The 45-second shot clock is THE timer during a turn; elapsed match time is demoted.
 const big=$('shotClock');
 big.hidden=!timed;
 if(timed){
  setText('shotClock',String(seconds));
  big.classList.toggle('clock-warning',clockLive&&seconds<=10);
  big.classList.toggle('is-idle',!clockLive);
  big.style.setProperty('--clock-progress',pct);
  big.dataset.owner=current.turn===0?'one':'two';
 }
 $('gameScreen').dataset.timed=String(timed);
 if(current.kind!=='match')setRecap('');
 else $('turnRecap').hidden=!$('turnRecap').textContent;
 $('oneCard').classList.toggle('playing',current.turn===0);$('twoCard').classList.toggle('playing',current.turn===1);
 const toolsDisabled=!canAct();
 for(const id of ['spinButton','aimLeft','aimRight'])$(id).disabled=toolsDisabled;
 $('powerTrack').classList.toggle('is-disabled',toolsDisabled);
 $('powerTrack').setAttribute('aria-disabled',String(!canAct()));$('aimWheel').setAttribute('aria-disabled',String(!canAct()));
 updatePlacementTools();
 const help=drill&&!current.over?drillInfo.brief:callingNeeded()&&!current.ballInHand&&!busy?(calledPocket===null?'CALL THE 8 · TAP A POCKET (OR PRESS C)':`8 CALLED · ${POCKET_LABELS[calledPocket]} · TAP ANOTHER TO CHANGE`):
  current.ruleset==='nine'&&!current.ballInHand&&!current.over&&!current.isAI()&&!busy?`HIT THE ${current.group.slice(4)} FIRST · POT THE 9 TO WIN`:current.ballInHand&&!current.over&&!current.isAI()?current.kitchen?'BEHIND THE HEAD LINE ONLY · DRAG TO PLACE':'TAP TO PREVIEW · DRAG TO PLACE':'';
 setText('guideBadge',help);
 $('guideBadge').classList.toggle('is-visible',Boolean(help));
 $('guideBadge').style.opacity=busy?'0':'.95';
}
function begin(kind,drillId=null){
 if(active!=='lobby')return;
 // A watched exhibition is a real refereed match between two personas, with no human seat.
 const exhibit=kind==='exhibition';if(exhibit)kind='match';
 if(kind==='drill'&&!skillDrillById(drillId))return;
 if(kind==='drill')room=skillDrillById(drillId).room;
 lastScoreSignature='';newlyEarnedCueCount=0;matchElapsed=0;lastClockSecond=-1;previousShotAngles=[0,0];clearTableToast();clearTurnBanner();cancelKeyPull();calledPocket=null;placeGesture=null;$('collectedBalls').replaceChildren();hide('clubMenu');hide('challengeSheet');hide('setupSheet');hide('settingsSheet');hide('backdrop');placement=null;
 angle=kind==='drill'?skillDrillById(drillId).referenceAngle:0;spin={x:0,y:0};power=.50;shotMotion=null;pullProgress=0;tensionLevel=0;syncAim();setPower(50);setText('powerValue','PULL ↓');syncSpin();powerControl?.reset();
 calledPocket=null;
 current=new Game({kind,drillId,players:exhibit?'ai':rival==='local'?'local':'cpu',persona:rival==='local'?'rookie':rival,seats:exhibit?exhibitionPair(exhibitionIndex++):null,ruleset:kind==='match'?gameType:'eight',callEight:!exhibit&&rules==='call8'&&gameType==='eight',shotClock:exhibit?0:clockSeconds,notify,onPocket:animatePocket,onTurn:matchTurn});
 matchEventId=kind==='match'&&!exhibit?newMatchId():null;
 $('gameScreen').dataset.exhibition=String(exhibit);
 drillEventId=kind==='drill'?newMatchId():null;
 if(kind==='attract'){current.turn=0;notify('An exhibition between our house rivals.');}
 setRecap(kind==='match'?(exhibit?`Exhibition: ${current.personaAt(0).name} vs ${current.personaAt(1).name}. ${current.personaAt(0).name} breaks.`:rival==='local'?'Player 1 breaks.':'Your break. Aim, pull the power bar and release.'):'');
 let needsHint=false;try{needsHint=localStorage.getItem('ghostball-controls-taught')!=='yes';}catch{}
 if(kind==='match'&&needsHint&&!exhibit)show('controlsHint');else hide('controlsHint');
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
  // Focus leaves the lobby button so Space / Enter / arrows drive the table at once.
  $('gameCanvas').focus({preventScroll:true});
  turnUI();
 };
 try{flyTable({app:$('app'),source:$('attractCanvas'),target:$('tableArea'),
   from:attract.sim,to:current.sim,hall:room,gameRenderer:table,done:finish,isActive:()=>active==='transition'});}
 catch(err){console.warn('Table entrance skipped',err);finish();}
}
function finishLobby(){
 rackFlock=null;active='lobby';current=null;matchEventId=null;drillEventId=null;placement=null;placeGesture=null;pointerMode=null;shotMotion=null;pullProgress=0;tensionLevel=0;clearTableToast();clearTurnBanner();setRecap('');cancelKeyPull();
 hide('spinShade');hide('spinSheet');hide('pauseMenu');hide('gameScreen');hide('controlsHint');
 $('gameScreen').classList.remove('entering','leaving');$('app').classList.remove('entering-match','leaving-match');
 $('ambient').style.visibility='';$('lobby').removeAttribute('aria-hidden');resize();$('menuBtn').focus();
 if(updateWaiting)window.location.reload();
}
function quitToLobby(){clearTimeout(exhibitionTimer);
 if(active!=='paused'&&active!=='game')return;
 closeSettings();cancelKeyPull();clearTurnBanner();hide('pauseMenu');hide('spinShade');hide('spinSheet');
 const leaving=current;active='transition';$('gameScreen').classList.add('leaving');$('app').classList.add('leaving-match');
 resize();ambient.draw(attract.sim,{fx:[]});
 try{flyTable({app:$('app'),source:$('gameCanvas'),target:$('attractCanvas'),from:leaving.sim,to:attract.sim,
   hall:room,gameRenderer:ambient,reverse:true,done:finishLobby,isActive:()=>active==='transition'});}
 catch(err){console.warn('Return transition skipped',err);finishLobby();}
}
function pauseMatch(){
 if(active!=='game')return;cancelKeyPull();active='paused';clearTableToast();clearTurnBanner();hide('spinSheet');hide('spinShade');hide('settingsSheet');hide('backdrop');
 const clock=`${String(Math.floor(matchElapsed/60)).padStart(2,'0')}:${String(Math.floor(matchElapsed%60)).padStart(2,'0')}`;
 const opponent=current?.players==='local'?'Two players':current?.players==='ai'?`${current.personaAt(0).name} vs ${current.personaAt(1).name}`:`vs ${personaFor(rival).name}`;
 setText('pauseSummary',current?.kind==='practice'?`Practice table · ${clock}`:current?.kind==='drill'?'Skill challenge':current?.kind==='attract'?'Exhibition table':
  `${opponent} · ${current?.ruleset==='nine'?'Casual 9-ball':current?.callEight?'Call the 8':'Casual 8-ball'} · ${clock}`);
 show('pauseMenu');$('resumeMatch').focus();
}
function resumeMatch(){if(active!=='paused')return;hide('pauseMenu');hide('settingsSheet');hide('backdrop');active='game';$('gameCanvas').focus({preventScroll:true});turnUI();}
const cloneBalls=balls=>balls.map(b=>({...b,orientation:[...(b.orientation||[1,0,0,0])]}));
/** Re-racking: the old table's balls (and those in the return rail) flock back into the triangle. */
function startRackFlock(before){
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!motion||reduced||!current||current.kind==='drill'||current.kind==='attract')return;
 const after=cloneBalls(current.sim.balls);
 if(before.every(b=>!b.pocketed&&after.some(a=>a.id===b.id&&Math.hypot(a.x-b.x,a.y-b.y)<2)))return;
 rackFlock={plan:planFlock(before,after,{seconds:1.5}),start:performance.now(),duration:1650,after};
}
function finishRackFlock(){
 if(!rackFlock)return;
 const final=flockAt(rackFlock.plan,1);
 for(const ball of current?.sim.balls||[]){const pose=final.find(p=>p.id===ball.id);if(pose){ball.orientation=[...pose.orientation];ball.rotation=pose.rotation;}}
 rackFlock=null;
}
function resetMatch(){
 if(!current)return;clearTimeout(exhibitionTimer);
 if(current.players==='ai')current.seatPersonas=exhibitionPair(exhibitionIndex++).map(personaFor);const before=cloneBalls(current.sim.balls);finishRackFlock();current.reset();startRackFlock(before);calledPocket=null;matchEventId=current.kind==='match'&&current.players!=='ai'?newMatchId():null;
 drillEventId=current.kind==='drill'?newMatchId():null;lastScoreSignature='';matchElapsed=0;lastClockSecond=-1;previousShotAngles=[0,0];clearTableToast();clearTurnBanner();cancelKeyPull();
 setRecap(current.kind==='match'?(current.players==='ai'?`Exhibition: ${current.personaAt(0).name} vs ${current.personaAt(1).name}.`:current.players==='local'?'Player 1 breaks.':'Your break. Aim, pull the power bar and release.'):'');
 newlyEarnedCueCount=0;$('collectedBalls').replaceChildren();placement=null;placeGesture=null;angle=current.kind==='drill'?skillDrillById(current.drillId).referenceAngle:0;
 spin={x:0,y:0};syncAim();syncSpin();
 setPower(50);powerControl.reset();$('powerTrack').classList.remove('impact');turnUI();
}
const pocketColors=['#f4f3e9','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d','#191918','#eabb32','#2764a5','#c14738','#604688','#d98935','#287a54','#73382d'];
const POCKET_DROP_MS=300; // the ball sinks on the table first (see Renderer pocket fx)
function animatePocket(event){
 if(active!=='game'||!current)return;
 const dock=$('collectedBalls'),ball=document.createElement('span');ball.className='return-ball'+(event.id>=9?' striped':'');
 if(event.id)dock.querySelectorAll(`[data-ball="${event.id}"]`).forEach(old=>old.remove()); // a re-spotted 8 never duplicates
 ball.dataset.ball=String(event.id);
 ball.style.setProperty('--ball-color',pocketColors[event.id]);ball.textContent=event.id||'';
 ball.setAttribute('aria-label',event.id?'Ball '+event.id+' pocketed':'Cue ball scratched');dock.append(ball);
 // After the drop the ball comes out of the gate at the far end of the return
 // rail and rolls along it to the next free place. Local layout units only, so
 // the rotated portrait layout behaves the same.
 const rail=$('ballReturn'),travel=Math.max(0,rail.clientWidth-18-(ball.offsetLeft+ball.offsetWidth));
 if(motion&&ball.animate&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  const roll=travel/(Math.PI*Math.max(6,ball.offsetWidth))*360;
  const flight=ball.animate([
   {transform:`translateX(${travel}px) rotate(${roll}deg) scale(.6)`,opacity:0,offset:0},
   {transform:`translateX(${travel*.92}px) rotate(${roll*.92}deg) scale(1)`,opacity:1,offset:.1},
   {transform:'translateX(0) rotate(0deg) scale(1)',opacity:1,offset:1}
  ],{duration:420+travel*1.15,delay:POCKET_DROP_MS,easing:'cubic-bezier(.25,.75,.3,1)',fill:'backwards'});
  if(event.id===0)flight.onfinish=()=>ball.remove();
 }else if(event.id===0)ball.remove();
}
let lastTickSecond=-1;
// The human's own clock ticks audibly through its last five seconds.
function tickShotClock(){
 const live=current.kind==='match'&&current.shotClockSeconds>0&&!current.over&&current.turn===0&&!current.isAI()&&
  !current.ballInHand&&!current.sim.moving;
 const left=Math.ceil(current.shotRemaining);
 if(!live||left>5||left<1){lastTickSecond=-1;return;}
 if(left!==lastTickSecond){lastTickSecond=left;audio.play({type:'tick',last:left===1});}
}
function liveMarker(now){
 if(!aimMarker)return null;
 const left=aimMarker.until-now;
 if(left<=0){aimMarker=null;return null;}
 return {x:aimMarker.x,y:aimMarker.y,alpha:Math.min(1,left/250)};
}
function updateClocks(elapsed){
 if(!current)return;
 tickShotClock();
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
 if(enabled&&!placement)placement=initialCuePlacement(current.sim,{breakOnly:current.kitchen});
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
 placement=cuePlacementDraft(current.sim,pt.x,pt.y,{breakOnly:pointerMode==='break-place'||Boolean(current.kitchen)});
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
 placement=initialCuePlacement(current.sim,{breakOnly:Boolean(current.kitchen)});updatePlacementTools();
}
function nudgePlacement(dx,dy){
 if(!placementActive())return;
 const position=placement?.candidate||initialCuePlacement(current.sim,{breakOnly:Boolean(current.kitchen)})?.candidate;
 if(!position)return;
 placement=cuePlacementDraft(current.sim,Math.max(30,Math.min(current.kitchen?265:970,position.x+dx)),
   Math.max(30,Math.min(470,position.y+dy)),{breakOnly:Boolean(current.kitchen)});
 updatePlacementTools();
}
function syncAim(){
 angle=Math.atan2(Math.sin(angle),Math.cos(angle));
 const degrees=angle*180/Math.PI,shown=Number(degrees.toFixed(2))||0;
 $('aimRange').value=String(degrees);
 $('aimWheel').setAttribute('aria-valuenow',String(Math.round(degrees)));
 $('aimWheel').setAttribute('aria-valuetext',shown+' degrees');
 // The visible readout and the wheel's grooves follow every input path.
 setText('aimReadout',shown+'°');
 $('aimWheel').style.setProperty('--wheel-turn',(degrees*3)%10+'px');
}
// On-screen fine-aim buttons are genuinely fine: half a degree, a tenth with Shift.
function nudgeAim(direction,fine,button=false){angle+=direction*(button?(fine?Math.PI/1800:Math.PI/360):aimStep(fine));syncAim();}
// Hold-to-pull keyboard shot. Power ramps on a timer, never on OS key repeat.
let keyPull=null;
function beginKeyPull(stamp=performance.now()){
 if(keyPull||!canAct()||powerControl.isDragging())return;
 if(callingNeeded()&&calledPocket===null){fire();return;} // explains the missing call
 keyPull={start:performance.now(),downStamp:stamp};
 audio.unlock();
}
function tickKeyPull(now){
 if(!keyPull)return;
 if(!canAct()){cancelKeyPull();return;}
 powerControl.setProgress(keyPullAmount((now-keyPull.start)/1000));
}
function cancelKeyPull(){
 if(!keyPull)return;
 keyPull=null;powerControl.reset();setPower(50);setText('powerValue','PULL ↓');
}
function releaseKeyPull(stamp=performance.now()){
 if(!keyPull)return;
 // Judge the hold by when the keys were pressed, not when a busy frame got
 // around to handling them: a slow device must not turn a tap into a shot.
 const held=Math.max(0,stamp-keyPull.downStamp)/1000;
 // A tap is not a shot: it silently cancels so accidental presses never dribble.
 if(held<KEY_PULL_MIN_HOLD||!canAct()){cancelKeyPull();return;}
 tickKeyPull(performance.now());
 keyPull=null;fire();
}
function keyboardHint(){
 if(!$('controlsHint').hidden)return; // the opening hint already teaches the keys
 try{if(localStorage.getItem('ghostball-key-hint')==='yes')return;localStorage.setItem('ghostball-key-hint','yes');}catch{}
 tableToast('HOLD SPACE TO PULL · RELEASE TO SHOOT · ←/→ AIM (SHIFT = FINE) · ESC CANCELS','hint');
}
function syncMute(){
 const on=audio.enabled,button=$('muteButton');
 button.dataset.muted=String(!on);
 button.setAttribute('aria-label',on?'Mute sound':'Unmute sound');
 button.title=on?'Mute sound (M)':'Unmute sound (M)';
 $('soundToggle').checked=on;
}
function setSound(on){
 audio.enabled=on;
 if(on)audio.unlock();else audio.suspend();
 savePreference('ghostball-sound',on?'on':'off');syncMute();
}
// "Call the 8": on the 8 the shooter names a pocket first (tap it, or press C).
const callingNeeded=()=>Boolean(current?.callEight&&current.group==='eight'&&!current.isAI()&&!current.over);
function callPocket(index){
 if(!callingNeeded()||!Number.isInteger(index)||index<0||index>=POCKET_LABELS.length)return;
 calledPocket=index;
 notify(`Eight called: ${POCKET_LABELS[index].toLowerCase()} pocket.`);
 tableToast(`8 CALLED · ${POCKET_LABELS[index]}`,'turn');
 turnUI();
}
function nearestPocket(world,reach=95){
 let best=null,bestDistance=reach;
 POCKETS.forEach(([x,y],index)=>{const d=Math.hypot(world.x-x,world.y-y);if(d<bestDistance){best=index;bestDistance=d;}});
 return best;
}
function fire(){
 if(!canAct())return;
 if(callingNeeded()&&calledPocket===null){
  tableToast('CALL A POCKET FOR THE 8 · TAP IT OR PRESS C','hint',2600);
  notify('Call a pocket for the eight before shooting.');return;
 }
 const strikingCue=current.sim.cue(),strength=power,shotAngle=angle;
 audio.unlock();
 if(current.beginShot(shotAngle,strength,spin,callingNeeded()?calledPocket:null)){
  calledPocket=null;
  // Each shot starts from the centre ball unless the player chose to keep their spin.
  if(!spinKeep&&(spin.x||spin.y)){spin={x:0,y:0};syncSpin();}
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
$('menuGuide').onclick=()=>openGuide('menu');$('pauseGuide').onclick=()=>openGuide('pause');$('closeGuide').onclick=closeGuide;
all('[data-guide-tab]').forEach(tab=>tab.onclick=()=>selectGuideTab(tab.dataset.guideTab));
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
$('playAgain').onclick=()=>{if(active==='game'&&current?.over){resetMatch();$('gameCanvas').focus();}};
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
all('[data-spin-keep]').forEach(b=>b.onclick=()=>{spinKeep=b.dataset.spinKeep==='keep';savePreference('ghostball-spin',spinKeep?'keep':'reset');syncSpinKeep();});
all('[data-guide-mode]').forEach(b=>b.onclick=()=>{guideMode=b.dataset.guideMode;savePreference('ghostball-guide',guideMode);syncGuideMode();});
all('[data-wheel]').forEach(b=>b.onclick=()=>{wheelFine=b.dataset.wheel==='fine';savePreference('ghostball-wheel',wheelFine?'fine':'normal');syncGuideMode();});
all('#clockSetting [data-clock]').forEach(b=>b.onclick=()=>{clockSeconds=Number(b.dataset.clock);savePreference('ghostball-clock',String(clockSeconds));syncClock();});
all('[data-aim-mode]').forEach(b=>b.onclick=()=>{aimMode=b.dataset.aimMode;savePreference('ghostball-aim-mode',aimMode);syncAimMode();});
$('soundToggle').onchange=event=>setSound(event.target.checked);
$('musicToggle').onchange=event=>{audio.setMusic(event.target.checked);if(event.target.checked)audio.unlock();savePreference('ghostball-music',event.target.checked?'on':'off');};
$('muteButton').onclick=event=>{setSound(!audio.enabled);if(event.detail)$('gameCanvas').focus({preventScroll:true});};
$('motionToggle').onchange=event=>{motion=event.target.checked;savePreference('ghostball-motion',motion?'on':'off');};
$('openSetup').onclick=openSetup;$('closeSetup').onclick=closeSetup;
for(const id of ['setupSheet','settingsSheet'])$(id).addEventListener('pointerdown',e=>{if(e.target===$(id)){if(id==='setupSheet')closeSetup();else closeSettings();}});$('backdrop').onclick=()=>{closeSetup();closeSettings();};
$('prevRoom').onclick=()=>{room=(room-1+halls.length)%halls.length;applyRoom();};
$('nextRoom').onclick=()=>{room=(room+1)%halls.length;applyRoom();};
all('.mode[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;refreshMenu();applyRoom();});
all('#gameType [data-game]').forEach(b=>b.onclick=()=>{gameType=b.dataset.game;savePreference('ghostball-game',gameType);syncGameType();refreshMenu();});
all('#ruleset [data-rules]').forEach(b=>b.onclick=()=>{rules=b.dataset.rules;savePreference('ghostball-rules',rules);syncRules();refreshMenu();});
const rivalBlurb=()=>setText('rivalBlurb',rival==='local'?'Pass and play on one device.':`${personaFor(rival).style}. ${personaFor(rival).blurb}`);
all('#rivals [data-rival]').forEach(b=>b.onclick=()=>{rival=b.dataset.rival;all('#rivals button').forEach(n=>n.classList.toggle('selected',n===b));rivalBlurb();refreshMenu();});
$('playBtn').onclick=()=>begin(mode);$('watchBtn').onclick=()=>begin('exhibition');
// A mouse click returns focus to the table so Space still shoots afterwards.
$('aimLeft').onclick=e=>{nudgeAim(-1,e.shiftKey,true);if(e.detail)$('gameCanvas').focus({preventScroll:true});};
$('aimRight').onclick=e=>{nudgeAim(1,e.shiftKey,true);if(e.detail)$('gameCanvas').focus({preventScroll:true});};
$('aimRange').oninput=e=>{angle=Number(e.target.value)*Math.PI/180;syncAim();};
const powerControl=bindPower({
 track:$('powerTrack'),handle:$('pullHandle'),canShoot:()=>Boolean(canAct()),
 onPower:n=>{setPower(n*100);audio.unlock();},
 onPull,
 onShoot:()=>{fire();return true;},
 onCancel:()=>{setPower(50);}
});
bindAimWheel({element:$('aimWheel'),canAim:()=>Boolean(canAct()),getAngle:()=>angle,
 setAngle:n=>{angle=n;syncAim();},getSensitivity:()=>wheelFine?.0006:.0015,
 onReset:()=>{angle=previousShotAngles[current?.turn||0]||0;syncAim();
  notify('Aim restored to the previous shot direction.');}});
function syncSpin(){
 const label=spin.y>.18?'FOLLOW':spin.y<-.18?'DRAW':'CENTER';
 const side=spin.x>.18?'RIGHT':spin.x<-.18?'LEFT':'';
 setText('spinLabel',[label,side].filter(Boolean).join(' · '));
 for(const id of ['spinDot','spinPreview']){const dot=$(id);dot.style.left=`${50+spin.x*39}%`;dot.style.top=`${50-spin.y*39}%`;}
}
let quickSpin=null,suppressSpinClick=false;
$('spinButton').onclick=()=>{
 if(suppressSpinClick){suppressSpinClick=false;return;}
 if(!canAct())return;show('spinShade');show('spinSheet');$('spinDone').focus();
};
// Quick spin: drag on the little cue ball to set the contact point without
// opening the full sheet. A tap still opens the sheet.
$('spinButton').addEventListener('pointerdown',e=>{
 if(!canAct()||(e.pointerType==='mouse'&&e.button!==0)||quickSpin)return;
 quickSpin={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
});
$('spinButton').addEventListener('pointermove',e=>{
 if(!quickSpin||e.pointerId!==quickSpin.id)return;
 if(!quickSpin.moved){
  if(Math.hypot(e.clientX-quickSpin.x,e.clientY-quickSpin.y)<6)return;
  quickSpin.moved=true;$('spinButton').setPointerCapture?.(e.pointerId);
 }
 spinPosition(e,$('spinButton').querySelector('.cueball-face'));e.preventDefault();
});
const endQuickSpin=e=>{
 if(!quickSpin||e.pointerId!==quickSpin.id)return;
 if(quickSpin.moved){suppressSpinClick=true;setTimeout(()=>{suppressSpinClick=false;},400);}
 quickSpin=null;
};
$('spinButton').addEventListener('pointerup',endQuickSpin);
$('spinButton').addEventListener('pointercancel',endQuickSpin);
function closeSpin(){hide('spinShade');hide('spinSheet');$('gameCanvas').focus({preventScroll:true});}
$('spinDone').onclick=closeSpin;$('spinShade').onclick=closeSpin;
$('spinReset').onclick=()=>{spin={x:0,y:0};syncSpin();};
let spinPointer=null;
function spinPosition(e,target=$('spinBall')){const rect=target.getBoundingClientRect();
 if(mobileLandscape()){spin=spinFromPoint(e.clientY-rect.top,rect.right-e.clientX,{left:0,top:0,width:rect.height,height:rect.width});}
 else spin=spinFromPoint(e.clientX,e.clientY,rect);syncSpin();}
$('spinBall').addEventListener('pointerdown',e=>{if(spinPointer!==null)return;spinPointer=e.pointerId;$('spinBall').setPointerCapture?.(spinPointer);spinPosition(e);});
$('spinBall').addEventListener('pointermove',e=>{if(e.pointerId===spinPointer)spinPosition(e);});
$('spinBall').addEventListener('pointerup',e=>{if(e.pointerId!==spinPointer)return;spinPosition(e);spinPointer=null;});
$('spinBall').addEventListener('pointercancel',()=>{spinPointer=null;});
let pointerId=null,pointGesture=null,aimMarker=null;
// Aim at a screen point (absolute), with the touch lead so a finger never hides it.
function aimAtScreenPoint(clientX,clientY,lead){
 const local=localCanvasPoint(clientX,clientY),world=table.unproject(local.x,local.y-lead);
 const bearing=bearingTo(current.sim.cue(),world);
 if(bearing===null)return;
 angle=bearing;syncAim();aimMarker={x:world.x,y:world.y,until:performance.now()+450};
}
function finishPointAim(clientX,clientY){
 const gesture=pointGesture;pointGesture=null;
 if(!gesture||gesture.moved)return;
 // A tap: through the middle of a tapped ball, else at the tapped spot.
 const world=cuePoint(clientX,clientY),aim=tapAim(current.sim,world);
 if(!aim)return;
 angle=aim.angle;syncAim();
 const ball=aim.ball?current.sim.balls.find(b=>b.id===aim.ball):null;
 aimMarker={x:ball?ball.x:world.x,y:ball?ball.y:world.y,until:performance.now()+700};
 if(aim.ball)notify(`Aimed through the ${aim.ball}. Fine-tune with the wheel, then pull to shoot.`);
}
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
 }else if(cue&&!cue.pocketed){
   // One surface, two ways in: grab the stick to turn it, or touch the
   // table itself to aim at that spot. No mode switch, no accidental shot.
   if(callingNeeded()){
     const pocket=nearestPocket(pt);
     if(pocket!==null){callPocket(pocket);audio.unlock();e.preventDefault();return;}
   }
   const kind=classifyPress({onStick:startCueDrag(e,pt,cue),mode:aimMode});
   if(kind==='stick')pointerMode='cue-aim';
   else if(kind==='point'&&canAct()){
     pointerMode='point-aim';
     pointGesture={x:e.clientX,y:e.clientY,lead:leadFor(e.pointerType),moved:false,startAngle:angle};
   }else return;
 }else return;
 pointerId=e.pointerId;$('gameCanvas').setPointerCapture?.(pointerId);
 audio.unlock();e.preventDefault();
});
$('gameCanvas').addEventListener('pointermove',e=>{
 if(e.pointerId!==pointerId)return;
 if(pointerMode==='cue-aim')moveCueDrag(e.clientX,e.clientY);
 else if(pointerMode==='point-aim'&&pointGesture){
   if(!pointGesture.moved&&Math.hypot(e.clientX-pointGesture.x,e.clientY-pointGesture.y)>=TAP_SLOP)pointGesture.moved=true;
   if(pointGesture.moved)aimAtScreenPoint(e.clientX,e.clientY,pointGesture.lead);
 }
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
 if(pointerMode==='point-aim')finishPointAim(e.clientX,e.clientY);
 if(pointerMode==='place'||pointerMode==='break-place'){
   if(insideGameCanvas(e.clientX,e.clientY)){
     if(placeGesture)placeGesture.travel=Math.hypot(e.clientX-placeGesture.x,e.clientY-placeGesture.y);
     previewPlacement(e.clientX,e.clientY,placeGesture?.offset||0);
     if(pointerMode==='break-place'){
       const drop=placement?.candidate;
       if(drop&&current.placeBreakCue(drop.x,drop.y)){placement=null;turnUI();}
     }else if((placeGesture?.travel||0)>12)commitPlacement();
     // Taps create a stable preview: PLACE commits it, RESET repositions.
   }else if(pointerMode==='place')placement=placeGesture?.previous||initialCuePlacement(current.sim,{breakOnly:Boolean(current.kitchen)});
   else placement=null;
 }
 placeGesture=null;rearGesture=null;pointerMode=null;updatePlacementTools();
 e.preventDefault();
});
function cancelTablePointer(e){
 if(e.pointerId!==pointerId)return;
 pointerId=null;rearGesture=null;
 if(pointerMode==='point-aim'&&pointGesture){angle=pointGesture.startAngle;syncAim();pointGesture=null;aimMarker=null;}
 if(pointerMode==='place')placement=placeGesture?.previous||initialCuePlacement(current.sim,{breakOnly:Boolean(current.kitchen)});
 else if(pointerMode==='break-place')placement=null;
 placeGesture=null;pointerMode=null;updatePlacementTools();
}
$('gameCanvas').addEventListener('pointercancel',cancelTablePointer);
$('gameCanvas').addEventListener('lostpointercapture',cancelTablePointer);
window.addEventListener('keydown',e=>{
  if(!$('guideSheet').hidden){
   if(e.key==='Escape'){e.preventDefault();closeGuide();return;}
   const tabs=[...$('guideSheet').querySelectorAll('[data-guide-tab]')],index=tabs.findIndex(t=>t===document.activeElement);
   if(index>=0&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){
    e.preventDefault();selectGuideTab(tabs[(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length].dataset.guideTab,true);return;
   }
   if(e.key==='Tab'){
    const focusable=[...$('guideSheet').querySelectorAll('button:not([tabindex="-1"]),[tabindex="0"]')].filter(el=>el.offsetParent!==null);
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}
    else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}
   }
   return;
  }
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
  if(e.key==='Escape'){if(keyPull){e.preventDefault();cancelKeyPull();return;}if(!$('spinSheet').hidden){closeSpin();return;}if(!$('settingsSheet').hidden)closeSettings();else if(!$('setupSheet').hidden)closeSetup();else if(!$('clubMenu').hidden)hide('clubMenu');else if(active==='paused')resumeMatch();else if(active==='game')pauseMatch();return;}
  if(!$('settingsSheet').hidden||!$('setupSheet').hidden||!$('clubMenu').hidden||!$('spinSheet').hidden)return;
  if(active!=='game'||['INPUT','BUTTON','TEXTAREA'].includes(document.activeElement?.tagName)&&document.activeElement?.type==='range')return;
  if(placementActive()){
    if(document.activeElement?.tagName==='BUTTON'&&document.activeElement.closest('#gameScreen'))return;
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
  // A focused slider or wheel has already handled its own arrow keys.
  if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
  // Only a button inside the match keeps its native Space/Enter; a lobby button
  // that merely retained focus after "Play" must never swallow the shot.
  const focused=document.activeElement,key=e.key.toLowerCase(),
   onButton=focused?.tagName==='BUTTON'&&Boolean(focused.closest('#gameScreen'));
  if(e.key==='ArrowLeft'||key==='a'){keyboardHint();nudgeAim(-1,e.shiftKey);e.preventDefault();}
  else if(e.key==='ArrowRight'||key==='d'){keyboardHint();nudgeAim(1,e.shiftKey);e.preventDefault();}
  else if(e.code==='Space'){
   // Buttons keep their native Space activation.
   if(onButton)return;
   e.preventDefault();
   if(!e.repeat&&canAct()){keyboardHint();beginKeyPull(e.timeStamp);}
  }
  else if(e.key==='Enter'){if(!onButton&&!keyPull){e.preventDefault();fire();}}
  else if(key==='m'&&!e.repeat){setSound(!audio.enabled);}
  else if(key==='c'&&callingNeeded()){callPocket(calledPocket===null?0:(calledPocket+1)%POCKET_LABELS.length);e.preventDefault();}
  else if(key==='r'){pauseMatch();}
});
window.addEventListener('keyup',e=>{
 if(e.code==='Space'&&keyPull){e.preventDefault();releaseKeyPull(e.timeStamp);}
});
window.addEventListener('blur',cancelKeyPull);
window.addEventListener('pagehide',()=>audio.suspend());
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelKeyPull();audio.suspend();}else audio.resume();});
 try{audio.enabled=localStorage.getItem('ghostball-sound')!=='off';audio.musicOn=localStorage.getItem('ghostball-music')!=='off';motion=localStorage.getItem('ghostball-motion')!=='off';powerSide=localStorage.getItem('ghostball-power-side')==='right'?'right':'left';const savedAim=localStorage.getItem('ghostball-aim-mode');if(AIM_MODES.includes(savedAim))aimMode=savedAim;rules=localStorage.getItem('ghostball-rules')==='call8'?'call8':'casual';const g=localStorage.getItem('ghostball-guide');if(['full','short','off'].includes(g))guideMode=g;gameType=localStorage.getItem('ghostball-game')==='nine'?'nine':'eight';wheelFine=localStorage.getItem('ghostball-wheel')==='fine';spinKeep=localStorage.getItem('ghostball-spin')==='keep';clockSeconds=localStorage.getItem('ghostball-clock')==='0'?0:45;}catch{}
 syncPowerSide();syncAimMode();syncGuideMode();syncSpinKeep();syncClock();syncRules();syncGameType();syncMute();syncAim();
syncSpin();syncEquippedCue();
applyRoom();refreshMenu();hide('gameScreen');
let previous=performance.now(),acc=0,uiTimer=0;
function frame(now){requestAnimationFrame(frame);let elapsed=Math.min((now-previous)/1000,.05);previous=now;
  if(document.hidden)return;
  if(active==='transition'||active==='paused'){previous=now;acc=0;return;}
  const g=active==='lobby'?attract:current;if(!g)return;
  if(rackFlock&&active!=='lobby'){
   const t=(now-rackFlock.start)/rackFlock.duration;
   if(t>=1)finishRackFlock();
   else{
    const bodies=new Map(g.sim.balls.map(b=>[b.id,b])),poses=flockAt(rackFlock.plan,t)
     .map(pose=>({...bodies.get(pose.id),...pose}));
    table.draw({balls:poses,moving:false,cue:()=>poses.find(b=>b.id===0)},
     {interactive:false,aim:null,placement:null,fx:[],callPocket:null});
    updateClocks(elapsed);return;
   }
  }
  acc+=elapsed;let iterations=0;
  // Avoid spiral of death after tab suspension or background throttling.
  while(acc>=TABLE.step&&iterations++<14){g.step({audio,haptics:motion});acc-=TABLE.step;}
  if(iterations>=14)acc=0;
  g.update(elapsed,{audio,haptics:motion});
  if(active==='lobby'){const pose=g.presentedCue;ambient.draw(g.sim,{interactive:!!pose&&!g.sim.moving,aim:pose,fx:motion?g.fx:[]});}
  else{tickKeyPull(now);updateClocks(elapsed);const strokeTime=shotMotion?(now-shotMotion.start)/115:1;
   const strike=shotMotion&&strokeTime<1?{...shotMotion,progress:Math.max(0,strokeTime)}:null;
   if(shotMotion&&strokeTime>=1){shotMotion=null;$('powerTrack').classList.remove('impact');}
   const cpuPose=g.isAI()?g.presentedCue:null;
   const zone=active==='game'&&!g.over&&!g.sim.moving&&!g.isAI()
     ?g.ballInHand?(g.kitchen?'break':'all'):pointerMode==='break-place'?'break':null:null;
    const frame={interactive:(!g.isAI()||!!cpuPose)&&!g.over&&!g.ballInHand&&pointerMode!=='break-place',aim:cpuPose||{angle,power,spin,drawback:pullProgress,strike,marker:liveMarker(now),guideMode},placement,placementZone:zone,fx:motion?g.fx:[],targetBall:g.ruleset==='nine'&&!g.over&&!g.sim.moving&&!g.ballInHand?Number(g.group.slice(4)):null,callPocket:g.callEight&&g.group==='eight'?(g.isAI()?(g.previewShot?.pocket??null):calledPocket):null};
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
