import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, LESSONS, ALL_CHALLENGES, tryShot, stars } from '../src/challenges.js';
import { analyzeShot } from '../src/shotinfo.js';

test('every trick-shot challenge and lesson is solvable by its shipped solution', () => {
  for (const ch of ALL_CHALLENGES) {
    assert.ok(ch.solution, `${ch.id} has no solution`);
    const res = tryShot(ch, ch.solution);
    assert.equal(res.solved, true, `${ch.id} ${ch.name}: ${res.why}`);
  }
});

test('challenges that demand a technique are not solved by a plain hit at the object ball', () => {
  for (const id of ['c03', 'c04', 'c06', 'c07', 'c12', 'c13', 'c14', 'l4', 'l5']) {
    const ch = ALL_CHALLENGES.find((c) => c.id === id);
    const target = ch.setup.balls.find((b) => b.id === ch.objective.pot[0]);
    const plain = { angle: Math.atan2(target.y - ch.setup.cue.y, target.x - ch.setup.cue.x), speed: 2.4, a: 0, b: 0 };
    assert.equal(tryShot(ch, plain).solved, false, `${id} falls to a plain shot`);
  }
});

test('stars reward first-try solves', () => {
  assert.equal(stars(1), 3);
  assert.equal(stars(3), 2);
  assert.equal(stars(7), 1);
});

test('callouts: a bank is only a bank when a potted ball touches a cushion on its way in', () => {
  const ch = CHALLENGES.find((c) => c.id === 'c03');
  const res = tryShot(ch, ch.solution);
  const ids = res.m.log[0].tags.map((t) => t.id);
  assert.ok(ids.includes('BANK'), 'the bank challenge did not produce a BANK callout');
  const before = [{ id: 0, x: -0.5, y: 0 }, { id: 1, x: 0.5, y: 0 }];
  const direct = [{ type: 'cue', t: 0 }, { type: 'ball', a: 0, b: 1, t: 0.2, x: 0.47, y: 0 }, { type: 'pocket', id: 1, pocket: 1, t: 0.6 }];
  const railed = [...direct.slice(0, 2), { type: 'rail', id: 1, wall: 0, t: 0.4 }, direct[2]];
  const ok = { foul: false };
  const cueAfter = { x: 0, y: 0, pocketed: false };
  assert.ok(!analyzeShot({ events: direct, before, cueAfter, result: ok }).some((t) => t.id === 'BANK'));
  assert.ok(analyzeShot({ events: railed, before, cueAfter, result: ok }).some((t) => t.id === 'BANK'));
  assert.deepEqual(analyzeShot({ events: [], before: [], cueAfter: null, result: { foul: true } }), []);
});

test('the lessons teach in order and each carries coaching text', () => {
  assert.equal(LESSONS.length, 5);
  for (const l of LESSONS) assert.ok(l.coach && l.coach.length > 20, `${l.id} lacks coaching`);
  const power = LESSONS.find((l) => l.id === 'l2');
  const soft = tryShot(power, { ...power.solution, speed: 1.2 });
  assert.equal(soft.solved, false, 'the power lesson should refuse a soft shot');
});
