/** Private casual multiplayer protocol spike. No transport or join UI yet.
 * This validates TURN-BOUND sender identity against the authoritative Game;
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
  shots:game.shots,moving:game.sim.moving,
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
/** The host supplies senderSeat from its transport-to-seat binding and its
 * own monotonically increasing turnEpoch. Never trust both from the packet.
 */
export function adjudicateShotCommand(game,command,context){
 if(game?.kind!=='match'||!game.sim)return refuse('not-match');
 if(!validId(context?.sessionId)||!Number.isSafeInteger(context?.turnEpoch)||
  context.turnEpoch<0||![0,1].includes(context.senderSeat))
  return refuse('invalid-session');
 if(!command||command.version!==PRIVATE_PROTOCOL_VERSION||command.type!=='shot'||
  command.sessionId!==context.sessionId)return refuse('wrong-session');
 if(!Number.isSafeInteger(command.turnEpoch)||command.turnEpoch!==context.turnEpoch||
  !Number.isSafeInteger(command.shotNo)||command.shotNo!==game.shots+1)
  return refuse('stale-turn');
 if(command.seat!==context.senderSeat||context.senderSeat!==game.turn)
  return refuse('wrong-seat');
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
