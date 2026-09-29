// Plays many headless games and checks invariants after every shot.
import { newMatch, playShotNow } from '../src/game.js';
import { planNow, LEVELS } from '../src/ai.js';
import { rng, HALF_L, HALF_W } from '../src/table.js';
import { BALL_R } from '../src/table.js';
const kinds = ['eight', 'nine', 'onepocket', 'straight'];
const N = +process.argv[2] || 12;
let problems = 0, games = 0, shots = 0;
for (let g = 0; g < N; g++) {
  const kind = kinds[g % 4];
  const m = newMatch({ kind, seed: 900 + g, pocket: ['forgiving', 'standard', 'tournament'][g % 3], cloth: ['fast', 'standard', 'slow'][(g + 1) % 3] });
  const rand = rng(g + 77);
  const total = m.sim.balls.length;
  let n = 0;
  while (m.rules.winner == null && n < 250) {
    const lv = LEVELS[(g + n) % 3];
    const plan = planNow({ sim: m.sim, rules: m.rules, table: m.table, level: lv, rand });
    playShotNow(m, plan); n++; shots++;
    const on = m.sim.balls.filter((b) => !b.pocketed);
    const bad = [];
    for (const b of m.sim.balls) if (![b.x, b.y, b.vx, b.vy, b.wx, b.wy, b.wz].every(Number.isFinite)) bad.push(`NaN ball ${b.id}`);
    for (const b of on) if (Math.abs(b.x) > HALF_L + 0.01 || Math.abs(b.y) > HALF_W + 0.01) bad.push(`ball ${b.id} out at ${b.x.toFixed(3)},${b.y.toFixed(3)}`);
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) if (Math.hypot(on[i].x - on[j].x, on[i].y - on[j].y) < BALL_R * 2 - 0.004) bad.push(`overlap ${on[i].id}/${on[j].id}`);
    if (m.sim.balls.length !== total) bad.push('ball count changed');
    if (bad.length) { problems++; console.log(`${kind} game ${g} shot ${n}: ${bad.join('; ')}`); break; }
  }
  games++;
  if (m.rules.winner == null) { problems++; console.log(`${kind} game ${g} did not finish in ${n} shots; on table ${m.sim.balls.filter((b) => !b.pocketed).map((b) => b.id)} last ${m.log.slice(-2).map((r) => r.reasons.join())}`); }
}
console.log(`${games} games, ${shots} shots, ${problems} problems`);
