/** Private casual multiplayer protocol spike. No transport or join UI yet.
 * This validates transport-bound sender identity against the authoritative Game;
 * a claimed seat in an untrusted packet never authorizes a shot.
 * The 32-bit digest detects ordinary stale state, NOT malicious cheating.
 */
export const PRIVATE_PROTOCOL_VERSION=1;
const MAX_ID=96;
const validId=id=>typeof id==='string'&&id.length>=8&&id.length<=MAX_ID&&
 /^[a-zA-Z0-9_-]+$/.test(id);
const refuse=reason=>({accepted:false,reason});
/** Deliberately excludes cue style, hall finish, animation and wall-clock timers.
 * The host periodically sends a full canonical snapshot as needed on join/
 * mismatch; this digest is not a security signature or independent arbiter.
 */
export function authoritativeDigest(game){
 if(!game?.sim||!Array.isArray(game.sim.balls))return null;
 const bytes=JSON.stringify({
  kind:game.kind,turn:game.turn,break:game.break,groups:game.groups,
  shots:game.shots,moving:game.sim.moving,ballInHand:game.ballInHand,
  foul:game.foul,over:game.over,winner:game.winner,
  balls:game.sim.balls.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.spin,b.follow,
   b.slipX,b.slipY,b.pocketed])
 });
 let hash=2166136261;
 for(let i=0;i<bytes.length;i++)hash=Math.imul(hash^bytes.charCodeAt(i),16777619);
 return (hash>>>0).toString(16).padStart(8,'0');
}
/** The local client may build this envelope; it conveys NO authority. */
export function shotCommand({sessionId,seat,turnEpoch,shotNo,angle,power,spin,preState}){
 return {version:PRIVATE_PROTOCOL_VERSION,type:'shot',sessionId,seat,turnEpoch,
  shotNo,angle,power,spin:{x:spin?.x??0,y:spin?.y??0},preState};
}
/** The untrusted client can request a ball-in-hand location, not assign one. */
export function placementCommand({sessionId,seat,turnEpoch,shotNo,x,y,preState}){
 return {version:PRIVATE_PROTOCOL_VERSION,type:'placement',sessionId,seat,turnEpoch,
  shotNo,x,y,preState};
}
/** The host supplies the seat bound to the live transport and an epoch advanced
 * at every turn handoff. A claimed packet seat never grants turn authority.
 */
function validateTurnCommand(game,command,context,type){
 if(game?.kind!=='match'||!game.sim)return refuse('not-match');
 if(!validId(context?.sessionId)||!Number.isSafeInteger(context?.turnEpoch)||
  context.turnEpoch<0||![0,1].includes(context.senderSeat))
  return refuse('invalid-session');
 if(!command||command.version!==PRIVATE_PROTOCOL_VERSION||command.type!==type||
  command.sessionId!==context.sessionId)return refuse('wrong-session');
 if(!Number.isSafeInteger(command.turnEpoch)||command.turnEpoch!==context.turnEpoch||
  !Number.isSafeInteger(command.shotNo)||command.shotNo!==game.shots+1)
  return refuse('stale-turn');
 if(command.seat!==context.senderSeat||context.senderSeat!==game.turn)
  return refuse('wrong-seat');
 return null;
}
/** The host may accept exactly one stroke per current turn/shot state. */
export function adjudicateShotCommand(game,command,context){
 const rejection=validateTurnCommand(game,command,context,'shot');
 if(rejection)return rejection;
 if(game.over||game.sim.moving||game.turnShot||game.ballInHand)
  return refuse('not-ready');
 const {angle,power,spin}=command;
 if(!Number.isFinite(angle)||Math.abs(angle)>2*Math.PI||
  !Number.isFinite(power)||power<.08||power>1||
  !spin||!Number.isFinite(spin.x)||!Number.isFinite(spin.y)||
  Math.hypot(spin.x,spin.y)>1.000001)
  return refuse('invalid-shot');
 const digest=authoritativeDigest(game);
 if(command.preState!==digest)return refuse('state-mismatch');
 if(!game.beginShot(angle,power,{x:spin.x,y:spin.y}))return refuse('not-ready');
 return {accepted:true,type:'shot-accepted',version:PRIVATE_PROTOCOL_VERSION,
  sessionId:context.sessionId,turnEpoch:context.turnEpoch,seat:context.senderSeat,
  shotNo:command.shotNo,preState:digest};
}

/** Ball-in-hand is a separate authoritative state transition preceding a shot.
 * Duplicate packets, bad geometry, wrong seats and stale digests cannot move
 * the host cue ball. This is a pure protocol adapter, not an Online mode.
 */
export function adjudicatePlacementCommand(game,command,context){
 const rejection=validateTurnCommand(game,command,context,'placement');
 if(rejection)return rejection;
 if(game.over||game.sim.moving||game.turnShot||!game.ballInHand)
  return refuse('not-ready');
 const {x,y}=command;
 if(!Number.isFinite(x)||!Number.isFinite(y)||!game.sim.canPlaceCue(x,y))
  return refuse('illegal-position');
 const digest=authoritativeDigest(game);
 if(command.preState!==digest)return refuse('state-mismatch');
 if(!game.placeCue(x,y))return refuse('not-ready');
 return {accepted:true,type:'placement-accepted',version:PRIVATE_PROTOCOL_VERSION,
  sessionId:context.sessionId,turnEpoch:context.turnEpoch,seat:context.senderSeat,
  shotNo:command.shotNo,x,y,preState:digest,postState:authoritativeDigest(game)};
}
