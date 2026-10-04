/** Saved shot highlights: compact, validated, shareable as a plain text code.
 * Physics is deterministic, so the table before the stroke plus the stroke is the whole shot. */
import {makeBall} from './physics.js';

export const MAX_HIGHLIGHTS=12;
const CODE_PREFIX='GB1.';
const b64=text=>btoa(unescape(encodeURIComponent(text))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=code=>decodeURIComponent(escape(atob(code.replace(/-/g,'+').replace(/_/g,'/'))));

/** Turn a shot into a copyable code. `shot.balls` are the balls before the stroke. */
export function encodeShot({balls,angle,power,spin,room=0,ruleset='eight',pots=0}){
 const payload={v:1,r:room,g:ruleset,p:pots,a:angle,w:power,s:[spin?.x??0,spin?.y??0],
  // Full precision on purpose: the replay is only exact if the starting table is.
  b:balls.map(ball=>[ball.id,ball.x,ball.y,ball.pocketed?1:0])};
 return CODE_PREFIX+b64(JSON.stringify(payload));
}
/** Validate and rebuild a shot from a code; anything malformed or out of range is refused. */
export function decodeShot(code){
 try{
  const text=String(code||'').trim();
  if(!text.startsWith(CODE_PREFIX)||text.length>4000)return null;
  const data=JSON.parse(unb64(text.slice(CODE_PREFIX.length)));
  if(data?.v!==1||!Array.isArray(data.b)||data.b.length<2||data.b.length>16)return null;
  const ok=(n,lo,hi)=>Number.isFinite(n)&&n>=lo&&n<=hi;
  if(!ok(data.a,-7,7)||!ok(data.w,.05,1)||!Array.isArray(data.s)||!ok(data.s[0],-1,1)||!ok(data.s[1],-1,1))return null;
  const seen=new Set();
  const balls=data.b.map(entry=>{
   if(!Array.isArray(entry)||entry.length!==4)throw new RangeError('ball');
   const [id,x,y,gone]=entry;
   if(!Number.isInteger(id)||id<0||id>15||seen.has(id)||!ok(x,-60,1060)||!ok(y,-60,560)||(gone!==0&&gone!==1))throw new RangeError('ball');
   seen.add(id);const ball=makeBall(id,x,y);ball.pocketed=gone===1;return ball;
  });
  if(!seen.has(0)||balls.find(b=>b.id===0).pocketed)return null;
  return {balls,angle:data.a,power:data.w,spin:{x:data.s[0],y:data.s[1]},room:Number.isInteger(data.r)?data.r:0,
   ruleset:typeof data.g==='string'?data.g.slice(0,16):'eight',pots:Number.isInteger(data.p)?data.p:0};
 }catch{return null;}
}
/** Keep the best shots first (most balls, then newest); one entry per match id. */
export function addHighlight(progress,entry){
 if(!progress||!entry||typeof entry.id!=='string'||typeof entry.shot!=='string'||!decodeShot(entry.shot))return progress;
 const list=(progress.highlights||[]).filter(item=>item.id!==entry.id);
 list.unshift({id:entry.id.slice(0,128),at:entry.at,pots:entry.pots,ruleset:entry.ruleset,room:entry.room,shot:entry.shot});
 list.sort((a,b)=>b.pots-a.pots||String(b.at).localeCompare(String(a.at)));
 return {...progress,highlights:list.slice(0,MAX_HIGHLIGHTS)};
}
export const validHighlights=list=>list===undefined||(Array.isArray(list)&&list.length<=MAX_HIGHLIGHTS&&
 list.every(h=>h&&typeof h.id==='string'&&h.id.length<=128&&typeof h.at==='string'&&Number.isInteger(h.pots)&&h.pots>=1&&h.pots<=15&&
  typeof h.ruleset==='string'&&h.ruleset.length<=16&&Number.isInteger(h.room)&&h.room>=0&&h.room<64&&typeof h.shot==='string'&&h.shot.length<=4000));
