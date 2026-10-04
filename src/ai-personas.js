/** Named CPU opponents. A persona never changes the rules or cheats; it changes
 * how the planner chooses and how it misses, so each opponent has a recognisable
 * way of playing. `tier` is the planner family (and what progress records see). */
export const PERSONAS=Object.freeze({
 rookie:Object.freeze({id:'rookie',name:'Rookie',tier:'rookie',initial:'R',
  blurb:'Friendly and still learning. Misses honestly, finishes racks.',
  style:'Steady',wobble:1,power:1,think:1.1,aggression:0,safety:0}),
 dex:Object.freeze({id:'dex',name:'Dex',tier:'rookie',initial:'D',
  blurb:'Fires at the hard ones, hard. Spectacular or a miss.',
  style:'Aggressive',wobble:1.25,power:1.16,think:.75,aggression:1,safety:0}),
 vera:Object.freeze({id:'vera',name:'Vera',tier:'club',initial:'V',
  blurb:'Patient. Plays safe and makes every mistake cost you.',
  style:'Safety player',wobble:.85,power:.95,think:1.5,aggression:0,safety:1}),
 club:Object.freeze({id:'club',name:'Club Pro',tier:'club',initial:'C',
  blurb:'Cold and accurate. Takes what the table gives.',
  style:'All-round',wobble:1,power:1,think:1.05,aggression:.3,safety:.3})
});
export const PERSONA_ORDER=Object.freeze(['rookie','dex','vera','club']);
export const personaFor=id=>PERSONAS[id]||PERSONAS.rookie;
/** Exhibition pairings rotate so repeated watching never shows the same match-up. */
export function exhibitionPair(index=0){
 const pairs=[['vera','dex'],['club','rookie'],['dex','club'],['vera','rookie'],['rookie','dex'],['club','vera']];
 return pairs[((index%pairs.length)+pairs.length)%pairs.length];
}
/** Casual-game dynamic difficulty: when the human is far behind the CPU
 * relaxes a little, when the human is far ahead it sharpens. `lead` is the
 * human's balls-remaining minus the CPU's (positive: the CPU is ahead). */
export function moodScale(lead=0){
 const t=Math.max(-3,Math.min(3,lead))/3;
 return 1+.32*t; // 0.68 (sharper) .. 1.32 (looser)
}
