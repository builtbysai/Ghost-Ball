/** Named CPU opponents. A persona never changes the rules or cheats; it changes
 * how the planner chooses and how it misses, so each opponent has a recognisable
 * way of playing. `tier` is the planner family (and what progress records see). */
export const PERSONAS=Object.freeze({
 rookie:Object.freeze({id:'rookie',cue:'rental',name:'Rookie',tier:'rookie',initial:'R',
  blurb:'Friendly and still learning. Misses honestly, finishes racks.',
  style:'Steady',quips:{win:'Lucky rack! Rematch?',lose:'Nice one. I am still learning.'},wobble:1,power:1,think:1.1,aggression:0,safety:0,flair:0}),
 dex:Object.freeze({id:'dex',cue:'ember',name:'Dex',tier:'rookie',initial:'D',
  blurb:'Fires at the hard ones, hard. Spectacular or a miss.',
  style:'Aggressive',quips:{win:'Told you: go big.',lose:'Worth the risk. Run it back?'},wobble:1.25,power:1.16,think:.75,aggression:1,safety:0,flair:.5}),
 vera:Object.freeze({id:'vera',cue:'viridian',name:'Vera',tier:'club',initial:'V',
  blurb:'Patient. Plays safe and makes every mistake cost you.',
  style:'Safety player',quips:{win:'Patience pays.',lose:'Well played. I will be back.'},wobble:.85,power:.95,think:1.5,aggression:0,safety:1,flair:.1}),
 club:Object.freeze({id:'club',cue:'proline',name:'Club Pro',tier:'club',initial:'C',
  blurb:'Cold and accurate. Takes what the table gives.',
  style:'All-round',quips:{win:'Solid.',lose:'Clean. Again?'},wobble:1,power:1,think:1.05,aggression:.3,safety:.3,flair:.3}),
 ace:Object.freeze({id:'ace',cue:'showman',name:'Ace',tier:'club',initial:'A',
  blurb:'The showman. Banks, combinations and draw shots, on purpose.',
  style:'Trick shots',quips:{win:'And that, ladies and gentlemen, is how it is done.',lose:'You earned that one. Encore?'},wobble:.7,power:1,think:1.3,aggression:.6,safety:0,flair:1})
});
export const PERSONA_ORDER=Object.freeze(['rookie','dex','vera','club','ace']);
export const personaFor=id=>PERSONAS[id]||PERSONAS.rookie;
/** Exhibition pairings rotate so repeated watching never shows the same match-up. */
export function exhibitionPair(index=0){
 const pairs=[['ace','vera'],['vera','dex'],['club','rookie'],['ace','dex'],['dex','club'],['vera','rookie'],['rookie','dex'],['club','ace'],['club','vera']];
 return pairs[((index%pairs.length)+pairs.length)%pairs.length];
}
/** Casual-game dynamic difficulty: when the human is far behind the CPU
 * relaxes a little, when the human is far ahead it sharpens. `lead` is the
 * human's balls-remaining minus the CPU's (positive: the CPU is ahead). */
export function moodScale(lead=0){
 const t=Math.max(-3,Math.min(3,lead))/3;
 return 1+.32*t; // 0.68 (sharper) .. 1.32 (looser)
}
