import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {authoritativeDigest,shotCommand,adjudicateShotCommand,
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
 assert.equal(adjudicateShotCommand(g,old,{...context(),turnEpoch:1}).reason,'wrong-seat');
});
