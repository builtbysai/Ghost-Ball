import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {OnlineSession,loopbackPair,makeRoomCode,validRoomCode,normalizeRoomCode,joinLink} from '../src/online.js';
import {authoritativeDigest} from '../src/private-match-protocol.js';

const tick=()=>new Promise(r=>setTimeout(r,0));
const settings={ruleset:'eight',official:false,seed:21};
const make=seat=>new Game({kind:'match',players:'online',localSeat:seat,clockAuthority:seat===0,seed:settings.seed,ruleset:settings.ruleset,shotClock:0});
async function pair(){
 const [ta,tb,connect]=loopbackPair();
 const ctx={host:make(0),guest:null,statuses:[]};
 ctx.hs=new OnlineSession({transport:ta,role:'host',getGame:()=>ctx.host,getSettings:()=>settings,onStatus:s=>ctx.statuses.push('h:'+s)});
 ctx.gs=new OnlineSession({transport:tb,role:'guest',getGame:()=>ctx.guest,onStart:(s,state)=>{ctx.guest=make(1);ctx.guest.importState(state);},onStatus:s=>ctx.statuses.push('g:'+s)});
 connect();for(let i=0;i<6;i++)await tick();
 return ctx;
}
const settle=async(ctx,rounds=40)=>{
 for(let i=0;i<rounds;i++){
  for(let k=0;k<400;k++){ctx.host.step();ctx.guest.step();}
  ctx.hs.pump();ctx.gs.pump();await tick();
 }
};

test('room codes are six unambiguous characters and links round-trip',()=>{
 for(let i=0;i<50;i++){const c=makeRoomCode();assert.ok(validRoomCode(c),c);assert.ok(!/[01OI]/.test(c));}
 assert.equal(normalizeRoomCode(' ab-c d23 '),'ABCD23');
 assert.ok(validRoomCode('abcd23'));assert.ok(!validRoomCode('ABC'));assert.ok(!validRoomCode('ABCDE0'));
 assert.equal(joinLink('abcd23','https://x.test/'),'https://x.test/?join=ABCD23');
});

test('a guest joining gets the host table and both replicas start identical',async()=>{
 const c=await pair();
 assert.deepEqual(c.statuses.filter(s=>s.startsWith('g:')),['g:connected']);
 assert.ok(c.statuses.includes('h:connected'));
 assert.equal(authoritativeDigest(c.host),authoritativeDigest(c.guest));
 assert.equal(c.guest.localSeat,1);assert.equal(c.guest.isRemote(),true,'the guest waits for the host break');
 assert.equal(c.host.isRemote(),false);
});

test('shots, placements and choices replicate in both directions and stay in lockstep',async()=>{
 const c=await pair();
 // host breaks
 assert.ok(c.host.beginShot(0,.95,{x:0,y:0}));c.hs.sendAct({k:'shot',angle:0,power:.95,spin:{x:0,y:0}});
 await settle(c,12);
 assert.equal(c.guest.shots,1);assert.equal(authoritativeDigest(c.host),authoritativeDigest(c.guest));
 // whoever is up now takes a shot through their own session
 for(let n=0;n<6&&!c.host.over;n++){
  const me=c.host.turn===0?c.host:c.guest,session=me===c.host?c.hs:c.gs;
  if(me.ballInHand){const spot={x:240,y:250};assert.ok(me.placeCue(spot.x,spot.y));session.sendAct({k:'place',...spot});await settle(c,3);}
  const angle=.3+n*.4;assert.ok(me.beginShot(angle,.5,{x:0,y:0},null,{}));
  session.sendAct({k:'shot',angle,power:.5,spin:{x:0,y:0}});await settle(c,10);
  assert.equal(c.host.shots,c.guest.shots);
  assert.equal(authoritativeDigest(c.host),authoritativeDigest(c.guest),'replicas drifted after shot '+(n+1));
  assert.equal(c.host.turn,c.guest.turn);
 }
 assert.equal(c.gs.resyncs,0);
});

test('an input for the wrong seat is refused and repaired by a resync to the host state',async()=>{
 const c=await pair();
 // guest forges a shot while it is the host's turn
 c.gs.sendAct({k:'shot',angle:1,power:.9,spin:{x:0,y:0}});
 for(let i=0;i<6;i++){c.hs.pump();await tick();}
 assert.equal(c.host.shots,0,'the host did not take the forged stroke');
 for(let i=0;i<6;i++){c.gs.pump();await tick();}
 assert.equal(c.guest.shots,0);assert.equal(authoritativeDigest(c.host),authoritativeDigest(c.guest));
});

