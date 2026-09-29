// The Daily Run layout. Everyone gets the same table on a given date: a
// nine-ball rack broken by the engine with seeded parameters, kept only if the
// 9 is still up, the cue ball survived and enough balls remain to make a run.

import { newMatch } from './game.js';
import { rackPositions, HEAD_X, rng } from './table.js';

export function dailyLayout(seed) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const m = newMatch({ kind: 'runout', seed: seed + attempt });
    const rand = rng(seed * 7 + attempt);
    const cue = m.sim.ball(0), apex = m.sim.ball(1);
    const ang = Math.atan2(apex.y - cue.y, apex.x - cue.x) + (rand() - 0.5) * 0.05;
    m.sim.strike(0, ang, 7.2 + rand() * 1.6, 0, 0.1);
    m.sim.runToRest(45);
    const cueB = m.sim.ball(0);
    const objs = m.sim.balls.filter((b) => !b.pocketed && b.id !== 0);
    if (cueB.pocketed || !objs.some((b) => b.id === 9) || objs.length < 5) continue;
    return { cue: { x: cueB.x, y: cueB.y }, balls: objs.map((b) => ({ id: b.id, x: b.x, y: b.y })) };
  }
  // extremely unlikely: fall back to the unbroken rack so the day is still playable
  return { cue: { x: HEAD_X, y: 0 }, balls: rackPositions('nine', seed).map((b) => ({ id: b.id, x: b.x, y: b.y })) };
}
