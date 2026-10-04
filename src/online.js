/**
 * Online private matches. Both devices run the same deterministic Game; only inputs travel.
 *  - The host owns the rack and answers every join with the full state (settings + exportState).
 *  - An input (shot, placement, break placement, choice) is applied locally at once and sent to the peer,
 *    which applies it as soon as its own table is at rest. Inputs from the wrong seat are refused.
 *  - When the table settles the host sends a digest; a guest whose replica disagrees asks for a resync and
 *    the host's state wins. The digest catches drift and stale state, it is not an anti-cheat signature.
 * Transports are tiny: {send(msg), onMessage(fn), onPeer(joined,left), close()}.
 */
import {authoritativeDigest} from './private-match-protocol.js';

export const ONLINE_VERSION=1;
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeRoomCode=(random=Math.random)=>Array.from({length:6},()=>ALPHABET[Math.floor(random()*ALPHABET.length)]).join('');
export const normalizeRoomCode=text=>String(text||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const validRoomCode=text=>{const c=normalizeRoomCode(text);return c.length===6&&[...c].every(ch=>ALPHABET.includes(ch));};
export const joinLink=(code,base='')=>`${base}${base.includes('?')?'&':'?'}join=${normalizeRoomCode(code)}`;

/** Two in-memory transports wired to each other, for tests. Delivery is asynchronous like a real network. */
export function loopbackPair(){
 const make=()=>({handlers:[],joined:[],left:[],peer:null,closed:false});
 const a=make(),b=make();a.peer=b;b.peer=a;
 const wrap=side=>({
  send(message){const to=side.peer;if(side.closed||to.closed)return;const copy=JSON.parse(JSON.stringify(message));queueMicrotask(()=>to.handlers.forEach(h=>h(copy)));},
  onMessage(fn){side.handlers.push(fn);},
  onPeer(join,leave){side.joined.push(join);side.left.push(leave);},
  connect(){queueMicrotask(()=>{side.joined.forEach(h=>h());side.peer.joined.forEach(h=>h());});},
  close(){side.closed=true;queueMicrotask(()=>side.peer.left.forEach(h=>h()));}
 });
 const ta=wrap(a),tb=wrap(b);
 return [ta,tb,()=>ta.connect()];
}

/** Same-browser transport (two tabs): used for local testing and as a graceful offline fallback. */
export function broadcastTransport(code){
 if(typeof BroadcastChannel==='undefined')throw new Error('BroadcastChannel unavailable');
 const id=Math.random().toString(36).slice(2),channel=new BroadcastChannel('ghostball-'+normalizeRoomCode(code));
 const handlers=[],joined=[],left=[];let peer=null,closed=false;
 const post=m=>{if(!closed)channel.postMessage({from:id,...m});};
 channel.onmessage=e=>{
  const m=e.data;if(!m||m.from===id)return;
  if(m.sys==='hi'){if(!peer){peer=m.from;post({sys:'hi'});joined.forEach(h=>h());}else if(m.from===peer)return;}
  else if(m.sys==='bye'){if(m.from===peer){peer=null;left.forEach(h=>h());}}
  else if(m.from===peer)handlers.forEach(h=>h(m.body));
 };
 post({sys:'hi'});
 return {
  send(body){if(peer)post({body});},
  onMessage(fn){handlers.push(fn);},
  onPeer(join,leave){joined.push(join);left.push(leave);},
  close(){post({sys:'bye'});closed=true;channel.close();}
 };
}

/** Internet transport: Trystero (WebRTC, signalled over public Nostr relays). Loaded on demand. */
export async function trysteroTransport(code,{appId='ghostball-pool-v1',loader=()=>import('../vendor/trystero-nostr.js')}={}){
 const {joinRoom}=await loader();
 const room=joinRoom({appId},normalizeRoomCode(code));
 const [send,get]=room.makeAction('gb');
 const handlers=[],joined=[],left=[];let peer=null;
 room.onPeerJoin(id=>{if(peer)return;peer=id;joined.forEach(h=>h());});
 room.onPeerLeave(id=>{if(id!==peer)return;peer=null;left.forEach(h=>h());});
 get((data,id)=>{if(id===peer)handlers.forEach(h=>h(data));});
 return {
  send(message){if(peer)send(message,peer);},
  onMessage(fn){handlers.push(fn);},
  onPeer(join,leave){joined.push(join);left.push(leave);},
  close(){try{room.leave();}catch{}}
 };
}

const finite=n=>Number.isFinite(n);
/**
 * One end of an online match.
 * `role` is 'host' (seat 0) or 'guest' (seat 1). Callbacks:
 *   getGame()            -> the live Game (null while none exists)
 *   getSettings()        -> host only: plain options the guest needs to build an identical Game
 *   onStart(settings,state) -> guest only: build a Game from the host's settings, then importState(state)
 *   onStatus(status)     -> 'waiting' | 'connected' | 'peer-left' | 'closed'
 *   onResync()           -> a replica was replaced by the host's state
 */
export class OnlineSession{
 constructor({transport,role,getGame,getSettings=()=>({}),onStart=()=>{},onStatus=()=>{},onResync=()=>{}}){
  this.transport=transport;this.role=role;this.seat=role==='host'?0:1;
  Object.assign(this,{getGame,getSettings,onStart,onStatus,onResync});
  this.queue=[];this.pendingCheck=null;this.status='waiting';this.checkedShots=-1;this.lastAim=0;this.resyncs=0;this.closed=false;
  transport.onMessage(m=>this.receive(m));
  transport.onPeer(()=>this.peerJoined(),()=>this.peerLeft());
 }
 setStatus(status){if(this.status===status)return;this.status=status;this.onStatus(status);}
 peerJoined(){
  if(this.role==='guest')this.transport.send({t:'hello',v:ONLINE_VERSION});
  else this.setStatus('connected');
 }
 peerLeft(){if(!this.closed)this.setStatus('peer-left');}
 /** Host: describe the table to a guest (also used to repair a diverged replica). */
 sendState(type){
  const game=this.getGame();if(!game)return;
  this.transport.send({t:type,v:ONLINE_VERSION,settings:this.getSettings(),state:game.exportState()});
 }
 receive(m){
  if(!m||typeof m!=='object'||m.v!==undefined&&m.v!==ONLINE_VERSION)return;
  const game=this.getGame();
  switch(m.t){
   case 'hello':if(this.role==='host'){this.setStatus('connected');this.queue.length=0;this.sendState('welcome');}break;
   case 'welcome':if(this.role==='guest'){this.queue.length=0;this.onStart(m.settings||{},m.state);this.setStatus('connected');}break;
   case 'state':if(this.role==='guest'&&game&&game.importState(m.state)){this.queue.length=0;this.resyncs++;this.onResync();}break;
   case 'resync':if(this.role==='host')this.sendState('state');break;
   case 'act':if(this.validAct(m))this.queue.push(m);break;
   case 'aim':if(game&&finite(m.angle)&&finite(m.power)&&game.isRemote()&&!game.sim.moving)
    game.remotePose={angle:m.angle,power:Math.min(1,Math.max(0,m.power)),drawback:Math.min(1,Math.max(0,m.drawback||0))};break;
   case 'check':if(this.role==='guest')this.pendingCheck=m;break;
   case 'bye':this.setStatus('peer-left');break;
  }
 }
 validAct(m){
  const ok=['shot','place','break-place','choose'].includes(m.k);
  if(!ok)return false;
  if(m.k==='shot')return finite(m.angle)&&finite(m.power)&&m.spin&&finite(m.spin.x)&&finite(m.spin.y);
  if(m.k==='place'||m.k==='break-place')return finite(m.x)&&finite(m.y);
  return typeof m.o==='string'&&m.o.length<16;
 }
 /** Tell the peer about a local input that has just been applied to this device's Game. */
 sendAct(act){if(!this.closed)this.transport.send({t:'act',v:ONLINE_VERSION,seat:this.seat,...act});}
 sendAim(pose,now=Date.now()){
  if(this.closed||now-this.lastAim<90||!pose)return;this.lastAim=now;
  this.transport.send({t:'aim',v:ONLINE_VERSION,angle:pose.angle,power:pose.power,drawback:pose.drawback||0});
 }
 /** Apply queued remote inputs once the table is at rest. Call every frame (and after tests step). */
 pump(){
  const game=this.getGame();if(!game||this.closed)return 0;
  let applied=0;
  while(this.queue.length&&!game.sim.moving&&!game.turnShot){
   const m=this.queue.shift(),turnOwner=m.k==='choose'?game.pendingChoice?.seat:game.turn;
   // The peer may only act for its own seat. Anything else means the replicas disagree.
   let ok=m.seat===1-this.seat&&turnOwner===m.seat&&!game.over;
   if(ok){
    if(m.k==='shot')ok=game.beginShot(m.angle,m.power,{x:m.spin.x,y:m.spin.y},Number.isInteger(m.call)?m.call:null,{pushOut:Boolean(m.pushOut)});
    else if(m.k==='place')ok=game.placeCue(m.x,m.y);
    else if(m.k==='break-place')ok=game.placeBreakCue(m.x,m.y);
    else ok=game.choose(m.o);
   }
   if(ok){applied++;game.remotePose=null;}
   else this.requestResync();
  }
  if(this.role==='host'&&!game.sim.moving&&!game.turnShot&&!this.queue.length&&game.shots!==this.checkedShots){
   this.checkedShots=game.shots;
   this.transport.send({t:'check',v:ONLINE_VERSION,shots:game.shots,digest:authoritativeDigest(game)});
  }
  if(this.pendingCheck)this.verify(game,this.pendingCheck);
  return applied;
 }
 /** A host digest waits until this replica has played the same number of shots and is at rest. */
 verify(game,m){
  if(game.sim.moving||game.turnShot||this.queue.length||game.shots<m.shots)return;
  this.pendingCheck=null;
  if(game.shots===m.shots&&authoritativeDigest(game)!==m.digest)this.requestResync();
 }
 requestResync(){
  if(this.role==='guest')this.transport.send({t:'resync',v:ONLINE_VERSION});
  else this.sendState('state');
 }
 close(){if(this.closed)return;this.transport.send({t:'bye',v:ONLINE_VERSION});this.closed=true;this.transport.close();this.setStatus('closed');}
}
