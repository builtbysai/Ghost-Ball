import { newMatch, playShotNow } from '../src/game.js';
import { planNow, LEVELS } from '../src/ai.js';
import { rng } from '../src/table.js';

const [, , kind = 'eight', lvA = '1', lvB = '1', games = '3'] = process.argv;
for (let g = 0; g < +games; g++) {
  const m = newMatch({ kind, seed: 100 + g });
  const rand = rng(g + 5);
  const levels = [LEVELS[+lvA], LEVELS[+lvB]];
  let shots = 0, fouls = 0, maxPlan = 0, t0 = Date.now();
  while (m.rules.winner == null && shots < 200) {
    const level = levels[m.rules.turn];
    const p0 = Date.now();
    const plan = planNow({ sim: m.sim, rules: m.rules, table: m.table, level, rand });
    maxPlan = Math.max(maxPlan, Date.now() - p0);
    const res = playShotNow(m, plan);
    shots++; if (res.foul) fouls++;
  }
  console.log(`${kind} game ${g}: winner P${m.rules.winner} after ${shots} shots, ${fouls} fouls, ${m.rules.loseReason || ''} slowest plan ${maxPlan} ms, total ${Date.now() - t0} ms; left on table ${m.sim.balls.filter(b => !b.pocketed).length}`);
}