test('a diverged guest is repaired by the digest check',async()=>{
 const c=await pair();
 c.guest.sim.balls[3].x+=5;
 c.host.beginShot(0,.2,{x:0,y:0});c.hs.sendAct({k:'shot',angle:0,power:.2,spin:{x:0,y:0}});
 await settle(c,16);
 assert.equal(authoritativeDigest(c.host),authoritativeDigest(c.guest));assert.ok(c.gs.resyncs>=1);
});

test('malformed packets are ignored and a leaving peer is reported',async()=>{
 const c=await pair();
 c.hs.receive({t:'act',k:'shot',angle:'x',power:1,spin:{x:0,y:0},seat:1});
 c.hs.receive({t:'act',k:'nope'});c.hs.receive(null);c.hs.receive({t:'welcome',v:99});
 assert.equal(c.hs.queue.length,0);
 c.gs.close();await tick();await tick();
 assert.ok(c.statuses.includes('h:peer-left'));
});

test('the live aim of the shooter shows on the waiting device',async()=>{
 const c=await pair();
 c.hs.sendAim({angle:.7,power:.4,drawback:.2},1000);await tick();
 assert.equal(c.guest.remotePose.angle,.7);
 assert.ok(c.guest.presentedCue);
 c.hs.sendAim({angle:.9,power:.4},1010);await tick();assert.equal(c.guest.remotePose.angle,.7,'aim updates are rate limited');
});

async function pair2(extra={}){
 const [ta,tb,connect]=loopbackPair();
 const ctx={host:make(0),guest:null,statuses:[],rematches:[]};
 ctx.hs=new OnlineSession({transport:ta,role:'host',cue:'ember',getGame:()=>ctx.host,getSettings:()=>settings,onStatus:s=>ctx.statuses.push('h:'+s),
  onRematch:()=>{ctx.host.reset(true);ctx.rematches.push('host-reset');ctx.hs.sendRematch();},...extra.host});
 ctx.gs=new OnlineSession({transport:tb,role:'guest',cue:'showman',getGame:()=>ctx.guest,onStart:(s,state)=>{ctx.guest=make(1);ctx.guest.importState(state);},
  onStatus:s=>ctx.statuses.push('g:'+s),onRematch:state=>{ctx.guest.importState(state);ctx.rematches.push('guest-state');},...extra.guest});
 connect();for(let i=0;i<6;i++)await tick();
 return ctx;
}

test('each player sees the other\'s cue name from the handshake',async()=>{
 const c=await pair2();
 assert.equal(c.gs.peerCue,'ember');assert.equal(c.hs.peerCue,'showman');
});

test('a rematch needs both players, then the host racks again and the guest receives the same table',async()=>{
 const c=await pair2();
 c.host.over=true;c.guest.over=true;
 c.hs.askRematch();await tick();await tick();
 assert.deepEqual(c.rematches,[],'one player asking is not enough');
 c.gs.askRematch();for(let i=0;i<8;i++)await tick();
 assert.deepEqual(c.rematches.sort(),['guest-state','host-reset']);
 assert.equal(c.guest.over,false);assert.equal(authoritativeDigest(c.host),authoritativeDigest(c.guest));
 assert.equal(c.host.turn,c.guest.turn);
 assert.deepEqual(c.hs.rematch,{me:false,them:false},'the request flags reset for the next game');
});

test('only the host\'s shot clock fines a player; the guest follows the host\'s timeout',async()=>{
 const c=await pair2();
 for(const g of [c.host,c.guest]){g.shotClockSeconds=5;g.shotRemaining=5;}
 assert.equal(c.guest.clockAuthority,false,'the guest never fines a player on its own clock');
 // the guest's local clock running out does nothing
 c.guest.shotClockKey='x';c.guest.shotRemaining=.01;c.guest.update(1);
 assert.equal(c.guest.foul,false);
 // the host's clock expires, the host sends a timeout, and both tables agree
 assert.ok(c.host.expireShotClock());c.hs.sendAct({k:'timeout'});
 for(let i=0;i<6;i++){c.gs.pump();await tick();}
 assert.equal(c.guest.turn,c.host.turn);assert.equal(c.guest.foul,true);
 // a guest cannot send a timeout at the host
 c.gs.sendAct({k:'timeout'});for(let i=0;i<4;i++){c.hs.pump();await tick();}
 assert.equal(c.hs.queue.length,0);
});

test('a dropped peer gets a reconnect window, then the game is marked abandoned',async()=>{
 const c=await pair2({host:{graceMs:50}});
 c.gs.close();await tick();await tick();
 assert.ok(c.statuses.includes('h:peer-left'));
 assert.ok(c.hs.graceLeft()>=0);
 await new Promise(r=>setTimeout(r,80));
 c.hs.pump();
 assert.equal(c.hs.status,'abandoned');
});
