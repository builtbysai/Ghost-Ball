import test from 'node:test';
import assert from 'node:assert/strict';
import { newMatch, playShotNow, beginShot, endShot } from '../src/game.js';
import { planNow, LEVELS } from '../src/ai.js';
import { rng } from '../src/table.js';
import { Sim } from '../src/physics.js';

function playOut(kind, seed, levels, cap = 150) {
  const m = newMatch({ kind, seed });
  const rand = rng(seed + 11);
  let shots = 0;
  while (m.rules.winner == null && shots < cap) {
    const plan = planNow({ sim: m.sim, rules: m.rules, table: m.table, level: levels[m.rules.turn], rand });
    playShotNow(m, plan);
    shots++;
  }
  return { m, shots };
}

test('AI vs AI finishes both games and never stalls or leaves an illegal table', () => {
  for (const kind of ['nine', 'eight']) {
    const lv = kind === 'eight' ? LEVELS[0] : LEVELS[1];
    const { m, shots } = playOut(kind, 21, [lv, lv]);
    assert.notEqual(m.rules.winner, null, `${kind} did not finish in ${shots} shots`);
    for (const b of m.sim.balls) {
      if (!b.pocketed) assert.ok(Math.abs(b.x) < 1.28 && Math.abs(b.y) < 0.64, `${kind}: ball ${b.id} off the table`);
    }
  }
});

test('the strongest level beats the weakest most of the time', () => {
  let champWins = 0;
  const N = 4;
  for (let i = 0; i < N; i++) {
    const { m } = playOut('nine', 300 + i, i % 2 === 0 ? [LEVELS[2], LEVELS[0]] : [LEVELS[0], LEVELS[2]]);
    const champSeat = i % 2 === 0 ? 0 : 1;
    if (m.rules.winner === champSeat) champWins++;
  }
  assert.ok(champWins >= 3, `Champion won only ${champWins}/${N}`);
});

test('replaying a shot from its recorded positions and parameters reproduces the result exactly', () => {
  const m = newMatch({ kind: 'eight', seed: 5 });
  const before = m.sim.balls.map((b) => ({ id: b.id, x: b.x, y: b.y }));
  const plan = { angle: 0.02, speed: 7.5, a: 0.2, b: 0.1 };
  beginShot(m, plan);
  m.sim.runToRest(45);
  const result = endShot(m);
  const replay = new Sim({ table: m.table, params: m.sim.params });
  for (const b of before) replay.addBall(b.id, b.x, b.y);
  replay.strike(0, plan.angle, plan.speed, plan.a, plan.b);
  replay.runToRest(45);
  assert.ok(result.pocketed.length >= 0);
  for (const b of m.sim.balls) {
    const r = replay.ball(b.id);
    assert.equal(r.pocketed, b.pocketed);
    if (!b.pocketed && !(b.id === 0 && result.scratch)) assert.ok(Math.abs(r.x - b.x) < 1e-9 && Math.abs(r.y - b.y) < 1e-9, `ball ${b.id} diverged`);
  }
});

test('a long match never cuts a shot short: each shot is timed from its own start, not the match clock', () => {
  const m = newMatch({ kind: 'eight', seed: 9 });
  m.sim.time = 500;                       // a match that has already run for a while
  beginShot(m, { angle: 0, speed: 3, a: 0, b: 0 });
  assert.equal(m.sim.shotStart, 500);
  m.sim.advance(m.sim.time + 0.05);
  assert.ok(m.sim.isMoving(), 'the cue ball should still be rolling');
  assert.ok(m.sim.time - m.sim.shotStart < 60);
});
