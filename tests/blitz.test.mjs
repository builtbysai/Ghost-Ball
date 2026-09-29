import test from 'node:test';
import assert from 'node:assert/strict';
import { newBlitz, scoreShot, clearRack, multiplier, BLITZ_TIME, CLEAR_BONUS, CLEAR_TIME } from '../src/blitz.js';

const pot = (...ids) => ({ pocketed: ids, scratch: false });

test('the streak multiplier climbs every two potting shots and stops at x5', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20].map(multiplier), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5]);
});

test('potting builds a streak, a miss resets it, and multi-ball shots earn extra', () => {
  const b = newBlitz();
  assert.equal(scoreShot(b, pot(1)).points, 100);            // streak 1 -> x1
  assert.equal(scoreShot(b, pot(2)).points, 200);            // streak 2 -> x2
  assert.equal(scoreShot(b, pot(3, 4)).points, 2 * 100 * 2 + 50);   // streak 3 -> x2, two balls
  assert.equal(b.balls, 4);
  scoreShot(b, { pocketed: [], scratch: false });
  assert.equal(b.streak, 0);
  assert.equal(scoreShot(b, pot(5)).points, 100, 'the multiplier should start over after a miss');
  assert.equal(b.bestStreak, 3);
});

test('a scratch costs points and time, never drives the score negative, and ends the streak', () => {
  const b = newBlitz();
  scoreShot(b, pot(1));
  const r = scoreShot(b, { pocketed: [0], scratch: true });
  assert.equal(b.score, 0);
  assert.equal(r.points, -100);
  assert.equal(b.streak, 0);
  assert.equal(b.t, BLITZ_TIME - 3);
});

test('clearing the rack pays a bonus and adds time', () => {
  const b = newBlitz();
  b.t = 10;
  assert.equal(clearRack(b), CLEAR_BONUS);
  assert.equal(b.t, 10 + CLEAR_TIME);
  assert.equal(b.racks, 1);
});
