// Pit two AI configurations against each other: node scripts/compare.mjs <games>
import { newMatch, playShotNow } from '../src/game.js';
import { planNow, LEVELS } from '../src/ai.js';
import { rng } from '../src/table.js';
const N = +process.argv[2] || 8;
const A = { ...LEVELS[2] };                    // with banks
const B = { ...LEVELS[2], banks: false };      // without
let aWins = 0, banksTaken = 0, shotsN = 0;
for (let g = 0; g < N; g++) {
  const kind = g % 2 ? 'nine' : 'eight';
  const aSeat = g % 2 === 0 ? 0 : 1;           // alternate who plays first
  const m = newMatch({ kind, seed: 4000 + g });
  const rand = rng(g + 9);
  let n = 0;
  while (m.rules.winner == null && n < 120) {
    const lv = m.rules.turn === aSeat ? A : B;
    const plan = planNow({ sim: m.sim, rules: m.rules, table: m.table, level: lv, rand });
    const before = m.stats[m.rules.turn].banks;
    const who = m.rules.turn;
    playShotNow(m, plan); n++; shotsN++;
    if (who === aSeat) banksTaken += m.stats[who].banks - before;
  }
  if (m.rules.winner === aSeat) aWins++;
  console.log(`game ${g} ${kind}: winner ${m.rules.winner === aSeat ? 'banks' : 'no-banks'} in ${n} shots`);
}
console.log(`with banks won ${aWins}/${N}; bank shots sunk by the bank-AI: ${banksTaken}`);
