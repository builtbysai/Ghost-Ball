/**
 * Smart table aiming. Two ways to aim share one surface and never need a mode
 * switch:
 *   - STICK: press on the visible cue behind the ball and turn it (relative
 *     rotation; the farther down the stick you hold, the finer the control).
 *   - POINT: press anywhere else on the cloth. A tap aims at that spot, or
 *     straight through an object ball if one was tapped; a drag keeps the aim
 *     locked on the finger (with a lead offset on touch so the finger never
 *     hides the target).
 * Pure and DOM-free so every decision is unit-tested. Aiming never shoots:
 * only the power rail, hold-Space or Enter can fire.
 */
import {TABLE} from './physics.js';

/** Finger travel (CSS px) below which a press is a tap, not a drag. */
export const TAP_SLOP=8;
/** On touch, the aim point sits this many px above the fingertip. */
export const TOUCH_LEAD=34;
export const AIM_MODES=Object.freeze(['smart','stick']);

export const leadFor=pointerType=>pointerType==='touch'||pointerType==='pen'?TOUCH_LEAD:0;
export const isTap=travel=>Number.isFinite(travel)&&travel<TAP_SLOP;

/** Bearing from the cue ball to a point, or null when the point is on the ball. */
export function bearingTo(cue,point){
 if(!cue||!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
 const dx=point.x-cue.x,dy=point.y-cue.y;
 return Math.hypot(dx,dy)<TABLE.radius*.9?null:Math.atan2(dy,dx);
}
/** The object ball under a tap (forgiving pad for fingers), nearest wins. */
export function pickObjectBall(balls,point,{pad=10}={}){
 let best=null,bestDistance=Infinity;
 for(const ball of balls){
  if(ball.id===0||ball.pocketed)continue;
  const d=Math.hypot(ball.x-point.x,ball.y-point.y);
  if(d<=TABLE.radius+pad&&d<bestDistance){best=ball;bestDistance=d;}
 }
 return best;
}
/**
 * Aim for a tap: through the centre of a tapped ball (a full-ball line the
 * player then refines with the wheel), otherwise at the tapped point.
 * Returns {angle,ball} or null if the tap cannot define a direction.
 */
export function tapAim(sim,point){
 const cue=sim?.cue();if(!cue||cue.pocketed)return null;
 const ball=pickObjectBall(sim.balls,point);
 const angle=bearingTo(cue,ball||point);
 return angle===null?null:{angle,ball:ball?ball.id:null};
}
/** What a press on the table means, given the aiming preference. */
export function classifyPress({onStick,mode='smart'}){
 if(onStick)return 'stick';
 return mode==='smart'?'point':null;
}
/** Smallest signed angle between two bearings, in (-PI, PI]. */
export const angleDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
