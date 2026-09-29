import test from 'node:test';
import assert from 'node:assert/strict';
import { newMatch, playShotNow } from '../src/game.js';
import { planNow, LEVELS } from '../src/ai.js';
import { rng } from '../src/table.js';

// The cue ball is boxed in: a ball sits against it on the line to the only legal target.
function snookered() {
  const m = newMatch({ kind: 'nine', seed: 5, setup: { cue: { x: -0.8, y: 0 }, balls: [{ id: 1, x: 0.4, y: 0.0 }, { id: 5, x: -0.68, y: 0.0 }, { id: 9, x: 0.9, y: 0.3 }] } });
  m.rules = { ...m.rules, breakShot: false, ballInHand: false, kitchen: false, turn: 0 };
  return m;
}

test('when snookered behind a blocker, the strong AI finds a legal shot instead of fouling', () => {
  let legal = 0;
  const N = 6;
  for (let i = 0; i < N; i++) {
    const m = snookered();
    const plan = planNow({ sim: m.sim, rules: m.rules, table: m.table, level: LEVELS[2], rand: rng(100 + i) });
    const res = playShotNow(m, plan);
    if (!res.foul) legal++;
  }
  assert.ok(legal >= 5, `only ${legal} of ${N} escapes were legal`);
});

test('the weakest AI is allowed to be less resourceful than the strongest from the same snooker', () => {
  const foulsFor = (lv) => {
    let f = 0;
    for (let i = 0; i < 6; i++) {
      const m = snookered();
      const plan = planNow({ sim: m.sim, rules: m.rules, table: m.table, level: LEVELS[lv], rand: rng(200 + i) });
      if (playShotNow(m, plan).foul) f++;
    }
    return f;
  };
  assert.ok(foulsFor(2) <= foulsFor(0), 'Champion should never foul more often than Rookie from the same snooker');
});
