/** Seeded persona-vs-persona rack bench: node scripts/persona-bench.mjs [racks]
 * Reports wins, shots per rack and pot/foul rates so a persona's character
 * (and the Rookie < Vera/Club ordering) stays measurable. Production Game + planner. */
import {Game,chooseShot} from '../src/game.js';
import {chooseAiCuePlacement} from '../src/ai.js';
import {PERSONAS,PERSONA_ORDER,moodScale} from '../src/ai-personas.js';

export function playRack(seed,ids,{maxShots=140}={}){
 const game=new Game({kind:'match',players:'local',seed});
 const stats=ids.map(()=>({shots:0,pots:0,fouls:0}));
 for(let n=0;n<maxShots&&!game.over;n++){
  const persona=PERSONAS[ids[game.turn]],seat=game.turn;
  if(game.ballInHand){const p=chooseAiCuePlacement(game.sim,game.group,persona.tier,{kitchen:game.kitchen});if(p)game.placeCue(p.x,p.y);}
  const plan=game.break?{angle:0,power:.82}:chooseShot(game.sim,game.group,persona.tier,game.random,{persona,mood:1});
  if(!game.beginShot(plan.angle,plan.power))break;
  const shot=game.turnShot;let k=0;while(game.turnShot&&k++<9000)game.step();
  const ruling=game.history.at(-1);stats[seat].shots++;
  stats[seat].pots+=(shot?.pots?.length)||0;if(ruling?.result==='foul')stats[seat].fouls++;
 }
 return {winner:game.over?game.winner:null,shots:game.shots,stats};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const racks=Number(process.argv[2])||12;
 for(const a of PERSONA_ORDER)for(const b of PERSONA_ORDER){
  if(a>=b)continue;let wa=0,wb=0,none=0,shots=0,potsA=0,potsB=0,foulsA=0,foulsB=0,sa=0,sb=0;
  for(let i=0;i<racks;i++){
   const flip=i%2===1,ids=flip?[b,a]:[a,b],r=playRack(1000+i,ids);
   const ia=flip?1:0,ib=1-ia;
   if(r.winner===null)none++;else if(r.winner===ia)wa++;else wb++;
   shots+=r.shots;potsA+=r.stats[ia].pots;potsB+=r.stats[ib].pots;foulsA+=r.stats[ia].fouls;foulsB+=r.stats[ib].fouls;sa+=r.stats[ia].shots;sb+=r.stats[ib].shots;
  }
  console.log(`${a.padEnd(6)} vs ${b.padEnd(6)} wins ${wa}-${wb} (${none} unfinished) avg shots ${(shots/racks).toFixed(0)} | pots/shot ${(potsA/sa).toFixed(2)} vs ${(potsB/sb).toFixed(2)} | fouls/shot ${(foulsA/sa).toFixed(2)} vs ${(foulsB/sb).toFixed(2)}`);
 }
}
