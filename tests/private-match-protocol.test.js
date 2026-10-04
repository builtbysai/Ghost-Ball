import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {authoritativeDigest,shotCommand,adjudicateShotCommand,
 placementCommand,adjudicatePlacementCommand,
 PRIVATE_PROTOCOL_VERSION} from '../src/private-match-protocol.js';
const context=()=>({sessionId:'test-private-2026',turnEpoch:0,senderSeat:0});
const fresh=()=>new Game({kind:'match',players:'local',seed:31});
const intent=(g,extra={})=>shotCommand({
 sessionId:context().sessionId,seat:0,turnEpoch:0,shotNo:g.shots+1,
 angle:0,power:.64,spin:{x:0,y:0},preState:authoritativeDigest(g),...extra
});
test('canonical pre-state ignores cosmetics but notices gameplay divergence',()=>{
 const a=fresh(),b=fresh();
 assert.equal(authoritativeDigest(a),authoritativeDigest(b));
 a.visualCue='juniper';a.hall=4;a.fx.push({type:'impact'});
 assert.equal(authoritativeDigest(a),authoritativeDigest(b));
 assert.equal(authoritativeDigest(null),null);
 b.sim.cue().x+=1;
 assert.notEqual(authoritativeDigest(a),authoritativeDigest(b));
});
test('the host accepts one transport-bound legal stroke with deterministic outcome',()=>{
 const a=fresh(),b=fresh(),message=intent(a),ctx=context();
 assert.equal(message.version,PRIVATE_PROTOCOL_VERSION);
 const first=adjudicateShotCommand(a,message,ctx),
   second=adjudicateShotCommand(b,message,ctx);
 assert.equal(first.accepted,true);
 assert.deepEqual(first,second);
 assert.equal(a.shots,1);
 assert.equal(adjudicateShotCommand(a,message,ctx).reason,'stale-turn','duplicate packet must never fire twice');
 let steps=0;
 while((a.turnShot||b.turnShot)&&steps++<12000){a.step();b.step();}
 assert.ok(steps<12000,'real game physics should settle on both peers');
 assert.deepEqual(a.history,b.history,'accepted commands must yield the same serialized rulings');
 assert.deepEqual(a.sim.snapshot(),b.sim.snapshot(),'accepted commands use unchanged common physics');
});
test('wrong sender, epochs, power/spin, versions and stale states never move balls',()=>{
 const game=fresh(),base=intent(game),ctx=context(),before=game.sim.snapshot();
 const reject=[
  [shotCommand({...base,seat:1}),'wrong-seat',ctx],
  [shotCommand({...base,turnEpoch:5}),'stale-turn',ctx],
  [shotCommand({...base,shotNo:99}),'stale-turn',ctx],
  [shotCommand({...base,power:2}),'invalid-shot',ctx],
  [shotCommand({...base,angle:Infinity}),'invalid-shot',ctx],
  [shotCommand({...base,spin:{x:1,y:1}}),'invalid-shot',ctx],
  [{...base,version:99},'wrong-session',ctx],
  [{...base,sessionId:'other-private'},'wrong-session',ctx],
  [{...base,preState:'00000000'},'state-mismatch',ctx],
  [base,'wrong-seat',{...ctx,senderSeat:1}],
  [base,'stale-turn',{...ctx,turnEpoch:1}]
 ];
 for(const [cmd,reason,transport] of reject){
  assert.equal(adjudicateShotCommand(game,cmd,transport).reason,reason);
  assert.deepEqual(game.sim.snapshot(),before);
  assert.equal(game.shots,0);
 }
 game.ballInHand=true;
 assert.equal(adjudicateShotCommand(game,base,ctx).reason,'not-ready');
 assert.deepEqual(game.sim.snapshot(),before);
});
test('clock handoff changes the authoritative turn and invalidates old pending shots',()=>{
 const g=fresh(),old=intent(g);
 assert.equal(g.expireShotClock(),true);
 assert.equal(adjudicateShotCommand(g,old,{...context(),turnEpoch:1}).reason,'stale-turn');
});

test('state digest tracks authoritative ball-in-hand without tracking cosmetics',()=>{
 const game=fresh(),before=authoritativeDigest(game);
 game.ballInHand=true;
 assert.notEqual(authoritativeDigest(game),before);
 game.ballInHand=false;game.foul=true;
 assert.notEqual(authoritativeDigest(game),before);
});
test('authoritative placement rejects tampering, duplicate, stale and illegal cues',()=>{
 const host=fresh(),guest=fresh();
 assert.equal(host.expireShotClock(),true);
 assert.equal(guest.expireShotClock(),true);
 const ctx={...context(),senderSeat:1,turnEpoch:1},before=host.sim.snapshot();
 const request=placementCommand({sessionId:ctx.sessionId,seat:1,turnEpoch:1,
  shotNo:host.shots+1,x:230,y:150,preState:authoritativeDigest(host)});
 assert.equal(request.version,PRIVATE_PROTOCOL_VERSION);
 const denied=[
  [{...request,seat:0},'wrong-seat',ctx],
  [{...request,turnEpoch:0},'stale-turn',ctx],
  [{...request,shotNo:99},'stale-turn',ctx],
  [{...request,preState:'00000000'},'state-mismatch',ctx],
  [{...request,x:Infinity},'illegal-position',ctx],
  [{...request,x:718,y:250},'illegal-position',ctx],
  [{...request,x:2},'illegal-position',ctx],
  [{...request,type:'shot'},'wrong-session',ctx],
  [request,'wrong-seat',{...ctx,senderSeat:0}],
  [request,'stale-turn',{...ctx,turnEpoch:2}]
 ];
 for(const [packet,reason,transport] of denied){
  assert.equal(adjudicatePlacementCommand(host,packet,transport).reason,reason);
  assert.deepEqual(host.sim.snapshot(),before);
  assert.deepEqual(host.history,guest.history);
  assert.equal(host.ballInHand,true);
 }
 const accepted=adjudicatePlacementCommand(host,request,ctx);
 assert.equal(accepted.accepted,true);
 assert.equal(accepted.type,'placement-accepted');
 assert.equal(accepted.preState,request.preState);
 assert.equal(accepted.postState,authoritativeDigest(host));
 assert.deepEqual(accepted,adjudicatePlacementCommand(guest,request,ctx));
 assert.equal(adjudicatePlacementCommand(host,request,ctx).reason,'not-ready');
 assert.deepEqual(host.history,guest.history);
 assert.deepEqual(host.sim.snapshot(),guest.sim.snapshot());
 // Placement and stroke must share the same canonical resulting state.
 const shot=shotCommand({sessionId:ctx.sessionId,seat:1,turnEpoch:1,
  shotNo:host.shots+1,angle:0,power:.64,spin:{x:0,y:0},preState:authoritativeDigest(host)});
 assert.equal(adjudicateShotCommand(host,shot,ctx).accepted,true);
 assert.equal(adjudicateShotCommand(guest,shot,ctx).accepted,true);
 let ticks=0;while((host.turnShot||guest.turnShot)&&ticks++<12000){
  host.step();guest.step();
 }
 assert.ok(ticks<12000);
 assert.deepEqual(host.history,guest.history);
 assert.deepEqual(host.sim.snapshot(),guest.sim.snapshot());
});
test('placement never bypasses readiness or no-ball-in-hand restriction',()=>{
 const game=fresh(),ctx=context();
 const request=placementCommand({sessionId:ctx.sessionId,seat:0,turnEpoch:0,
  shotNo:1,x:230,y:150,preState:authoritativeDigest(game)});
 const original=game.sim.snapshot();
 assert.equal(adjudicatePlacementCommand(game,request,ctx).reason,'not-ready');
 assert.deepEqual(game.sim.snapshot(),original);
 assert.equal(game.history.length,0);
});
